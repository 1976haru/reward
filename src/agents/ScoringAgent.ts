import type { RuleHit } from "../types/core.js";

const severityScore: Record<RuleHit["severity"], number> = {
  low: 10,
  medium: 25,
  high: 45,
  critical: 70
};

export class ScoringAgent {
  score(ruleHits: RuleHit[]): number {
    if (ruleHits.length === 0) return 0;
    const raw = ruleHits.reduce((sum, hit) => sum + severityScore[hit.severity], 0);
    const diversityBonus = new Set(ruleHits.map((hit) => hit.category)).size * 5;
    return Math.min(100, raw + diversityBonus);
  }
}
