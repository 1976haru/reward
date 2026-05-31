#!/usr/bin/env node
/**
 * 개인정보 최소수집 정적 검사 (체크리스트 5).
 *
 * README, docs/, src/, public/, tests/, scripts/ 안에서
 * 원문 개인정보가 사용자 노출 가능 위치에 남아 있는지 검사한다.
 *
 * 통과 조건 (false-positive 방지):
 *   1) FILE_WHITELIST 에 등록된 정책 문서 / 정의 코드 / 테스트 / 마스킹 정의는 스캔 제외
 *   2) 이메일은 RFC 2606 예약 도메인 (.example/.test/.invalid + example.com/.org/.net) /
 *      공공기관 (.go.kr/.gov.kr) / 잘 알려진 개발 도메인 (github.com/anthropic.com/openai.com 등) 화이트리스트
 *   3) 휴대폰/RRN/계좌 키워드 컨텍스트는 정책 문서 / 테스트 / 마스킹 정의에서만 등장 허용
 *
 * 위반 발견 시 exit code 1.
 *
 * ESM module 로도 사용 가능 (test:privacy 가 사용):
 *   - FORBIDDEN_PATTERNS, FILE_WHITELIST, EMAIL_DOMAIN_WHITELIST
 *   - checkText(text, options) → { ok, findings[] }
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const SCAN_DIRS = ["docs", "src", "public", "tests", "scripts"];
const SCAN_FILES = ["README.md"];
const SCAN_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".html",
  ".css",
  ".md",
  ".json",
  ".jsonl"
]);

// 검출 패턴 — 단정적인 원문 개인정보 패턴
export const FORBIDDEN_PATTERNS = [
  {
    // 하이픈 필수 — URL 의 13자리 ID 같은 false-positive 방지
    type: "resident_registration_number",
    re: /\b\d{6}-\d{7}\b/g,
    description: "주민등록번호로 보이는 13자리 숫자 패턴 (하이픈 포함)"
  },
  {
    type: "phone_number",
    re: /\b01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}\b/g,
    description: "한국 휴대폰번호 패턴"
  },
  {
    type: "email",
    re: /([A-Za-z0-9._%+\-]+)@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})/g,
    description: "이메일 주소"
  },
  {
    type: "bank_account_with_context",
    re: /(계좌(?:번호)?|국민은행|우리은행|신한은행|하나은행|농협은행|기업은행|카카오뱅크|토스뱅크|케이뱅크)\s*[:：]?\s*\d{2,6}[-\s]\d{2,6}[-\s]\d{2,8}/gu,
    description: "계좌 키워드 + 숫자 패턴"
  },
  {
    type: "sensitive_keyword",
    re: /(건강정보|진단명|의료기록|처방전|병력|범죄경력|전과기록|정치적\s*견해|노동조합\s*가입|성생활|성적\s*지향)/gu,
    description: "민감정보 키워드"
  }
];

// 이메일 도메인 화이트리스트 (개발/공공/예약 도메인)
export const EMAIL_DOMAIN_WHITELIST = [
  // RFC 2606 / 6761 예약
  "example.com",
  "example.org",
  "example.net",
  "example.test",
  "example.invalid",
  // 공공 기관
  ".go.kr",
  ".gov.kr",
  // 개발/오픈소스
  "anthropic.com",
  "openai.com",
  "github.com",
  "googleapis.com",
  "noreply.github.com",
  // 본 프로젝트 도메인
  "yourdomain.com",
  "yourdomain.test"
];

// 이메일 로컬파트(@ 앞)가 시스템성/일반 키워드면 화이트리스트
const EMAIL_LOCALPART_WHITELIST = new Set([
  "noreply",
  "no-reply",
  "support",
  "info",
  "admin",
  "contact",
  "hello",
  "team",
  "test"
]);

// 화이트리스트 파일 — 정책 문서 / 마스킹 정의 / 테스트 / 검사기 자신
export const FILE_WHITELIST = new Set([
  // 본 정책 문서들 (예시값 포함)
  "docs/privacy_policy.md",
  "docs/OPERATING_POLICY.md",
  "docs/LEGAL_REVIEW.md",
  "docs/REPORT_LANGUAGE_GUIDE.md",
  "docs/approval_gate.md",
  "docs/report_draft.md",
  "docs/analyzer_agent.md",
  "docs/scoring_agent.md",
  "docs/rule_agent.md",
  "docs/subsidy_module.md",
  "docs/agency_config_schema.md",
  "docs/trace_log.md",
  "docs/feedback_db.md",
  // 정책/마스킹 정의 코드
  "src/policy/privacyGuard.ts",
  "src/policy/approvalGate.ts",
  "src/types/privacy.ts",
  "src/services/privacy/MaskingService.ts",
  "src/services/privacy/SensitiveDataDetector.ts",
  "src/services/privacy/PrivacyScanService.ts",
  "src/services/privacy/RetentionPolicy.ts",
  // 검사기 / 테스트 (의도적으로 패턴/원문 포함)
  "scripts/check-privacy-policy.js",
  "scripts/check-language-policy.js",
  "scripts/check-approval-gate.js",
  "tests/privacyGuard.test.ts",
  "tests/privacyGuard.test.js",
  "tests/languagePolicy.test.ts",
  "tests/approvalGate.test.ts",
  // 수집기 마스킹 검증 테스트 — 의도적으로 샘플 PII 픽스처 포함
  "tests/publicDataApiCollector.test.ts",
  // 업로드 파서 — 마스킹 검증용 합성 PII fixture 생성기/테스트
  "tests/fixtures/createUploadParserFixtures.ts",
  "tests/uploadSubsidyParser.test.ts",
  // 주소 정규화 — 마스킹 검증용 합성 전화번호 포함
  "tests/addressNormalizer.test.ts",
  // 데이터 기준선 — 마스킹 검증용 합성 PII fixture/테스트
  "tests/fixtures/createBaselineFixtures.ts",
  "tests/dataBaselineQuality.test.ts",
  // 반복 수급 룰 — 마스킹 검증용 합성 PII fixture/테스트
  "tests/fixtures/createRepeatRiskFixtures.ts",
  "tests/repeatSubsidyRiskRule.test.ts",
  // 동일 주소 다수 단체 룰 — 마스킹 검증용 합성 PII fixture/테스트
  "tests/fixtures/createAddressClusterRiskFixtures.ts",
  "tests/addressClusterRiskRule.test.ts",
  // 결과물/정산 룰 — 마스킹 검증용 합성 PII fixture/테스트
  "tests/fixtures/createOutputSettlementRiskFixtures.ts",
  "tests/outputSettlementRiskRule.test.ts",
  // 예산 집행 이상 패턴 룰 — 마스킹 검증용 합성 PII fixture/테스트
  "tests/fixtures/createSpendingAnomalyRiskFixtures.ts",
  "tests/spendingAnomalyRiskRule.test.ts",
  // 보조금 룰 5종 통합 — 마스킹 검증용 합성 PII 테스트 (체크리스트 60)
  "tests/subsidyRiskRules.test.ts",
  // 신고 전 사실점검 11항목 — 합성 PII 미포함 검증용 테스트 (체크리스트 65)
  "tests/subsidyPreReportFactCheck.test.ts",
  // 보조금 신고서 초안 — 합성 PII 미포함 검증용 테스트 (체크리스트 66)
  "tests/subsidyReportDraft.test.ts",
  // 모듈 분석 프롬프트 / 평가셋 (의도적 픽스처)
  "src/modules/false-ad/analysis_prompt.md",
  "src/modules/false-ad/agency_config.json",
  "src/scripts/smoke-test.ts",
  // 통합 적대적 스트레스 테스트 — 마스킹/탐지 검증용 합성 PII(예약 도메인·가짜 번호) 의도적 포함
  "scripts/stress-test.ts",
  // 마스킹/추출 기능 자체의 예시 코드/문서 (의도적으로 샘플 PII 포함)
  "docs/text_extractor.md",
  "src/services/TextExtractor.ts"
]);

function isEmailWhitelisted(local, domain) {
  const d = (domain ?? "").toLowerCase();
  for (const allow of EMAIL_DOMAIN_WHITELIST) {
    if (allow.startsWith(".")) {
      if (d.endsWith(allow)) return true;
    } else if (d === allow || d.endsWith("." + allow)) {
      return true;
    }
  }
  if (EMAIL_LOCALPART_WHITELIST.has((local ?? "").toLowerCase())) return true;
  return false;
}

/**
 * 단일 텍스트에 금지 개인정보 패턴이 있는지 검사.
 *
 * @param {string} text
 * @param {{ skipWhitelistedEmails?: boolean, file?: string }} [options]
 * @returns {{ ok: boolean, findings: Array<{ type: string, lineNo: number, snippet: string, file?: string }> }}
 */
