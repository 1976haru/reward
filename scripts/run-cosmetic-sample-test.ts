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
 * 화장품 허위·과대광고 샘플 5건 완주 테스트 (체크리스트 39).
 *
 * - moduleId: cosmetic_false_ad 로 전체 흐름(수집→추출→화장품 룰 탐지→점수→AI(mock)→
 *   증거→화장품 신고서 초안→검토대기열→근거검증→개인정보스캔→공식 신고처 링크)을 검증한다.
 * - 목적은 신고 가능성 확정이 아니라 "시스템 흐름 검증"이다. 외부 신고기관 제출/접수번호 생성 없음.
 * - data/manual-tests/sample-urls-cosmetic.json 이 있으면 그 공개 URL 을, 없으면 로컬 합성 페이지를 쓴다.
 */

const MODULE_ID = "cosmetic_false_ad";
const OUT_DIR = path.resolve(process.cwd(), "data", "manual-tests");

interface SyntheticPage { slug: string; title: string; html: string; }
function page(slug: string, title: string, body: string): SyntheticPage {
  return { slug, title, html: `<!doctype html><html lang="ko"><head><title>${title}</title></head><body><main>${body}</main></body></html>` };
}

// 가상 화장품 광고 (실제 업체/개인정보 없음). 4건은 위반 의심형, 1건은 정상형.
const SYNTHETIC_PAGES: SyntheticPage[] = [
  page("c1", "리페어크림 (가상)",
    `<h1>리페어크림 (가상)</h1><section>광고문구: 이 크림으로 아토피 치료, 의약품 수준 효능</section>
     <section>후기: 발진이 사라졌어요</section><section>성분: 판테놀</section>
     <section>사용방법: 1일 2회</section><section>주의사항: 패치 테스트 권장</section><section>판매자: 가상몰</section>`),
  page("c2", "안티링클세럼 (가상)",
    `<h1>안티링클세럼 (가상)</h1><section>광고문구: 주름 완전 제거, 바르기만 하면 즉시 제거</section>
     <section>후기: 동안 됐어요</section><section>성분: 레티놀</section>
     <section>사용방법: 저녁 1회</section><section>주의사항: 자외선 주의</section><section>판매자: 가상스토어</section>`),
  page("c3", "스칼프토닉 (가상)",
    `<h1>스칼프토닉 (가상)</h1><section>광고문구: 탈모 치료, 발모 효과 100% 보장</section>
     <section>후기: 머리가 났어요</section><section>성분: 비오틴</section>
     <section>사용방법: 두피에 분사</section><section>주의사항: 눈 닿지 않게</section><section>판매자: 가상헤어</section>`),
  page("c4", "스팟크림 (가상)",
    `<h1>스팟크림 (가상)</h1><section>광고문구: 여드름 치료, 흉터 완전 제거, 세포 재생</section>
     <section>후기: 자국이 없어졌어요</section><section>성분: 시카</section>
     <section>사용방법: 국소 도포</section><section>주의사항: 건조 주의</section><section>판매자: 가상스킨</section>`),
  page("c5", "수분크림 (가상)",
    `<h1>수분크림 (가상)</h1><section>광고문구: 수분을 가득 채워주는 데일리 보습 크림, 산뜻한 마무리</section>
     <section>후기: 촉촉하고 좋아요</section><section>성분: 히알루론산</section>
     <section>사용방법: 아침저녁 마지막 단계</section><section>주의사항: 직사광선 피해 보관</section><section>판매자: 가상뷰티</section>`)
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
    const raw = await readFile(path.join(OUT_DIR, "sample-urls-cosmetic.json"), "utf8");
    const parsed = JSON.parse(raw) as { urls?: unknown };
    const urls = Array.isArray(parsed.urls) ? parsed.urls.filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u)) : [];
    if (urls.length > 0) return { urls: urls.slice(0, 20), mode: "real" };
  } catch { /* 합성 모드 */ }
  return { urls: [], mode: "synthetic" };
}

