import { detectFalseAdRules } from "../modules/false-ad/config.js";
import { ScoringAgent } from "../agents/ScoringAgent.js";

const sample = "이 제품은 당뇨 완치에 도움을 주고 지방 분해 효과가 100% 있습니다.";
const hits = detectFalseAdRules(sample);
const score = new ScoringAgent().score(hits);

if (hits.length < 2) throw new Error("룰 탐지 실패");
if (score <= 0) throw new Error("점수화 실패");
console.log("SMOKE_TEST_OK", { hits: hits.length, score });
