import { nanoid } from "nanoid";
import type { AnalyzeRequest, CaseStatus, RewardCase } from "../types/core.js";
import { AnalyzerAgent } from "./AnalyzerAgent.js";
import { CollectorAgent } from "./CollectorAgent.js";
import { PolicyAgent } from "./PolicyAgent.js";
import { RuleAgent } from "./RuleAgent.js";
import { ScoringAgent } from "./ScoringAgent.js";
import { createCaseRepository, type ICaseRepository } from "../repositories/CaseRepository.js";
import { EvidenceService } from "../services/EvidenceService.js";
import { ReportService } from "../services/ReportService.js";
import { clampRiskScore, riskLevelFromScore } from "../utils/validation.js";

export class OrchestratorAgent {
  private collector = new CollectorAgent();
  private rules = new RuleAgent();
  private scoring = new ScoringAgent();
  private analyzer = new AnalyzerAgent();
  private evidence = new EvidenceService();
  private reports = new ReportService();
  private repository: ICaseRepository = createCaseRepository();
  private policy = new PolicyAgent();

  async analyze(request: AnalyzeRequest): Promise<RewardCase> {
    const doc = await this.collector.collectUrl(request.url);
    const policyWarnings = this.policy.validatePublicAnalysis(doc);
    const ruleHits = this.rules.detect(request.moduleId, doc.text);
    const rawScore = this.scoring.score(ruleHits);
    const score = clampRiskScore(rawScore);
    const aiFinding = await this.analyzer.analyze(doc, ruleHits, score);

    if (policyWarnings.length > 0) {
      aiFinding.requiredHumanChecks = [...policyWarnings, ...aiFinding.requiredHumanChecks];
      aiFinding.confidence = Math.max(0, aiFinding.confidence - 10);
    }

    const now = new Date().toISOString();
    const id = nanoid(12);
    const evidence = await this.evidence.buildEvidence(id, doc);
    const initialStatus: CaseStatus = score >= 50 ? "REVIEW" : "DRAFT";

    const draft: RewardCase = {
      id,
      moduleId: request.moduleId,
      status: initialStatus,
      url: doc.url,
      title: doc.title,
      createdAt: now,
      updatedAt: now,
      score,
      riskScore: score,
      riskLevel: riskLevelFromScore(score),
      agencyCandidate: aiFinding.recommendedAgency,
      summary: aiFinding.summary,
      ruleHits,
      aiFinding,
      evidence,
      reportPath: "",
      memo: request.memo,
      statusHistory: [
        { at: now, from: null, to: initialStatus, note: "분석 파이프라인 생성" }
      ],
      reviews: []
    };

    const reportPath = await this.reports.createReport(draft);
    const completed: RewardCase = { ...draft, reportPath };
    return this.repository.save(completed);
  }
}
