#!/usr/bin/env node
/**
 * 표현 통제 정책 정적 검사 (체크리스트 4).
 *
 * README, docs/, src/, public/, tests/, scripts/ 안에서
 * 단정·비방 표현이 사용자 노출 문구에 남아있는지 검사한다.
 *
 * 통과 조건 (false-positive 방지):
 *   1) 같은 ±120 char 윈도우에 부정 컨텍스트 마커(아닙니다 / 단정하지 / 표현 없이 /
 *      금지 / 사용하지 / sanitize / replace / 마스킹 등) 가 함께 등장하면 무시
 *   2) FILE_WHITELIST 에 등록된 정의/테스트/가이드 파일은 처음부터 스캔하지 않음
 *
 * 위반 발견 시 exit code 1.
 *
 * 또한 본 파일은 ESM module 로서 다음을 export 한다 (test:language 가 사용):
 *   - FORBIDDEN_PHRASES, RECOMMENDED_PHRASES
 *   - NEGATIVE_MARKERS, FILE_WHITELIST
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
  ".json"
]);

// 사용자 노출 산출물에서 금지되는 단정·비방 표현
export const FORBIDDEN_PHRASES = [
  "부정수급 확정",
  "불법 확정",
  "범죄 확정",
  "사기 확정",
  "부정수급자",
  "범죄자",
  "사기꾼",
  "허위 수급자",
  "위법 행위자",
  "반드시 신고",
  "무조건 신고",
  "처벌 대상 확정",
  "환수 대상 확정",
  "보상금 지급 확정",
  "유죄",
  "고의 범행"
];

// 권장 중립 표현 — 테스트에서 사용
export const RECOMMENDED_PHRASES = [
  "의심 신호",
  "검토 필요",
  "추가 확인 필요",
  "위험 신호",
  "이상 패턴",
  "신고 후보",
  "제보 후보",
  "검토 후보",
  "가능성",
  "추정",
  "정황",
  "자료상 불일치",
  "반복 수급 패턴",
  "중복 가능성",
  "목적 외 사용 의심",
  "정산 확인 필요",
  "기관 검토 필요",
  "사람이 최종 판단 필요",
  "사람 검토 필요"
];

// 같은 윈도우 안에 등장하면 "이 단어를 쓰지 않는다" 는 disclaimer/정의/sanitize 로 간주
export const NEGATIVE_MARKERS = new RegExp(
  [
    "아닙니다",
    "아니다",
    "아니라",
    "아니며",
    "않습니다",
    "않으며",
    "않는다",
    "않음",
    "없습니다",
    "없으며",
    "없음",
    "미수행",
    "제외",
    "불가",
    "제거",
    "차단",
    "수행하지",
    "진행하지",
    "금지",
    "사용하지",
    "표시하지",
    "단정하지",
    "단정 금지",
    "쓰지\\s*않",
    "허용하지",
    "기능\\s*없",
    "표현\\s*없이",
    "예시",
    "sanitize",
    "replace",
    "마스킹",
    "masked",
    "prohibitedPhrases",
    "DISCLAIMERS",
    "disclaimer",
    "smoke[-_]?test",
    "test",
    "expects?",
    "does\\s*NOT\\s*contain",
    "does\\s*not\\s*contain"
  ].join("|")
);

// 파일 전체를 검사 대상에서 제외 — 정의/테스트/가이드/sanitize 룰 정의 파일
export const FILE_WHITELIST = new Set([
  // 정책/가이드 문서 — 금지 표현표나 정의를 의도적으로 나열함
  "docs/REPORT_LANGUAGE_GUIDE.md",
  "docs/OPERATING_POLICY.md",
  "docs/LEGAL_REVIEW.md",
  "docs/approval_gate.md",
  "docs/report_draft.md",
  "docs/analyzer_agent.md",
  "docs/scoring_agent.md",
  "docs/rule_agent.md",
  "docs/subsidy_module.md",
  "docs/agency_config_schema.md",
  // 검사기 자체 / 다른 정책 검사기 (금지 표현 목록을 의도적으로 나열)
  "scripts/check-language-policy.js",
  "scripts/check-approval-gate.js",
  "scripts/check-upload-parser-policy.js",
  "scripts/check-entity-normalizer-policy.js",
  "scripts/check-address-normalizer-policy.js",
  "scripts/check-project-similarity-policy.js",
  "scripts/check-data-baseline-policy.js",
  "scripts/check-repeat-risk-policy.js",
  "scripts/check-address-cluster-risk-policy.js",
  "scripts/check-output-settlement-risk-policy.js",
  "scripts/check-spending-anomaly-risk-policy.js",
  // 정규화/품질/룰 가이드·테스트 — 금지 표현표·단정 표현 검증 입력을 의도적으로 포함
  "docs/ENTITY_NORMALIZATION_GUIDE.md",
  "docs/ADDRESS_NORMALIZATION_GUIDE.md",
  "docs/PROJECT_NAME_SIMILARITY_GUIDE.md",
  "docs/DATA_BASELINE_QUALITY_RUNBOOK.md",
  "docs/REPEAT_SUBSIDY_RISK_RULE.md",
  "docs/ADDRESS_CLUSTER_RISK_RULE.md",
  "docs/OUTPUT_SETTLEMENT_RISK_RULE.md",
  "docs/SPENDING_ANOMALY_RISK_RULE.md",
  "tests/entityNameNormalizer.test.ts",
  "tests/addressNormalizer.test.ts",
  "tests/projectNameSimilarity.test.ts",
  "tests/dataBaselineQuality.test.ts",
  "tests/repeatSubsidyRiskRule.test.ts",
  "tests/addressClusterRiskRule.test.ts",
  "tests/outputSettlementRiskRule.test.ts",
  "tests/spendingAnomalyRiskRule.test.ts",
  // 테스트 (검사 대상 문자열을 입력으로 사용)
  "tests/languagePolicy.test.ts",
  "tests/languagePolicy.test.js",
  "tests/preSubmissionFactCheck.test.ts",
  // sanitize 룰 정의 / LLM 프롬프트 / 평가셋 — 금지어 자체가 의도적으로 등장
  "src/agents/AnalyzerAgent.ts",
  "src/agents/scoring_rules.ts",
  "src/services/ReportService.ts",
  "src/scripts/smoke-test.ts",
  "src/modules/false-ad/analysis_prompt.md",
  "src/modules/false-ad/agency_config.json",
  "src/modules/false-ad/report-template.md",
  "src/modules/subsidy-fraud/risk_signals.json",
  "src/modules/subsidy-fraud/README.md",
  "src/modules/subsidy-fraud/report-template.md",
  "src/modules/counterfeit-goods/report-template.md",
  "src/modules/bid-collusion/report-template.md"
]);

/**
 * 단일 텍스트 블록에 금지 표현이 단정적으로 사용되었는지 검사.
 *
 * @param {string} text
 * @param {{ skipNegativeContext?: boolean, windowSize?: number, file?: string }} [options]
 * @returns {{ ok: boolean, findings: Array<{ phrase: string, index: number, lineNo: number, snippet: string }> }}
 */
