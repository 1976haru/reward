import { readFile } from "node:fs/promises";
import path from "node:path";
import { detectFalseAdRules } from "../modules/false-ad/config.js";
import { ScoringAgent } from "../agents/ScoringAgent.js";
import { moduleRegistry } from "../modules/index.js";

const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (!cond) failures.push(`${name}${detail ? ` (${detail})` : ""}`);
}

// 1) 규칙 탐지 — 의심 표현이 들어간 문장에서 최소 2건 이상 탐지
const sample = "이 제품은 당뇨 완치에 도움을 주고 지방 분해 효과가 100% 있습니다.";
const hits = detectFalseAdRules(sample);
check("rule detection >= 2 hits", hits.length >= 2, `hits=${hits.length}`);

// 2) 점수 — 0~100 범위
const score = new ScoringAgent().score(hits);
check("score is finite", Number.isFinite(score), `score=${score}`);
check("score >= 0", score >= 0, `score=${score}`);
check("score <= 100", score <= 100, `score=${score}`);
check("score > 0 for matched sample", score > 0, `score=${score}`);

// 3) 의심 표현이 없는 깨끗한 문장은 0점
const cleanScore = new ScoringAgent().score(detectFalseAdRules("일반적인 상품 설명입니다."));
check("clean text scores 0", cleanScore === 0, `cleanScore=${cleanScore}`);

// 4) agency_config.json — 존재하면 JSON parse 가능 + 핵심 필드 검사
const configPath = path.join(process.cwd(), "src/modules/false-ad/agency_config.json");
try {
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw);
  check("agency_config has moduleId", parsed.moduleId === "false_ad");
  check("agency_config has schemaVersion", typeof parsed.schemaVersion === "string");
  check("agency_config primaryAgencies >= 4", Array.isArray(parsed.primaryAgencies) && parsed.primaryAgencies.length >= 4);
  check("agency_config rewardGuaranteed === false", parsed?.rewardPolicySummary?.rewardGuaranteed === false);
} catch (error) {
  failures.push(`agency_config.json parse failed: ${(error as Error).message}`);
}

// 5) Module Registry — false_ad active + getDefault + planned 차단
const moduleList = moduleRegistry.list();
check("registry list is array", Array.isArray(moduleList), `len=${moduleList.length}`);
check("registry has false_ad", moduleRegistry.has("false_ad"));
const falseAd = moduleRegistry.get("false_ad");
check("false_ad status is active", falseAd?.status === "active", `status=${falseAd?.status}`);
const defaultModule = moduleRegistry.getDefault();
check("default module is false_ad", defaultModule?.id === "false_ad", `default=${defaultModule?.id}`);
const planned = moduleRegistry.get("counterfeit_goods");
check("counterfeit_goods registered", Boolean(planned));
check("counterfeit_goods is not active", planned?.status !== "active", `status=${planned?.status}`);
check("false_ad has reportTemplatePath", typeof falseAd?.reportTemplatePath === "string");
check("false_ad has agencyConfigPath", typeof falseAd?.agencyConfigPath === "string");

if (failures.length > 0) {
  console.error("SMOKE_TEST_FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("SMOKE_TEST_OK", {
  hits: hits.length,
  score,
  cleanScore,
  agencyConfig: "ok",
  registry: { total: moduleList.length, active: moduleRegistry.getActive().length, default: defaultModule.id }
});
