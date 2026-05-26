import { nanoid } from "nanoid";
import type {
  AnalyzeRequest,
  CaseRuleDetection,
  CaseStatus,
  RewardCase
} from "../types/core.js";
import { AnalyzerAgent, analysisResultToAiFinding } from "./AnalyzerAgent.js";
import { CollectorAgent } from "./CollectorAgent.js";
import { PolicyAgent } from "./PolicyAgent.js";
import { RuleAgent, type RuleDetectionResult } from "./RuleAgent.js";
import { createCaseRepository, type ICaseRepository } from "../repositories/CaseRepository.js";
import { EvidenceService } from "../services/EvidenceService.js";
import { ReportService } from "../services/ReportService.js";
import { riskLevelFromScore } from "../utils/validation.js";
import { TextExtractor, type ExtractionResult } from "../services/TextExtractor.js";
import { ScoringAgent } from "./ScoringAgent.js";

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
  private scoring = new ScoringAgent();

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
    // 모듈별 키워드 룰을 사용한다. RuleAgent 가 지원하는 모듈만 전달하고, 그 외는 false_ad 로 안전 폴백.
    const RULE_SUPPORTED = new Set(["false_ad", "general_food_false_ad", "cosmetic_false_ad", "counterfeit_goods", "origin_labeling"]);
    const ruleModuleId = RULE_SUPPORTED.has(request.moduleId) ? request.moduleId : "false_ad";
    const detection: RuleDetectionResult = this.rules.detectDetailed(
      extraction
        ? {
            claimCandidates: extraction.claimCandidates,
            reviewCandidates: extraction.reviewCandidates,
            mainText: extraction.mainText.slice(0, FALLBACK_TAIL_MAX)
          }
        : { text: doc.text },
      ruleModuleId
    );

    const score = detection.riskScore;

    // 새 분석기 — 문맥 인지 분석 (LLM 또는 mock)
    const llmAnalysis = await this.analyzer.analyzeWithContext({
      moduleId: request.moduleId,
      url: doc.url,
      title: extraction?.title ?? doc.title,
      memo: request.memo,
      extractionResult: extraction
        ? {
            productName: extraction.productName,
            claimCandidates: extraction.claimCandidates,
            reviewCandidates: extraction.reviewCandidates,
            mainText: extraction.mainText.slice(0, 6000)
          }
        : undefined,
      ruleDetectionResult: {
        riskScore: detection.riskScore,
        riskLevel: detection.riskLevel,
        counts: detection.counts,
        matches: detection.matches.map((m) => ({
          ruleId: m.ruleId,
          keyword: m.keyword,
          riskLevel: m.riskLevel,
          sourceSection: m.sourceSection,
          sentence: m.sentence,
          reason: m.reason,
          category: m.category
        }))
      },
      evidenceSummary: {
        productName: extraction?.productName,
        priceCandidates: extraction?.priceCandidates,
        hasHtml: true,
        hasText: true,
        hasScreenshot: false,
        hasPdf: false
      }
    });

    const aiFinding = analysisResultToAiFinding(llmAnalysis, score);
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

    // 우선순위 점수 계산 (rule + llm + evidence + commercial + repetition + extraction)
    const scoringResult = this.scoring.computePriority({
      moduleId: request.moduleId,
      url: doc.url,
      title: extraction?.title ?? doc.title,
      extractionResult: extraction
        ? {
            productName: extraction.productName,
            textLength: extraction.textLength,
            priceCandidates: extraction.priceCandidates,
            claimCandidates: extraction.claimCandidates,
            reviewCandidates: extraction.reviewCandidates,
            ingredientCandidates: extraction.ingredientCandidates,
            warningCandidates: extraction.warningCandidates,
            sellerCandidates: extraction.sellerCandidates,
            extractionWarnings: extraction.extractionWarnings
          }
        : undefined,
      ruleDetectionResult: {
        riskScore: detection.riskScore,
        riskLevel: detection.riskLevel,
        counts: detection.counts,
        matches: detection.matches.map((m) => ({
          ruleId: m.ruleId,
          keyword: m.keyword,
          riskLevel: m.riskLevel,
          matchType: m.matchType,
          category: m.category,
          sourceSection: m.sourceSection,
          sentence: m.sentence
        }))
      },
      llmAnalysis: {
        overallRisk: llmAnalysis.overallRisk,
        violationLikelihood: llmAnalysis.violationLikelihood,
        confidence: llmAnalysis.confidence,
        notLegalConclusion: llmAnalysis.notLegalConclusion,
        rewardGuaranteed: llmAnalysis.rewardGuaranteed
      },
      evidenceSummary: {
        hasUrl: Boolean(doc.url),
        hasHtml: Boolean(evidence.htmlPath),
        hasText: Boolean(evidence.textPath),
        hasScreenshot: Boolean(evidence.screenshotPath),
        hasPdf: Boolean(evidence.pdfPath),
        hasMetadata: true,
        hasManifest: true,
        hasSha256: true,
        capturedAt: evidence.capturedAt,
        productName: extraction?.productName,
        priceCandidates: extraction?.priceCandidates
      }
    });

    // 최종 RewardCase.score 는 priorityScore (헤드라인 점수). RuleAgent 단독 점수는 ruleDetection.riskScore 로 별도 보관.
    const priorityScore = scoringResult.priorityScore;
    const initialStatus: CaseStatus = priorityScore >= 50 ? "REVIEW" : "DRAFT";

    const ruleDetectionForCase: CaseRuleDetection = {
      schemaVersion: detection.schemaVersion,
      matches: detection.matches.slice(0, 50),
      riskScore: detection.riskScore,
      riskLevel: detection.riskLevel,
      counts: detection.counts,
      repeatedPhrases: detection.repeatedPhrases,
      cooccurrence: detection.cooccurrence,
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
      score: priorityScore,
      riskScore: priorityScore,
      riskLevel: scoringResult.priorityLabel,
      agencyCandidate: aiFinding.recommendedAgency,
      summary: `${aiFinding.summary} · 신고 후보 우선순위 점수 ${priorityScore}/100 (${scoringResult.priorityLabel})`,
      rewardCaution: "포상금 수령을 보장하지 않습니다.",
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
      ruleDetection: ruleDetectionForCase,
      llmAnalysis,
      scoringResult,
      collection: {
        status: doc.collectionStatus ?? "fetched",
        note: doc.collectionNote,
        fetchedAt: doc.fetchedAt
      }
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
