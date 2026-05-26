import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { OrchestratorAgent } from "../src/agents/OrchestratorAgent.js";
import { getOfficialReportingLinks } from "../src/policy/approvalGate.js";
import { validateReportCitations } from "../src/analysis/citationValidator.js";
import type { ReportClaim } from "../src/types/citationValidation.js";
import { maskText } from "../src/services/privacy/MaskingService.js";

/**
 * 일반식품 허위·과대광고 샘플 5건 완주 테스트 (체크리스트 35).
 *
 * - moduleId: general_food_false_ad 로 전체 흐름(수집→추출→일반식품 룰 탐지→점수→AI(mock)→
 *   증거→일반식품 신고서 초안→검토대기열→근거검증→개인정보스캔→공식 신고처 링크)을 검증한다.
 * - 목적은 신고 가능성 확정이 아니라 "시스템 흐름 검증"이다. 외부 신고기관 제출/접수번호 생성 없음.
 * - data/manual-tests/sample-urls-general-food.json 이 있으면 그 공개 URL 을, 없으면 로컬 합성 페이지를 쓴다.
 */

const MODULE_ID = "general_food_false_ad";
const OUT_DIR = path.resolve(process.cwd(), "data", "manual-tests");

interface SyntheticPage { slug: string; title: string; html: string; }
function page(slug: string, title: string, body: string): SyntheticPage {
  return { slug, title, html: `<!doctype html><html lang="ko"><head><title>${title}</title></head><body><main>${body}</main></body></html>` };
}

// 가상 일반식품 광고 (실제 업체/개인정보 없음). 4건은 위반 의심형, 1건은 정상형.
const SYNTHETIC_PAGES: SyntheticPage[] = [
  page("g1", "발효홍삼즙 (가상)",
    `<h1>발효홍삼즙 (가상)</h1><section>광고문구: 이 즙으로 당뇨 완치, 혈압약 대체 가능</section>
     <section>후기: 먹고 다 나았어요</section><section>성분: 홍삼농축액</section>
     <section>섭취방법: 1일 1포</section><section>주의사항: 냉장 보관</section><section>판매자: 가상몰</section>`),
  page("g2", "여주차 (가상)",
    `<h1>여주차 (가상)</h1><section>광고문구: 혈당 치료에 특효, 항암 효과 입증</section>
     <section>후기: 수치가 정상으로</section><section>성분: 여주분말</section>
     <section>섭취방법: 1일 2잔</section><section>주의사항: 임산부 상담</section><section>판매자: 가상스토어</section>`),
  page("g3", "디톡스주스 (가상)",
    `<h1>디톡스주스 (가상)</h1><section>광고문구: 3일 디톡스 완성, 독소 완전 배출, 무조건 빠지는 다이어트</section>
     <section>후기: 살이 쭉쭉</section><section>성분: 채소·과일 혼합</section>
     <section>섭취방법: 아침 공복</section><section>주의사항: 알레르기 주의</section><section>판매자: 가상주스</section>`),
  page("g4", "발효효소 (가상)",
    `<h1>발효효소 (가상)</h1><section>광고문구: 약 없이 회복, 염증 제거, 면역력 폭발</section>
     <section>후기: 컨디션 최고</section><section>성분: 곡물 발효효소</section>
     <section>섭취방법: 1일 1스푼</section><section>주의사항: 보관 주의</section><section>판매자: 가상효소</section>`),
  page("g5", "곡물미숫가루 (가상)",
    `<h1>곡물미숫가루 (가상)</h1><section>광고문구: 간편한 아침 식사 대용, 든든한 한 끼에 도움</section>
     <section>후기: 고소하고 맛있어요</section><section>성분: 현미·보리·콩</section>
     <section>섭취방법: 우유나 물에 타서</section><section>주의사항: 곡물 알레르기 주의</section><section>판매자: 가상곡물</section>`)
];

