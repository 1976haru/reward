export const CONTRACTOR_NETWORK_RISK_LEVELS = ["high", "medium", "low", "minimal"] as const;
export type ContractorNetworkRiskLevel = (typeof CONTRACTOR_NETWORK_RISK_LEVELS)[number];

export const CONTRACTOR_NETWORK_SIGNAL_WEIGHTS = {
  recipientVendorPairRepeated: { label: "same recipient-contractor pair repeated", score: 30 },
  vendorRepeatedAcrossProjects: { label: "contractor repeated across projects", score: 20 },
  vendorRepeatedAcrossRecipients: { label: "contractor repeated across recipients", score: 20 },
  projectContractTitleSimilar: { label: "project and contract title are similar", score: 15 },
  sameOrAdjacentFiscalYear: { label: "same or adjacent fiscal year", score: 10 },
  similarContractAmount: { label: "similar contract amount", score: 10 },
  addressKeyRelated: { label: "address region key related", score: 10 },
  orderingAgencyRepeated: { label: "ordering agency repeated", score: 10 },
  evidenceUrlPresent: { label: "source or evidence URL present", score: 5 },
  businessNumberHashMatch: { label: "business registration hash match", score: 25 },
  corporateNumberHashMatch: { label: "corporate registration hash match", score: 25 }
} as const;

export type ContractorNetworkSignalCode = keyof typeof CONTRACTOR_NETWORK_SIGNAL_WEIGHTS;

export interface ContractorNetworkSignal {
  code: ContractorNetworkSignalCode;
  label: string;
  score: number;
}

export interface ContractorNetworkNode {
  nodeKey: string;
  nodeType: "recipient" | "contractor";
  displayName?: string;
  normalizedName?: string;
  addressRegionKey?: string;
}

export interface ContractorNetworkEdge {
  edgeId: string;
  subsidyRecordId: string;
  contractRecordId?: string;
  recipientKey: string;
  contractorKey: string;
  recipientName?: string;
  normalizedRecipientName?: string;
  contractorName?: string;
  normalizedContractorName?: string;
  subsidyProjectName?: string;
  projectNameCompactKey?: string;
  contractTitle?: string;
  contractTitleCompactKey?: string;
  contractAmount?: number;
  subsidyAmount?: number;
  fiscalYear?: number;
  contractDate?: string;
  orderingAgencyName?: string;
  recipientAddressRegionKey?: string;
  contractorAddressRegionKey?: string;
  businessRegistrationNumberHash?: string;
  corporateRegistrationNumberHash?: string;
  sourceUrl?: string;
  evidenceUrl?: string;
}

export interface ContractorNetworkRiskEvidence {
  edgeId: string;
  subsidyRecordId: string;
  contractRecordId?: string;
  recipientName?: string;
  normalizedRecipientName?: string;
  contractorName?: string;
  normalizedContractorName?: string;
  subsidyProjectName?: string;
  contractTitle?: string;
  contractAmount?: number;
  subsidyAmount?: number;
  fiscalYear?: number;
  contractDate?: string;
  orderingAgencyName?: string;
  sourceUrl?: string;
  evidenceUrl?: string;
}

export interface ContractorNetworkRiskCandidate {
  candidateId: string;
  networkKey: string;
  recipientKey?: string;
  contractorKey: string;
  involvedRecordIds: string[];
  involvedContractIds: string[];
  riskScore: number;
  riskLevel: ContractorNetworkRiskLevel;
  networkSignals: ContractorNetworkSignal[];
  evidence: ContractorNetworkRiskEvidence[];
  reason: string;
  cautionNotes: string[];
  reviewRequired: boolean;
  createdAt: string;
}

export interface ContractorNetworkRiskOptions {
  limit?: number;
  minScore?: number;
  runId?: string;
  isRealData?: boolean;
  sourceNote?: string;
  outputDir?: string;
  titleSimilarityThreshold?: number;
  amountSimilarityThreshold?: number;
}

export interface ContractorNetworkRiskReport {
  runId: string;
  totalEdges: number;
  totalCandidates: number;
  topCandidates: ContractorNetworkRiskCandidate[];
  signalSummary: Record<string, number>;
  createdAt: string;
  notes: string[];
  isRealData: boolean;
  sourceNote: string;
  reportJsonFile?: string;
  reportMdFile?: string;
}

export const CONTRACTOR_NETWORK_RISK_THRESHOLDS = { high: 80, medium: 60, low: 40 } as const;

export const CONTRACTOR_NETWORK_RISK_NOTICE =
  "본 모듈은 수급단체와 계약업체/용역업체의 반복 연결을 계약업체 연관성 후보, 반복 연결 검토 후보, 추가 확인 필요 후보로 산출합니다. " +
  "위법 여부를 판단하지 않으며, 같은 업체 반복 등장만으로 문제라고 단정하지 않습니다. " +
  "사업자등록번호와 법인등록번호 원문은 저장하지 않고 해시만 사용할 수 있으며, 대표자명·전화번호·상세주소는 단독 기준으로 사용하지 않습니다. " +
  "로그인 필요 자료, 비공개자료, 내부자료, 개인정보 원문은 탐지 근거와 evidence, reason, report에 넣지 않습니다. 모든 후보는 reviewRequired=true입니다.";
