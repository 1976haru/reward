import { nanoid } from "nanoid";
import type { AnalyzeRequest, RewardCase } from "../types/core.js";
import { AnalyzerAgent } from "./AnalyzerAgent.js";
import { CollectorAgent } from "./CollectorAgent.js";
import { PolicyAgent } from "./PolicyAgent.js";
import { RuleAgent } from "./RuleAgent.js";
import { ScoringAgent } from "./ScoringAgent.js";
import { CaseRepository } from "../services/CaseRepository.js";
import { EvidenceService } from "../services/EvidenceService.js";
import { ReportService } from "../services/ReportService.js";

export class OrchestratorAgent {
  private collector = new CollectorAgent();
  private rules = new RuleAgent();
  private scoring = new ScoringAgent();
  private analyzer = new AnalyzerAgent();
  private evidence = new EvidenceService();
  private reports = new ReportService();
  private repository = new CaseRepository();
  private policy = new PolicyAgent();

  async analyze(request: AnalyzeRequest): Promise<RewardCase> {
    const doc = await this.collector.collectUrl(request.url);
    const policyWarnings = this.policy.validatePublicAnalysis(doc);
    const ruleHits = this.rules.detect(request.moduleId, doc.text);
    const score = this.scoring.score(ruleHits);
    const aiFinding = await this.analyzer.analyze(doc, ruleHits, score);

    if (policyWarnings.length > 0) {
      aiFinding.requiredHumanChecks = [...policyWarnings, ...aiFinding.requiredHumanChecks];
      aiFinding.confidence = Math.max(0, aiFinding.confidence - 10);
    }

    const now = new Date().toISOString();
    const id = nanoid(12);
    const evidence = await this.evidence.buildEvidence(id, doc);

    const draft: RewardCase = {
      id,
      moduleId: request.moduleId,
      status: score >= 50 ? "needs_review" : "draft",
      url: doc.url,
      title: doc.title,
      createdAt: now,
      updatedAt: now,
      score,
      ruleHits,
      aiFinding,
      evidence,
      reportPath: "",
      memo: request.memo
    };

    const reportPath = await this.reports.createReport(draft);
    const completed = { ...draft, reportPath };
    await this.repository.save(completed);
    return completed;
  }
}