function startServer(pages: SyntheticPage[]): Promise<{ baseUrl: string; close: () => void }> {
  return new Promise((resolve) => {
    const map = new Map(pages.map((p) => [`/${p.slug}`, p]));
    const server = http.createServer((req, res) => {
      const p = map.get((req.url ?? "").split("?")[0]);
      if (!p) { res.statusCode = 404; res.end("not found"); return; }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(p.html);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ baseUrl: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

async function loadUrlList(): Promise<{ urls: string[]; mode: "real" | "synthetic" }> {
  try {
    const raw = await readFile(path.join(OUT_DIR, "sample-urls-general-food.json"), "utf8");
    const parsed = JSON.parse(raw) as { urls?: unknown };
    const urls = Array.isArray(parsed.urls) ? parsed.urls.filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u)) : [];
    if (urls.length > 0) return { urls: urls.slice(0, 20), mode: "real" };
  } catch { /* 합성 모드 */ }
  return { urls: [], mode: "synthetic" };
}

async function main(): Promise<void> {
  console.log("[test:general-food-sample] 일반식품 허위·과대광고 샘플 5건 완주 테스트 (시스템 흐름 검증, 법 위반 확정 아님)");
  await mkdir(OUT_DIR, { recursive: true });

  const { urls: realUrls, mode } = await loadUrlList();
  let server: { baseUrl: string; close: () => void } | null = null;
  let targets: string[];
  if (mode === "real") {
    targets = realUrls;
    console.log(`[test:general-food-sample] 실제 공개 URL ${targets.length}건 (사용자 제공)`);
  } else {
    server = await startServer(SYNTHETIC_PAGES);
    targets = SYNTHETIC_PAGES.map((p) => `${server!.baseUrl}/${p.slug}`);
    console.log(`[test:general-food-sample] 합성 샘플 ${targets.length}건 (로컬, 외부 네트워크 호출 없음)`);
  }

  const orchestrator = new OrchestratorAgent();
  const officialLinks = getOfficialReportingLinks(MODULE_ID);
  const results: any[] = [];
  const errors: string[] = [];

  for (const url of targets) {
    const r: any = {
      url, caseId: null, moduleId: MODULE_ID, extractionOk: false, detectionSummary: "", riskScore: null,
      priorityScore: null, analysisMode: null, usedExternalApi: null, evidenceCreated: false,
      reportDraftCreated: false, reportIsGeneralFood: false, queueRegistered: false, caseStatus: null,
      citationPassed: false, citationStatus: null, privacyPassed: false, privacyDetectedTypes: [],
      collectionStatus: null, error: null
    };
    try {
      const rc = await orchestrator.analyze({ url, moduleId: MODULE_ID, memo: "general-food sample test (테스트 목적, 실제 제출 없음)" });
      r.caseId = rc.id;
      r.caseStatus = rc.status;
      r.collectionStatus = rc.collection?.status ?? null;
      r.extractionOk = Boolean(rc.extraction);
      r.riskScore = rc.ruleDetection?.riskScore ?? null;
      r.priorityScore = rc.scoringResult?.priorityScore ?? rc.score ?? null;
      r.analysisMode = rc.llmAnalysis?.analysisMode ?? null;
      r.usedExternalApi = rc.llmAnalysis?.usedExternalApi ?? null;
      const counts = rc.ruleDetection?.counts ?? {};
      r.detectionSummary = `HIGH ${counts.HIGH ?? 0}/MED ${counts.MEDIUM ?? 0}/LOW ${counts.LOW ?? 0}, matches ${rc.ruleDetection?.matches?.length ?? 0}`;
      r.evidenceCreated = Boolean(rc.evidence);
      r.reportDraftCreated = Boolean(rc.reportPath && rc.reportPath.length > 0);
      r.queueRegistered = ["DRAFT", "REVIEW", "NEEDS_MORE_INFO"].includes(rc.status);

      // 신고서 초안이 일반식품 템플릿으로 생성됐는지 확인
      let reportText = `${rc.title}\n${rc.summary}\n${rc.aiFinding?.summary ?? ""}`;
      try {
        if (rc.reportPath) {
          const body = await readFile(rc.reportPath, "utf8");
          reportText += "\n" + body;
          r.reportIsGeneralFood = /일반식품 온라인 허위·과대광고 신고 후보/.test(body);
        }
      } catch { /* 무시 */ }

      // 근거 검증 (증거 ID 강한 근거)
      const claims: ReportClaim[] = [
        { claimId: `${rc.id}#suspect`, text: "일반식품 광고에 의심 문구 존재(검토 필요)", kind: "core", section: "claim", citations: [{ type: "evidence_id", evidenceId: rc.id }] },
        { claimId: `${rc.id}#evidence`, text: "증거 패키지 생성·보관됨", kind: "core", section: "evidence", citations: [{ type: "evidence_id", evidenceId: rc.id }] },
        { claimId: `${rc.id}#score`, text: `우선순위 점수 ${r.priorityScore ?? "?"} 검토 후보`, kind: "computed", section: "score", citations: [{ type: "computed_model", label: "모델 계산 결과 (검토 신호)" }] },
        { claimId: `${rc.id}#disclaimer`, text: "법 위반 확정 아님, 사람 검토 필요", kind: "disclaimer", section: "disclaimer", citations: [] }
      ];
      const cv = validateReportCitations(claims, { mode: "strict" });
      r.citationStatus = cv.status;
      r.citationPassed = cv.status === "pass";

      // 개인정보 스캔
      const masked = maskText(reportText, { enabled: true });
      r.privacyDetectedTypes = Object.keys(masked.byType);
      const HIGH = ["API_KEY", "TOKEN", "AUTH_HEADER", "COOKIE", "KOREAN_RRN", "EMAIL", "PHONE"];
      r.privacyPassed = !r.privacyDetectedTypes.some((t: string) => HIGH.includes(t));
    } catch (error) {
      r.error = (error as Error).message;
      errors.push(`${url}: ${r.error}`);
    }
    results.push(r);
  }

  if (server) server.close();

  const total = results.length;
  const caseCreated = results.filter((r) => r.caseId).length;
  const evidenceOk = results.filter((r) => r.evidenceCreated).length;
  const reportOk = results.filter((r) => r.reportDraftCreated).length;
  const reportGfOk = results.filter((r) => r.reportIsGeneralFood).length;
  const queueOk = results.filter((r) => r.queueRegistered).length;
  const citationOk = results.filter((r) => r.citationPassed).length;
  const privacyOk = results.filter((r) => r.privacyPassed).length;
  const extractionOk = results.filter((r) => r.extractionOk).length;
  const failureCount = results.filter((r) => r.error).length;

  const improvements: string[] = [];
  if (caseCreated < total) improvements.push(`Case 생성 실패 ${total - caseCreated}건 — 수집/추출 점검 필요`);
  if (reportGfOk < reportOk) improvements.push("일부 신고서 초안이 일반식품 템플릿으로 인식되지 않음 — 템플릿 분기 점검");
  if (results.some((r) => r.collectionStatus === "fallback")) improvements.push("일부 URL 수집 fallback — 사람이 페이지 직접 확인 필요");

  let verdict: "PASS" | "PASS_WITH_WARNINGS" | "NEEDS_FIX" | "BLOCKED";
  const reasons: string[] = [];
  if (caseCreated === total && reportOk === total && reportGfOk === total && evidenceOk === total && citationOk === total && privacyOk === total) {
    verdict = "PASS";
    reasons.push("5건 모두 Case·일반식품 신고서 초안·증거·근거검증·개인정보스캔 통과.");
  } else if (caseCreated >= Math.ceil(total * 0.8) && reportOk >= Math.ceil(total * 0.8)) {
    verdict = "PASS_WITH_WARNINGS";
    reasons.push("대부분 검토 가능 상태이나 일부 단계 보완 필요.");
  } else {
    verdict = "NEEDS_FIX";
    reasons.push("Case 또는 신고서 초안 생성 성공률이 기준 미만.");
  }

  const testRunId = `gftest_${new Date().toISOString().replace(/[:.]/g, "-")}_${Math.random().toString(36).slice(2, 8)}`;
  const report = {
    testRunId, testedAt: new Date().toISOString(), moduleId: MODULE_ID, mode,
    purpose: "시스템 흐름 검증 (신고 가능성 확정 아님, 법 위반 확정 아님)",
    totalUrls: total, successCount: caseCreated, failureCount,
    summary: { extractionOk, caseCreated, evidenceOk, reportOk, reportGeneralFoodTemplate: reportGfOk, queueOk, citationOk, privacyOk },
    officialReportingLinks: officialLinks.map((l) => ({ agencyId: l.agencyId, agencyName: l.agencyName, url: l.url })),
    autoSubmitObserved: false, autoReport: false, humanReviewRequired: true,
    verdict, verdictReasons: reasons, improvements, errors, results,
    safetyNotice: "본 테스트는 시스템 흐름 검증용입니다. 외부 신고기관에 제출하지 않았고 접수번호를 만들지 않았습니다. 결과는 법 위반 확정이 아니며 포상금 수령을 보장하지 않습니다."
  };

  const mdLines: string[] = [];
  mdLines.push(`# 일반식품 샘플 테스트 결과 — ${testRunId}`);
  mdLines.push("");
  mdLines.push(`- moduleId: ${MODULE_ID} / 모드: ${mode} / 목적: ${report.purpose}`);
  mdLines.push(`- 총 URL: ${total} / Case 생성: ${caseCreated} / 실패: ${failureCount}`);
  mdLines.push(`- **판정: ${verdict}** — ${reasons.join(" ")}`);
  mdLines.push("");
  mdLines.push(`| # | caseId | 추출 | 위험점수 | 우선순위 | AI모드 | 증거 | 초안 | 일반식품템플릿 | 대기열 | 근거검증 | 개인정보 | 오류 |`);
  mdLines.push(`|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
  results.forEach((x, i) => mdLines.push(`| ${i + 1} | ${x.caseId ?? "-"} | ${x.extractionOk ? "O" : "X"} | ${x.riskScore ?? "-"} | ${x.priorityScore ?? "-"} | ${x.analysisMode ?? "-"} | ${x.evidenceCreated ? "O" : "X"} | ${x.reportDraftCreated ? "O" : "X"} | ${x.reportIsGeneralFood ? "O" : "X"} | ${x.queueRegistered ? "O" : "X"} | ${x.citationPassed ? "pass" : (x.citationStatus ?? "X")} | ${x.privacyPassed ? "O" : "주의"} | ${x.error ?? "-"} |`));
  mdLines.push("");
  mdLines.push("## 공식 신고처 링크 (단순 안내, 자동 제출 없음)");
  for (const l of report.officialReportingLinks) mdLines.push(`- ${l.agencyName}: ${l.url}`);
  mdLines.push("");
  mdLines.push(`> ${report.safetyNotice}`);
  mdLines.push(`> 자동신고 없음 · 사람 검토 필수 · 실제 신고는 사용자가 직접 · 포상금 보장 아님`);

  const jsonPath = path.join(OUT_DIR, `${testRunId}.json`);
  const mdPath = path.join(OUT_DIR, `${testRunId}.md`);
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(mdPath, mdLines.join("\n"), "utf8");

  console.log(`\n[test:general-food-sample] 판정: ${verdict}`);
  console.log(`[test:general-food-sample] Case ${caseCreated}/${total}, 신고서초안 ${reportOk}/${total}(일반식품템플릿 ${reportGfOk}/${total}), 증거 ${evidenceOk}/${total}, 근거검증 ${citationOk}/${total}, 개인정보스캔 ${privacyOk}/${total}, 대기열 ${queueOk}/${total}`);
  console.log(`[test:general-food-sample] 리포트: ${jsonPath}`);
  console.log("GENERAL_FOOD_SAMPLE_TEST_DONE");
}

main().catch((e) => {
  console.error("GENERAL_FOOD_SAMPLE_TEST_FAIL", e);
  process.exit(1);
});
