import type { RuleHit } from "../types/core.js";
import { detectFalseAdRules } from "../modules/false-ad/config.js";

export class RuleAgent {
  detect(moduleId: string, text: string): RuleHit[] {
    if (moduleId === "false_ad") return detectFalseAdRules(text);
    throw new Error(`지원하지 않는 모듈입니다: ${moduleId}`);
  }
}
