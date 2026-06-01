import { Router } from "express";
import { ZodError, z } from "zod";
import {
  runComplianceCheck,
  runBatchComplianceCheck,
  compareReports,
  FORMAL_REVIEW_NOTICE,
  DISCLAIMER_FOOTER
} from "../adsafe/complianceCheck.js";
import { VIOLATION_DICTIONARY, DICTIONARY_NOTICE } from "../adsafe/violationDictionary.js";
import { config } from "../utils/config.js";

export const adsafeRouter = Router();

// 점검 가능한 제품 유형(점검 카테고리) — false-ad 계열 룰을 그대로 재사용한다.
const SUPPORTED_PRODUCT_TYPES = [
  { moduleId: "false_ad", label: "건강기능식품" },
  { moduleId: "general_food_false_ad", label: "일반식품" },
  { moduleId: "cosmetic_false_ad", label: "화장품" },
  { moduleId: "medical_device_false_ad", label: "의료기기" }
];
const SUPPORTED_IDS = new Set(SUPPORTED_PRODUCT_TYPES.map((p) => p.moduleId));

function zodErrorMessage(err: ZodError): string {
  const issues =
    (err as unknown as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues ?? [];
  return issues.map((e) => `${(e.path ?? []).join(".") || "body"}: ${e.message}`).join("; ");
}

const CheckBodySchema = z
  .object({
    text: z.string().max(20000).optional(),
    title: z.string().max(1000).optional(),
    url: z.string().max(2000).optional(),
    moduleId: z.string().optional()
  })
  .refine((b) => (b.text && b.text.trim().length > 0) || (b.title && b.title.trim().length > 0), {
    message: "광고 문구(text 또는 title)를 입력하세요."
  });

const BatchBodySchema = z.object({
  moduleId: z.string().optional(),
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        text: z.string().max(20000).optional(),
        title: z.string().max(1000).optional(),
        url: z.string().max(2000).optional()
      })
    )
    .min(1)
    .max(500)
});

const CompareBodySchema = z.object({
  moduleId: z.string().optional(),
  previous: z.object({ text: z.string().optional(), title: z.string().optional(), url: z.string().optional() }),
  current: z.object({ text: z.string().optional(), title: z.string().optional(), url: z.string().optional() })
});

function resolveModuleId(moduleId?: string): string | null {
  if (!moduleId || !moduleId.trim()) return "false_ad";
  const id = moduleId.trim();
  return SUPPORTED_IDS.has(id) ? id : null;
}

// 점검 메타: 제품 유형 목록 + 정식 심의 비교 안내(C-1).
adsafeRouter.get("/info", (_req, res) => {
  res.json({
    ok: true,
    product: "AdSafe (애드세이프)",
    tagline: "게시 전 광고 위반 위험을 미리 점검하는 도구",
    productTypes: SUPPORTED_PRODUCT_TYPES,
    formalReviewNotice: FORMAL_REVIEW_NOTICE,
    batchMaxChecks: config.pipeline.maxAnalyses,
    disclaimerFooter: DISCLAIMER_FOOTER,
    notLegalConclusion: true,
    legalityGuaranteed: false,
    humanReviewRequired: true
  });
});

// C-3: 위반 표현 사전(라이브러리).
adsafeRouter.get("/dictionary", (_req, res) => {
  res.json({
    ok: true,
    notice: DICTIONARY_NOTICE,
    categories: VIOLATION_DICTIONARY,
    disclaimerFooter: DISCLAIMER_FOOTER
  });
});

// 단건 광고 사전점검.
adsafeRouter.post("/check", (req, res) => {
  try {
    const input = CheckBodySchema.parse(req.body);
    const moduleId = resolveModuleId(input.moduleId);
    if (!moduleId) {
      return res.status(400).json({
        ok: false,
        error: "UNSUPPORTED_PRODUCT_TYPE",
        message: `지원하지 않는 제품 유형입니다: ${input.moduleId}`
      });
    }
    const report = runComplianceCheck({
      text: input.text,
      title: input.title,
      url: input.url,
      moduleId
    });
    res.json({ ok: true, report });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ ok: false, error: "VALIDATION_ERROR", message: zodErrorMessage(error) });
    }
    res.status(500).json({ ok: false, error: "ADSAFE_CHECK_FAILED", message: (error as Error).message });
  }
});

// C-4: 배치 점검(여러 광고 문구 한 번에) — 비용 가드 적용.
adsafeRouter.post("/check/batch", (req, res) => {
  try {
    const input = BatchBodySchema.parse(req.body);
    const moduleId = resolveModuleId(input.moduleId);
    if (!moduleId) {
      return res.status(400).json({
        ok: false,
        error: "UNSUPPORTED_PRODUCT_TYPE",
        message: `지원하지 않는 제품 유형입니다: ${input.moduleId}`
      });
    }
    const result = runBatchComplianceCheck(input.items, {
      moduleId,
      maxChecks: config.pipeline.maxAnalyses
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ ok: false, error: "VALIDATION_ERROR", message: zodErrorMessage(error) });
    }
    res.status(500).json({ ok: false, error: "ADSAFE_BATCH_FAILED", message: (error as Error).message });
  }
});

// C-2: 변경 이력/재점검 — 이전 광고 문구 대비 위험 표현 감소 비교.
adsafeRouter.post("/compare", (req, res) => {
  try {
    const input = CompareBodySchema.parse(req.body);
    const moduleId = resolveModuleId(input.moduleId);
    if (!moduleId) {
      return res.status(400).json({
        ok: false,
        error: "UNSUPPORTED_PRODUCT_TYPE",
        message: `지원하지 않는 제품 유형입니다: ${input.moduleId}`
      });
    }
    const previous = runComplianceCheck({ ...input.previous, moduleId });
    const current = runComplianceCheck({ ...input.current, moduleId });
    const comparison = compareReports(previous, current);
    res.json({ ok: true, previous, current, comparison });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ ok: false, error: "VALIDATION_ERROR", message: zodErrorMessage(error) });
    }
    res.status(500).json({ ok: false, error: "ADSAFE_COMPARE_FAILED", message: (error as Error).message });
  }
});