async function main(): Promise<void> {
  console.log("[test:cosmetic-sample] 화장품 허위·과대광고 샘플 5건 완주 테스트 (시스템 흐름 검증, 법 위반 확정 아님)");
  await mkdir(OUT_DIR, { recursive: true });

  const { urls: realUrls, mode } = await loadUrlList();
  let server: { baseUrl: string; close: () => void } | null = null;
  let targets: string[];
  if (mode === "real") {
    targets = realUrls;
    console.log(`[test:cosmetic-sample] 실제 공개 URL ${targets.length}건 (사용자 제공)`);
  } else {
    server = await startServer(SYNTHETIC_PAGES);
    targets = SYNTHETIC_PAGES.map((p) => `${server!.baseUrl}/${p.slug}`);
    console.log(`[test:cosmetic-sample] 합성 샘플 ${targets.length}건 (로컬, 외부 네트워크 호출 없음)`);
  }

  const orchestrator = new OrchestratorAgent();
  const officialLinks = getOfficialReportingLinks(MODULE_ID);
  const results: any[] = [];
  const errors: string[] = [];

  for (const url of targets) {
    const r: any = {
      url, caseId: null, moduleId: MODULE_ID, extractionOk: false, detectionSummary: "", riskScore: null,
      priorityScore: null, analysisMode: null, usedExternalApi: null, evidenceCreated: false,
      reportDraftCreated: false, reportIsCosmetic: false, queueRegistered: false, caseStatus: null,
      citationPassed: false, citationStatus: null, privacyPassed: false, privacyDetectedTypes: [],
      collectionStatus: null, error: null
    };
    try {
      const rc = await orchestrator.analyze({ url, moduleId: MODULE_ID, memo: "cosmetic sample test (테스트 목적, 실제 제출 없음)" });
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

      let reportText = `${rc.title}\n${rc.summary}\n${rc.aiFinding?.summary ?? ""}`;
      try {
        if (rc.reportPath) {
          const body = await readFile(rc.reportPath, "utf8");
          reportText += "\n" + body;
          r.reportIsCosmetic = /화장품 온라인 허위·과대광고 신고 후보/.test(body);
        }
      } catch { /* 무시 */ }

      const claims: ReportClaim[] = [
        { claimId: `${rc.id}#suspect`, text: "화장품 광고에 의심 문구 존재(검토 필요)", kind: "core", section: "claim", citations: [{ type: "evidence_id", evidenceId: rc.id }] },
        { claimId: `${rc.id}#evidence`, text: "증거 패키지 생성·보관됨", kind: "core", section: "evidence", citations: [{ type: "evidence_id", evidenceId: rc.id }] },
        { claimId: `${rc.id}#score`, text: `우선순위 점수 ${r.priorityScore ?? "?"} 검토 후보`, kind: "computed", section: "score", citations: [{ type: "computed_model", label: "모델 계산 결과 (검토 신호)" }] },
        { claimId: `${rc.id}#disclaimer`, text: "법 위반 확정 아님, 사람 검토 필요", kind: "disclaimer", section: "disclaimer", citations: [] }
      ];
      const cv = validateReportCitations(claims, { mode: "strict" });
      r.citationStatus = cv.status;
      r.citationPassed = cv.status === "pass";

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
  const reportCmOk = results.filter((r) => r.reportIsCosmetic).length;
  const queueOk = results.filter((r) => r.queueRegistered).length;
  const citationOk = results.filter((r) => r.citationPassed).length;
  const privacyOk = results.filter((r) => r.privacyPassed).length;
  const extractionOk = results.filter((r) => r.extractionOk).length;
  const failureCount = results.filter((r) => r.error).length;

  const improvements: string[] = [];
  if (caseCreated < total) improvements.push(`Case 생성 실패 ${total - caseCreated}건 — 수집/추출 점검 필요`);
  if (reportCmOk < reportOk) improvements.push("일부 신고서 초안이 화장품 템플릿으로 인식되지 않음 — 템플릿 분기 점검");
  if (results.some((r) => r.collectionStatus === "fallback")) improvements.push("일부 URL 수집 fallback — 사람이 페이지 직접 확인 필요");

  let verdict: "PASS" | "PASS_WITH_WARNINGS" | "NEEDS_FIX" | "BLOCKED";
  const reasons: string[] = [];
  if (caseCreated === total && reportOk === total && reportCmOk === total && evidenceOk === total && citationOk === total && privacyOk === total) {
    verdict = "PASS";
    reasons.push("5건 모두 Case·화장품 신고서 초안·증거·근거검증·개인정보스캔 통과.");
  } else if (caseCreated >= Math.ceil(total * 0.8) && reportOk >= Math.ceil(total * 0.8)) {
    verdict = "PASS_WITH_WARNINGS";
    reasons.push("대부분 검토 가능 상태이나 일부 단계 보완 필요.");
  } else {
    verdict = "NEEDS_FIX";
    reasons.push("Case 또는 신고서 초안 생성 성공률이 기준 미만.");
  }

  const testRunId = `cmtest_${new Date().toISOString().replace(/[:.]/g, "-")}_${Math.random().toString(36).slice(2, 8)}`;
  const report = {
    testRunId, testedAt: new Date().toISOString(), moduleId: MODULE_ID, mode,
    purpose: "시스템 흐름 검증 (신고 가능성 확정 아님, 법 위반 확정 아님)",
    totalUrls: total, successCount: caseCreated, failureCount,
    summary: { extractionOk, caseCreated, evidenceOk, reportOk, reportCosmeticTemplate: reportCmOk, queueOk, citationOk, privacyOk },
    officialReportingLinks: officialLinks.map((l) => ({ agencyId: l.agencyId, agencyName: l.agencyName, url: l.url })),
    autoSubmitObserved: false, autoReport: false, humanReviewRequired: true,
    verdict, verdictReasons: reasons, improvements, errors, results,
    safetyNotice: "본 테스트는 시스템 흐름 검증용입니다. 외부 신고기관에 제출하지 않았고 접수번호를 만들지 않았습니다. 결과는 법 위반 확정이 아니며 포상금 수령을 보장하지 않습니다."
  };

  const mdLines: string[] = [];
  mdLines.push(`# 화장품 샘플 테스트 결과 — ${testRunId}`);
  mdLines.push("");
  mdLines.push(`- moduleId: ${MODULE_ID} / 모드: ${mode} / 목적: ${report.purpose}`);
  mdLines.push(`- 총 URL: ${total} / Case 생성: ${caseCreated} / 실패: ${failureCount}`);
  mdLines.push(`- **판정: ${verdict}** — ${reasons.join(" ")}`);
  mdLines.push("");
  mdLines.push(`| # | caseId | 추출 | 위험점수 | 우선순위 | AI모드 | 증거 | 초안 | 화장품템플릿 | 대기열 | 근거검증 | 개인정보 | 오류 |`);
  mdLines.push(`|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
  results.forEach((x, i) => mdLines.push(`| ${i + 1} | ${x.caseId ?? "-"} | ${x.extractionOk ? "O" : "X"} | ${x.riskScore ?? "-"} | ${x.priorityScore ?? "-"} | ${x.analysisMode ?? "-"} | ${x.evidenceCreated ? "O" : "X"} | ${x.reportDraftCreated ? "O" : "X"} | ${x.reportIsCosmetic ? "O" : "X"} | ${x.queueRegistered ? "O" : "X"} | ${x.citationPassed ? "pass" : (x.citationStatus ?? "X")} | ${x.privacyPassed ? "O" : "주의"} | ${x.error ?? "-"} |`));
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

  console.log(`\n[test:cosmetic-sample] 판정: ${verdict}`);
  console.log(`[test:cosmetic-sample] Case ${caseCreated}/${total}, 신고서초안 ${reportOk}/${total}(화장품템플릿 ${reportCmOk}/${total}), 증거 ${evidenceOk}/${total}, 근거검증 ${citationOk}/${total}, 개인정보스캔 ${privacyOk}/${total}, 대기열 ${queueOk}/${total}`);
  console.log(`[test:cosmetic-sample] 리포트: ${jsonPath}`);
  console.log("COSMETIC_SAMPLE_TEST_DONE");
}

main().catch((e) => {
  console.error("COSMETIC_SAMPLE_TEST_FAIL", e);
  process.exit(1);
});
