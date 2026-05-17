import { nanoid } from "nanoid";
import type {
  AnalyzeRequest,
  CaseRuleDetection,
  CaseStatus,
  RewardCase
} from "../types/core.js";
import { AnalyzerAgent } from "./AnalyzerAgent.js";
import { CollectorAgent } from "./CollectorAgent.js";
import { PolicyAgent } from "./PolicyAgent.js";
import { RuleAgent, type RuleDetectionResult } from "./RuleAgent.js";
import { createCaseRepository, type ICaseRepository } from "../repositories/CaseRepository.js";
import { EvidenceService } from "../services/EvidenceService.js";
import { ReportService } from "../services/ReportService.js";
import { riskLevelFromScore } from "../utils/validation.js";
import { TextExtractor, type ExtractionResult } from "../services/TextExtractor.js";

const FALLBACK_TAIL_MAX = 8000;

export class OrchestratorAgent {
  private collector = new CollectorAgent();
  private rules = new RuleAgent();
  private analyzer = new AnalyzerAgent();
  private evidence = new EvidenceService();
  private reports = new ReportService();
  private repository: ICaseRepository = createCaseRepository();
  private policy = new PolicyAgent();
  private extractor = new TextExtractor();

  async analyze(request: AnalyzeRequest): Promise<RewardCase> {
    const doc = await this.collector.collectUrl(request.url);
    const policyWarnings = this.policy.validatePublicAnalysis(doc);

    // 1) 구조화 추출 — 실패해도 기존 doc.text로 폴백
    let extraction: ExtractionResult | null = null;
    try {
      extraction = this.extractor.extract(doc.html, {
        url: doc.url,
        title: doc.title,
        moduleId: request.moduleId
      });
    } catch (error) {
      console.warn("TextExtractor 실패. doc.text로 폴백합니다:", (error as Error).message);
    }

    // 2) RuleAgent 섹션 인지 탐지 — claim/review 우선
    const detection: RuleDetectionResult = this.rules.detectDetailed(
      extraction
        ? {
            claimCandidates: extraction.claimCandidates,
            reviewCandidates: extraction.reviewCandidates,
            mainText: extraction.mainText.slice(0, FALLBACK_TAIL_MAX)
          }
        : { text: doc.text }
    );

    const score = detection.riskScore;
    const aiFinding = await this.analyzer.analyze(doc, detection.ruleHits, score);

    if (policyWarnings.length > 0) {
      aiFinding.requiredHumanChecks = [...policyWarnings, ...aiFinding.requiredHumanChecks];
      aiFinding.confidence = Math.max(0, aiFinding.confidence - 10);
    }

    const now = new Date().toISOString();
    const id = nanoid(12);
    const evidence = await this.evidence.buildEvidence(id, doc, {
      extractionSummary: extraction
        ? (summarizeExtraction(extraction) as unknown as Record<string, unknown>)
        : undefined
    });
    const initialStatus: CaseStatus = score >= 50 ? "REVIEW" : "DRAFT";

    const ruleDetectionForCase: CaseRuleDetection = {
      schemaVersion: detection.schemaVersion,
      matches: detection.matches.slice(0, 50),
      riskScore: detection.riskScore,
      riskLevel: detection.riskLevel,
      counts: detection.counts,
      highlightedSegments: detection.highlightedSegments.slice(0, 30),
      safetyNotice: detection.safetyNotice
    };

    const draft: RewardCase = {
      id,
      moduleId: request.moduleId,
      status: initialStatus,
      url: doc.url,
      title: (extraction?.title ?? doc.title) || doc.url,
      createdAt: now,
      updatedAt: now,
      score,
      riskScore: score,
      riskLevel: riskLevelFromScore(score),
      agencyCandidate: aiFinding.recommendedAgency,
      summary: aiFinding.summary,
      ruleHits: detection.ruleHits,
      aiFinding,
      evidence,
      reportPath: "",
      memo: request.memo,
      statusHistory: [
        { at: now, from: null, to: initialStatus, note: "분석 파이프라인 생성" }
      ],
      reviews: [],
      extraction: extraction ? summarizeExtractionForCase(extraction) : undefined,
      ruleDetection: ruleDetectionForCase
    };

    const reportPath = await this.reports.createReport(draft);
    const completed: RewardCase = { ...draft, reportPath };
    return this.repository.save(completed);
  }
}

interface ExtractionSummary {
  productName?: string;
  priceCandidates: string[];
  claimCandidatesCount: number;
  reviewCandidatesCount: number;
  ingredientCandidatesCount: number;
  warningCandidatesCount: number;
  textLength: number;
  extractionWarnings: string[];
}

function summarizeExtraction(e: ExtractionResult): ExtractionSummary {
  return {
    productName: e.productName,
    priceCandidates: e.priceCandidates.slice(0, 5),
    claimCandidatesCount: e.claimCandidates.length,
    reviewCandidatesCount: e.reviewCandidates.length,
    ingredientCandidatesCount: e.ingredientCandidates.length,
    warningCandidatesCount: e.warningCandidates.length,
    textLength: e.textLength,
    extractionWarnings: e.extractionWarnings
  };
}

function summarizeExtractionForCase(e: ExtractionResult) {
  return {
    productName: e.productName,
    priceCandidates: e.priceCandidates,
    claimCandidates: e.claimCandidates.slice(0, 10),
    reviewCandidates: e.reviewCandidates.slice(0, 10),
    ingredientCandidates: e.ingredientCandidates.slice(0, 10),
    usageCandidates: e.usageCandidates.slice(0, 10),
    warningCandidates: e.warningCandidates.slice(0, 10),
    sellerCandidates: e.sellerCandidates.slice(0, 10),
    textLength: e.textLength,
    extractionWarnings: e.extractionWarnings,
    removedBoilerplateHints: e.removedBoilerplateHints.slice(0, 10)
  };
}
