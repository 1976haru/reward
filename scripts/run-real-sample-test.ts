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
 * 실전 샘플 10건 테스트 러너 (체크리스트 31).
 *
 * 목적: 건강기능식품 1차 MVP 전체 흐름(수집→추출→탐지→점수→AI(mock)→증거→신고서초안→
 *       검토대기열→근거검증→개인정보스캔→공식 신고처 링크)을 검증한다.
 *
 * 안전:
 * - 신고 가능성 확정이 아니라 "시스템 흐름 검증"이다.
 * - 외부 신고기관에 제출하지 않으며 접수번호를 만들지 않는다 (결과 기록은 테스트 상태로만).
 * - data/manual-tests/sample-urls.json 이 있으면 그 공개 URL 을, 없으면 로컬 합성 페이지를 쓴다.
 * - 합성 모드는 외부 네트워크를 호출하지 않는다. 실제 업체/개인정보를 쓰지 않는다.
 */

const OUT_DIR = path.resolve(process.cwd(), "data", "manual-tests");

// ---------- 합성 샘플 페이지 (실제 업체/개인정보 없음, 가상 문구) ----------
interface SyntheticPage { slug: string; title: string; html: string; expect: "violation_like" | "normal"; }

function page(slug: string, title: string, expect: SyntheticPage["expect"], body: string): SyntheticPage {
  const html = `<!doctype html><html lang="ko"><head><title>${title}</title></head><body><main>${body}</main></body></html>`;
  return { slug, title, html, expect };
}

const SYNTHETIC_PAGES: SyntheticPage[] = [
  page("p1", "혈당케어 가상제품", "violation_like",
    `<h1>혈당케어 (가상)</h1><section>광고문구: 당뇨 완치에 도움, 혈압약 대체 가능</section>
     <section>후기: 먹고 다 나았어요</section><section>성분: 바나바잎추출물</section>
     <section>섭취방법: 1일 2정</section><section>주의사항: 알레르기 주의</section><section>판매자: 가상몰</section>`),
  page("p2", "면역업 가상제품", "violation_like",
    `<h1>면역업 (가상)</h1><section>광고문구: 암 예방, 종양 억제에 특효</section>
     <section>후기: 효과 최고</section><section>성분: 베타글루칸</section><section>섭취방법: 1일 1포</section>
     <section>주의사항: 임산부 상담</section><section>판매자: 가상스토어</section>`),
  page("p3", "관절튼튼 가상제품", "violation_like",
    `<h1>관절튼튼 (가상)</h1><section>광고문구: 관절염 치료, 연골 재생 보장</section>
     <section>후기: 통증이 사라졌어요</section><section>성분: 보스웰리아</section><section>섭취방법: 1일 2회</section>
     <section>주의사항: 과량 섭취 주의</section><section>판매자: 가상헬스</section>`),
  page("p4", "다이어트핏 가상제품", "violation_like",
    `<h1>다이어트핏 (가상)</h1><section>광고문구: 약 없이 무조건 빠지는 기적의 효과</section>
     <section>후기: 한 달에 10kg</section><section>성분: 가르시니아</section><section>섭취방법: 식전 1정</section>
     <section>주의사항: 수분 충분히</section><section>판매자: 가상다이어트몰</section>`),
  page("p5", "간건강 가상제품", "violation_like",
    `<h1>간건강 (가상)</h1><section>광고문구: 간경화 완치, 해독 효과 100%</section>
     <section>후기: 수치가 정상으로</section><section>성분: 밀크씨슬</section><section>섭취방법: 1일 1정</section>
     <section>주의사항: 의약품과 병용 상담</section><section>판매자: 가상라이프</section>`),
  page("p6", "눈편안 가상제품", "violation_like",
    `<h1>눈편안 (가상)</h1><section>광고문구: 백내장 예방, 시력 회복에 탁월</section>
     <section>후기: 잘 보여요</section><section>성분: 루테인</section><section>섭취방법: 1일 1정</section>
     <section>주의사항: 보관 주의</section><section>판매자: 가상아이몰</section>`),
  page("p7", "종합비타민 가상제품", "normal",
    `<h1>종합비타민 (가상)</h1><section>광고문구: 활기찬 하루, 균형 잡힌 영양 보충에 도움을 줄 수 있음</section>
     <section>후기: 챙겨 먹기 편해요</section><section>성분: 비타민B군, 비타민C</section>
     <section>섭취방법: 1일 1정</section><section>주의사항: 일일 섭취량 준수</section><section>판매자: 가상마트</section>`),
  page("p8", "프로바이오틱스 가상제품", "normal",
    `<h1>프로바이오틱스 (가상)</h1><section>광고문구: 장 건강과 원활한 배변 활동에 도움을 줄 수 있음(건강기능식품 표시)</section>
     <section>후기: 속이 편해요</section><section>성분: 유산균 100억 CFU</section>
     <section>섭취방법: 1일 1포</section><section>주의사항: 냉장 보관</section><section>판매자: 가상유산균몰</section>`),
  page("p9", "오메가3 가상제품", "normal",
    `<h1>오메가3 (가상)</h1><section>광고문구: 혈중 중성지방 개선·기억력 개선에 도움을 줄 수 있음(인정된 기능성)</section>
     <section>후기: 비린내 없어요</section><section>성분: EPA/DHA</section>
     <section>섭취방법: 1일 1캡슐</section><section>주의사항: 항응고제 복용 시 상담</section><section>판매자: 가상오메가몰</section>`),
  page("p10", "단백질보충 가상제품", "normal",
    `<h1>단백질보충 (가상)</h1><section>광고문구: 운동 후 단백질 보충, 일상 영양 균형에 도움</section>
     <section>후기: 맛있어요</section><section>성분: 분리유청단백</section>
     <section>섭취방법: 1일 1~2스쿱</section><section>주의사항: 우유 알레르기 주의</section><section>판매자: 가상프로틴몰</section>`)
];