export function checkText(text, options = {}) {
  const { skipWhitelistedEmails = true, file = "(inline)" } = options;
  if (typeof text !== "string") {
    return { ok: false, findings: [{ type: "invalid_input", lineNo: 0, snippet: String(text).slice(0, 80), file }] };
  }
  const findings = [];
  for (const { type, re } of FORBIDDEN_PATTERNS) {
    const fresh = new RegExp(re.source, re.flags);
    let m;
    while ((m = fresh.exec(text)) !== null) {
      if (type === "email" && skipWhitelistedEmails) {
        const local = m[1];
        const domain = m[2];
        if (isEmailWhitelisted(local, domain)) continue;
      }
      const idx = m.index;
      const lineNo = text.slice(0, idx).split(/\r?\n/).length;
      const lineText = text.split(/\r?\n/)[lineNo - 1] ?? "";
      findings.push({
        type,
        lineNo,
        snippet: lineText.trim().slice(0, 200),
        file
      });
    }
  }
  return { ok: findings.length === 0, findings };
}

// --- CLI 동작 ---

const findingsAll = [];

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
      await walk(full);
    } else if (SCAN_EXTS.has(path.extname(e.name))) {
      await scanFile(full);
    }
  }
}

async function scanFile(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, "/");
  if (FILE_WHITELIST.has(rel)) return;
  let content;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return;
  }
  const result = checkText(content, { skipWhitelistedEmails: true, file: rel });
  if (!result.ok) {
    for (const f of result.findings) {
      findingsAll.push({ ...f, file: rel });
    }
  }
}

