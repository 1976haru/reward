// AdSafe (애드세이프) — MOCK 모드 광고 사전점검 e2e 데모 (E-4).
//
// API 키 없이 룰 기반만으로 위반 의심 표현이 탐지되는지 1회 실행해 로그를 남긴다.
// 외부 신고/제출 없음. 적법성·위반 여부를 확정하지 않으며 최종 판단은 사람이 한다.

import { runComplianceCheck, runBatchComplianceCheck } from "../src/adsafe/complianceCheck.js";

process.env.MOCK_AI = process.env.MOCK_AI ?? "true";

console.log("=== AdSafe 광고 사전점검 MOCK e2e (룰 기반, API 키 불필요) ===\n");

const sampleAd =
  "이 건강기능식품은 암 완치에 효과적이며, 당뇨 완치와 혈압 정상화에도 도움이 됩니다. " +
  "의약품 대신 드셔도 되고, 먹기만 해도 살이 빠집니다. 부작용 전혀 없는 100% 안전한 제품입니다.";

console.log("[입력 광고 문구]");
console.log(sampleAd, "\n");

const report = runComplianceCheck({ text: sampleAd, moduleId: "false_ad" });

console.log("[점검 리포트]");
console.log(`- 제품 유형: ${report.productType}`);
console.log(`- 종합 위험도: ${report.ratingLabel} (${report.rating}) / 점수 ${report.score}`);
console.log(`- 통과 가능성: ${report.passLikelihood}`);
console.log(`- 위반 의심 표현: ${report.findings.length}건 (HIGH ${report.counts.HIGH} / MEDIUM ${report.counts.MEDIUM} / LOW ${report.counts.LOW} / combo ${report.counts.combo})`);
console.log("");

report.findings.slice(0, 8).forEach((f, i) => {
  console.log(`  ${i + 1}. [${f.categoryLabel} · ${f.riskLevel}] "${f.matchedExpression}"`);
  console.log(`     인용: ${f.quotedText}`);
  console.log(`     근거: ${f.reason}`);
  console.log(`     수정 제안: ${f.suggestion}`);
});

console.log("\n[정식 심의 비교 안내]");
console.log(report.formalReviewNotice);
console.log("\n[면책 푸터]");
console.log(report.disclaimerFooter);

console.log("\n=== 배치 점검(비용 가드) 데모 ===");
const batch = runBatchComplianceCheck(
  [{ text: "암 완치 식품" }, { text: "건강하게 즐기세요" }, { text: "의약품 대신" }],
  { moduleId: "false_ad", maxChecks: 2 }
);
console.log(`요청 ${batch.requested}건 / 처리 ${batch.processed}건 / 미처리 ${batch.skipped}건 — ${batch.guardNote}`);

if (report.findings.length === 0) {
  console.error("\nADSAFE_MOCK_E2E_INCOMPLETE — 룰 기반 위반 표현이 탐지되지 않았습니다.");
  process.exit(1);
}
console.log("\nADSAFE_MOCK_E2E_OK — 룰 기반만으로 위반 의심 표현을 탐지했습니다 (API 키 불필요).");