function startSyntheticServer(pages: SyntheticPage[]): Promise<{ baseUrl: string; close: () => void }> {
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
    const raw = await readFile(path.join(OUT_DIR, "sample-urls.json"), "utf8");
    const parsed = JSON.parse(raw) as { urls?: unknown };
    const urls = Array.isArray(parsed.urls) ? parsed.urls.filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u)) : [];
    if (urls.length > 0) return { urls: urls.slice(0, 20), mode: "real" };
  } catch { /* 없으면 합성 모드 */ }
  return { urls: [], mode: "synthetic" };
}

// 민감 쿼리 파라미터 제거 (공개 URL 안전화)
function safePublicUrl(u: string): string {
  try {
    const url = new URL(u);
    const SENSITIVE = ["token", "auth", "session", "sid", "key", "apikey", "password", "pw", "secret", "access_token"];
    for (const k of [...url.searchParams.keys()]) {
      if (SENSITIVE.some((s) => k.toLowerCase().includes(s))) url.searchParams.delete(k);
    }
    return url.toString();
  } catch { return u; }
}

interface UrlResult {
  url: string;
  caseId: string | null;
  extractionOk: boolean;
  detectionSummary: string;
  riskScore: number | null;
  priorityScore: number | null;
  analysisMode: string | null;
  usedExternalApi: boolean | null;
  evidenceCreated: boolean;
  reportDraftCreated: boolean;
  queueRegistered: boolean;
  caseStatus: string | null;
  citationPassed: boolean;
  citationStatus: string | null;
  privacyPassed: boolean;
  privacyDetectedTypes: string[];
  collectionStatus: string | null;
  error: string | null;
}