export function checkText(text, options = {}) {
  const { skipNegativeContext = true, windowSize = 120, file = "(inline)" } = options;
  if (typeof text !== "string") {
    return { ok: false, findings: [{ phrase: "(invalid-input)", index: -1, lineNo: 0, snippet: String(text).slice(0, 80) }] };
  }
  const findings = [];
  for (const phrase of FORBIDDEN_PHRASES) {
    let idx = 0;
    while ((idx = text.indexOf(phrase, idx)) >= 0) {
      if (skipNegativeContext) {
        const before = text.slice(Math.max(0, idx - windowSize), idx);
        const after = text.slice(idx, Math.min(text.length, idx + phrase.length + windowSize));
        if (NEGATIVE_MARKERS.test(before + after)) {
          idx += phrase.length;
          continue;
        }
      }
      const lineNo = text.slice(0, idx).split(/\r?\n/).length;
      const lineText = text.split(/\r?\n/)[lineNo - 1] ?? "";
      findings.push({
        phrase,
        index: idx,
        lineNo,
        snippet: lineText.trim().slice(0, 200),
        file
      });
      idx += phrase.length;
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
  const result = checkText(content, { skipNegativeContext: true, file: rel });
  if (!result.ok) {
    for (const f of result.findings) {
      findingsAll.push({ ...f, file: rel });
    }
  }
}

async function isModuleEntry() {
  // ESM main-module check
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
    console.log("CHECK_LANGUAGE_OK — no forbidden phrases detected in user-facing text.");
    process.exit(0);
  }
  console.error("CHECK_LANGUAGE_FAIL — found forbidden phrases without negative context:");
  for (const f of findingsAll) {
    console.error(` - ${f.file}:${f.lineNo}  [${f.phrase}]  → ${f.snippet}`);
  }
  process.exit(1);
}

if (await isModuleEntry()) {
  runCli().catch((e) => {
    console.error("check-language-policy.js failed:", e);
    process.exit(2);
  });
}