async function isModuleEntry() {
  try {
    const argv1 = process.argv[1] ? path.resolve(process.argv[1]) : "";
    const meta = fileURLToPath(import.meta.url);
    return argv1 === meta;
  } catch {
    return false;
  }
}

async function runCli() {
  for (const f of SCAN_FILES) {
    const abs = path.join(ROOT, f);
    try {
      const s = await stat(abs);
      if (s.isFile()) await scanFile(abs);
    } catch {
      /* missing file OK */
    }
  }
  for (const d of SCAN_DIRS) {
    const abs = path.join(ROOT, d);
    try {
      const s = await stat(abs);
      if (s.isDirectory()) await walk(abs);
    } catch {
      /* missing dir OK */
    }
  }
  if (findingsAll.length === 0) {
    console.log("CHECK_PRIVACY_OK — no raw personal data patterns detected in user-facing text.");
    process.exit(0);
  }
  console.error("CHECK_PRIVACY_FAIL — found raw personal data patterns:");
  for (const f of findingsAll) {
    console.error(` - ${f.file}:${f.lineNo}  [${f.type}]  → ${f.snippet}`);
  }
  process.exit(1);
}

if (await isModuleEntry()) {
  runCli().catch((e) => {
    console.error("check-privacy-policy.js failed:", e);
    process.exit(2);
  });
}