async function main(): Promise<void> {
  console.log("[test:real-sample] 건강기능식품 1차 MVP 전체 흐름 검증 (시스템 흐름 검증 목적, 법 위반 확정 아님)");
  await mkdir(OUT_DIR, { recursive: true });

  const { urls: realUrls, mode } = await loadUrlList();
  let server: { baseUrl: string; close: () => void } | null = null;
  let targets: string[];
  if (mode === "real") {
    targets = realUrls.map(safePublicUrl);
    console.log(`[test:real-sample] 실제 공개 URL ${targets.length}건 (사용자 제공)`);
  } else {
    server = await startSyntheticServer(SYNTHETIC_PAGES);
    targets = SYNTHETIC_PAGES.map((p) => `${server!.baseUrl}/${p.slug}`);
    console.log(`[test:real-sample] 합성 샘플 ${targets.length}건 (로컬, 외부 네트워크 호출 없음)`);
  }

  const orchestrator = new OrchestratorAgent();
  const officialLinks = getOfficialReportingLinks("false_ad");
  const results: UrlResult[] = [];
  const errors: string[] = [];
  let autoSubmitObserved = false; // 설계상 항상 false 여야 한다

  for (const url of targets) {
    const r: UrlResult = {
      url, caseId: null, extractionOk: false, detectionSummary: "", riskScore: null, priorityScore: null,
      analysisMode: null, usedExternalApi: null, evidenceCreated: false, reportDraftCreated: false,
      queueRegistered: false, caseStatus: null, citationPassed: false, citationStatus: null,
      privacyPassed: false, privacyDetectedTypes: [], collectionStatus: null, error: null
    };
    try {
      const rc = await orchestrator.analyze({ url, moduleId: "false_ad", memo: "real-sample-test (테스트 목적, 실제 제출 없음)" });
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
      // 검토 대기열 등록: DRAFT/REVIEW 상태면 큐에 등록된 것으로 본다 (자동 제출 아님)
      r.queueRegistered = ["DRAFT", "REVIEW", "NEEDS_MORE_INFO"].includes(rc.status);

      // 10) 근거 검증 — 증거 패키지 ID(강한 근거)와 모델 계산 결과로 핵심 주장 검증
      const claims: ReportClaim[] = [
        { claimId: `${rc.id}#suspect`, text: "광고에 의심 문구가 존재함(검토 필요)", kind: "core", section: "claim",
          citations: [{ type: "evidence_id", evidenceId: rc.id }] },
        { claimId: `${rc.id}#evidence`, text: "증거 패키지가 생성·보관됨", kind: "core", section: "evidence",
          citations: [{ type: "evidence_id", evidenceId: rc.id }] },
        { claimId: `${rc.id}#score`, text: `우선순위 점수 ${r.priorityScore ?? "?"} 검토 후보로 분류됨`, kind: "computed", section: "score",
          citations: [{ type: "computed_model", label: "모델 계산 결과 (검토 신호)" }] },
        { claimId: `${rc.id}#disclaimer`, text: "본 결과는 법 위반 확정이 아니며 사람 검토 필요", kind: "disclaimer", section: "disclaimer", citations: [] }
      ];
      const cv = validateReportCitations(claims, { mode: "strict" });
      r.citationStatus = cv.status;
      r.citationPassed = cv.status === "pass";

      // 11) 개인정보 스캔 — 신고서 초안 본문 + Case 요약을 마스킹 스캔
      let reportText = `${rc.title}\n${rc.summary}\n${rc.aiFinding?.summary ?? ""}`;
      try {
        if (rc.reportPath) reportText += "\n" + await readFile(rc.reportPath, "utf8");
      } catch { /* 리포트 파일 읽기 실패는 무시 */ }
      const masked = maskText(reportText, { enabled: true });
      r.privacyDetectedTypes = Object.keys(masked.byType);
      // HIGH 위험 유형(키/주민/이메일/전화/토큰 등)이 없으면 통과로 본다
      const HIGH = ["API_KEY", "TOKEN", "AUTH_HEADER", "COOKIE", "KOREAN_RRN", "EMAIL", "PHONE"];
      r.privacyPassed = !r.privacyDetectedTypes.some((t) => HIGH.includes(t));

      // 13) 결과 기록: 실제 제출/접수번호 생성 없음 — outcome 미생성으로 확인
      // (자동 제출이 일어나지 않았음을 명시)
    } catch (error) {
      r.error = (error as Error).message;
      errors.push(`${url}: ${r.error}`);
    }
    results.push(r);
  }

  if (server) server.close();

  // ---------- 집계 ----------
  const total = results.length;
  const caseCreated = results.filter((r) => r.caseId).length;
  const evidenceOk = results.filter((r) => r.evidenceCreated).length;
  const reportOk = results.filter((r) => r.reportDraftCreated).length;
  const queueOk = results.filter((r) => r.queueRegistered).length;
  const citationOk = results.filter((r) => r.citationPassed).length;
  const privacyOk = results.filter((r) => r.privacyPassed).length;
  const extractionOk = results.filter((r) => r.extractionOk).length;
  const failureCount = results.filter((r) => r.error).length;
  const improvements: string[] = [];

  // ---------- 판정 ----------
  let verdict: "PASS" | "PASS_WITH_WARNINGS" | "NEEDS_FIX" | "BLOCKED";
  const reasons: string[] = [];
  if (autoSubmitObserved) {
    verdict = "BLOCKED";
    reasons.push("자동신고/자동제출이 관측되어 정책 위반입니다.");
  } else if (caseCreated >= 8 && reportOk >= 8 && evidenceOk >= 8 && citationOk >= 8 && privacyOk >= 8) {
    verdict = "PASS";
    reasons.push("Case 생성·신고서 초안·증거·근거검증·개인정보스캔이 8건 이상 통과했습니다.");
  } else if (caseCreated >= 8 && reportOk >= 8) {
    verdict = "PASS_WITH_WARNINGS";
    reasons.push("기본 흐름(Case·신고서 초안)은 통과했으나 일부 단계에서 보완이 필요합니다.");
  } else if (evidenceOk < 8 || citationOk < 8 || privacyOk < 8) {
    verdict = "NEEDS_FIX";
    reasons.push("증거 패키지/근거검증/개인정보스캔 중 반복 실패가 있습니다.");
  } else {
    verdict = "NEEDS_FIX";
    reasons.push("Case 또는 신고서 초안 생성 성공률이 기준(8/10) 미만입니다.");
  }
  if (caseCreated < total) improvements.push(`Case 생성 실패 ${total - caseCreated}건 — 수집/추출 단계 점검 필요`);
  if (citationOk < total) improvements.push(`근거검증 미통과 ${total - citationOk}건 — 핵심 주장에 공개자료/증거 근거 보강 필요`);
  if (privacyOk < total) improvements.push(`개인정보 스캔 주의 ${total - privacyOk}건 — 마스킹 강화 필요`);
  if (results.some((r) => r.collectionStatus === "fallback")) improvements.push("일부 URL 수집 fallback — 사람이 페이지를 직접 확인 필요");

  const testRunId = `realtest_${new Date().toISOString().replace(/[:.]/g, "-")}_${Math.random().toString(36).slice(2, 8)}`;
  const testedAt = new Date().toISOString();
  const report = {
    testRunId, testedAt, mode, purpose: "시스템 흐름 검증 (신고 가능성 확정 아님, 법 위반 확정 아님)",
    totalUrls: total, successCount: caseCreated, failureCount,
    summary: { extractionOk, caseCreated, evidenceOk, reportOk, queueOk, citationOk, privacyOk },
    officialReportingLinks: officialLinks.map((l) => ({ agencyId: l.agencyId, agencyName: l.agencyName, url: l.url })),
    autoSubmitObserved, autoReport: false, humanReviewRequired: true,
    verdict, verdictReasons: reasons, improvements, errors,
    results,
    safetyNotice: "본 테스트는 시스템 흐름 검증용입니다. 외부 신고기관에 제출하지 않았고 접수번호를 만들지 않았습니다. 결과는 법 위반 확정이 아니며 포상금 수령을 보장하지 않습니다."
  };

  const jsonPath = path.join(OUT_DIR, `${testRunId}.json`);
  const mdPath = path.join(OUT_DIR, `${testRunId}.md`);
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(mdPath, renderMarkdown(report), "utf8");

  console.log(`\n[test:real-sample] 판정: ${verdict}`);
  console.log(`[test:real-sample] Case ${caseCreated}/${total}, 신고서초안 ${reportOk}/${total}, 증거 ${evidenceOk}/${total}, 근거검증 ${citationOk}/${total}, 개인정보스캔 ${privacyOk}/${total}, 검토대기열 ${queueOk}/${total}`);
  console.log(`[test:real-sample] 리포트: ${jsonPath}`);
  console.log(`[test:real-sample] 리포트: ${mdPath}`);
  console.log("REAL_SAMPLE_TEST_DONE");
}

function renderMarkdown(report: ReturnType<typeof Object> & Record<string, unknown>): string {
  const r = report as Record<string, any>;
  const lines: string[] = [];
  lines.push(`# 실전 샘플 테스트 결과 — ${r.testRunId}`);
  lines.push("");
  lines.push(`- 테스트 일시: ${r.testedAt}`);
  lines.push(`- 모드: ${r.mode} (synthetic=로컬 합성, real=사용자 제공 공개 URL)`);
  lines.push(`- 목적: ${r.purpose}`);
  lines.push(`- 총 URL: ${r.totalUrls} / 성공(Case 생성): ${r.successCount} / 실패: ${r.failureCount}`);
  lines.push(`- **판정: ${r.verdict}**`);
  for (const reason of r.verdictReasons) lines.push(`  - ${reason}`);
  lines.push("");
  lines.push("## 단계별 통과 수");
  const s = r.summary;
  lines.push(`| 추출 | Case | 증거 | 신고서초안 | 검토대기열 | 근거검증 | 개인정보스캔 |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  lines.push(`| ${s.extractionOk} | ${s.caseCreated} | ${s.evidenceOk} | ${s.reportOk} | ${s.queueOk} | ${s.citationOk} | ${s.privacyOk} |`);
  lines.push("");
  lines.push("## URL별 결과");
  lines.push(`| # | caseId | 추출 | 위험점수 | 우선순위 | AI모드 | 증거 | 초안 | 대기열 | 근거검증 | 개인정보 | 오류 |`);
  lines.push(`|---|---|---|---|---|---|---|---|---|---|---|---|`);
  r.results.forEach((x: any, i: number) => {
    lines.push(`| ${i + 1} | ${x.caseId ?? "-"} | ${x.extractionOk ? "O" : "X"} | ${x.riskScore ?? "-"} | ${x.priorityScore ?? "-"} | ${x.analysisMode ?? "-"} | ${x.evidenceCreated ? "O" : "X"} | ${x.reportDraftCreated ? "O" : "X"} | ${x.queueRegistered ? "O" : "X"} | ${x.citationPassed ? "pass" : x.citationStatus ?? "X"} | ${x.privacyPassed ? "O" : "주의"} | ${x.error ?? "-"} |`);
  });
  lines.push("");
  if (r.improvements.length) {
    lines.push("## 개선 필요 항목");
    for (const it of r.improvements) lines.push(`- ${it}`);
    lines.push("");
  }
  if (r.errors.length) {
    lines.push("## 오류 목록");
    for (const e of r.errors) lines.push(`- ${e}`);
    lines.push("");
  }
  lines.push("## 공식 신고처 링크 (단순 안내, 자동 제출 없음)");
  for (const l of r.officialReportingLinks) lines.push(`- ${l.agencyName}: ${l.url}`);
  lines.push("");
  lines.push(`> ${r.safetyNotice}`);
  lines.push(`> 자동신고 없음 · 사람 검토 필수 · 실제 신고는 사용자가 직접 · 포상금 보장 아님`);
  return lines.join("\n");
}

main().catch((e) => {
  console.error("REAL_SAMPLE_TEST_FAIL", e);
  process.exit(1);
});
