/**
 * BidCollusionGuideService — 입찰담합 의심 패턴 분석 모듈(`bid_collusion`)의
 * 실전 공정위 담합 신고·포상 가이드 안내 (조회 전용).
 *
 * 안전 원칙:
 * - 외부 신고기관(공정거래위원회 / 국민신문고)에 자동 제출하지 않는다.
 * - 담합 여부를 단정하지 않는다. 모든 항목은 "담합 의심 패턴 검토 후보" 로 표현한다.
 * - 특정 업체를 형사적 표현으로 단정하지 않는다.
 * - 포상금/보상금 수령을 보장하지 않는다.
 * - 표현 정책: 담합 단정 / 지급 단정 / 보장 단정 류의 긍정 표현은 사용하지 않는다.
 *   대신 "검토가 필요합니다", "공식 기준 확인 필요", "법 위반 인정 및 공정위 조치 결과 필요"
 *   같은 중립 표현을 사용한다.
 */

export const BID_COLLUSION_GUIDE_SAFETY_NOTICE =
  "이 가이드는 신고지원용이며, 담합 여부 또는 포상금 지급을 확정하지 않습니다. 공익레이더는 외부 신고기관에 자동으로 제출하지 않으며, 포상금 수령을 보장하지 않습니다. 담합 여부와 포상금 지급 여부는 공정거래위원회 등 관계기관의 공식 조사·조치 결과에 따라 달라지며, 실전 신고 전 공정위 공식 페이지에서 사람이 직접 최신 기준을 확인하세요.";

export interface BidCollusionReportingChannel {
  id: string;
  agencyName: string;
  officialUrl: string;
  description: string;
  caution: string;
}

export interface BidCollusionSuspiciousPattern {
  id: string;
  category: string;
  examples: string[];
  whyItMatters: string;
  reviewLevel: "HIGH" | "MEDIUM" | "LOW";
}

export interface BidCollusionEvidenceChecklistItem {
  id: string;
  label: string;
  required: boolean;
  hint: string;
}

export interface BidCollusionPreReportChecklistItem {
  id: string;
  label: string;
  required: boolean;
}

export interface BidCollusionRewardCaution {
  title: string;
  summary: string;
  notGuaranteed: true;
  officialCheckRequired: true;
  notes: string[];
}

export interface BidCollusionExampleEntry {
  text: string;
  category: "suspicious" | "normal" | "needs_review";
  explanation: string;
}

export interface BidCollusionOfficialLink {
  id: string;
  label: string;
  url: string;
  caution: string;
}

export interface BidCollusionGuidePayload {
  schemaVersion: "1.0.0";
  moduleId: "bid_collusion";
  displayName: string;
  generatedAt: string;
  reportingChannels: BidCollusionReportingChannel[];
  suspiciousPatterns: BidCollusionSuspiciousPattern[];
  evidenceChecklist: BidCollusionEvidenceChecklistItem[];
  preReportChecklist: BidCollusionPreReportChecklistItem[];
  rewardCaution: BidCollusionRewardCaution;
  examples: BidCollusionExampleEntry[];
  officialLinks: BidCollusionOfficialLink[];
  safetyNotice: string;
}

const REPORTING_CHANNELS: BidCollusionReportingChannel[] = [
  {
    id: "ftc-reward-guide",
    agencyName: "공정거래위원회",
    officialUrl: "https://www.ftc.go.kr/www/contents.do?key=402",
    description:
      "공정거래위원회 신고포상금 안내. 법 위반행위 신고에 대한 포상금 지급 기준을 안내합니다.",
    caution:
      "신고포상금 지급 여부와 금액은 공식 기준, 조치 결과, 증거 수준에 따라 달라집니다. 본 시스템은 자동 제출하지 않습니다."
  },
  {
    id: "ftc-cartel-report",
    agencyName: "공정거래위원회",
    officialUrl: "https://www.ftc.go.kr/www/contents.do?key=368",
    description:
      "담합·출고조절·불공정거래행위 신고 안내. 신고서 작성 시 육하원칙 작성과 증빙자료 제출이 필요합니다.",
    caution:
      "실제 신고 전 최신 신고서 양식과 접수 경로를 공식 페이지에서 사람이 직접 확인해야 합니다."
  },
  {
    id: "ftc-report-method-epeople",
    agencyName: "공정거래위원회 / 국민신문고",
    officialUrl: "https://www.ftc.go.kr/www/contents.do?key=320",
    description:
      "공정위 신고방법 및 국민신문고 연계 신고 경로 안내.",
    caution: "사안별 신고분류와 제출 경로가 달라질 수 있으므로 공식 페이지에서 사람이 직접 확인하세요."
  }
];

const SUSPICIOUS_PATTERNS: BidCollusionSuspiciousPattern[] = [
  {
    id: "repeated-bidder-group",
    category: "동일 업체군 반복 참여",
    examples: [
      "같은 업체 3~5개가 여러 입찰에 반복 참여",
      "특정 지역/품목에서 늘 같은 업체군이 경쟁"
    ],
    whyItMatters:
      "반복 업체군은 담합 가능성을 검토할 수 있는 정형 패턴이지만, 그 자체로 담합 단정은 아니며 추가 검토가 필요합니다.",
    reviewLevel: "HIGH"
  },
  {
    id: "rotating-winners",
    category: "순환 낙찰 패턴",
    examples: [
      "A, B, C 업체가 순서대로 낙찰",
      "특정 업체군 안에서 낙찰자가 돌아가며 바뀜"
    ],
    whyItMatters:
      "순환 낙찰 패턴은 담합 의심 패턴 중 하나로 검토가 필요한 신호이지만, 그 자체로 담합 단정은 아닙니다.",
    reviewLevel: "HIGH"
  },
  {
    id: "cover-bidding",
    category: "들러리 의심 투찰",
    examples: [
      "낙찰자보다 조금 높은 금액으로 반복 투찰",
      "항상 낙찰권 밖 비슷한 순위로 참여"
    ],
    whyItMatters:
      "들러리 패턴 후보로 분류되며 검토가 필요한 신호이지만, 단일 입찰만으로는 담합 단정이 어렵습니다.",
    reviewLevel: "HIGH"
  },
  {
    id: "narrow-bid-spread",
    category: "비정상적으로 좁은 투찰 간격",
    examples: [
      "투찰금액 차이가 반복적으로 매우 작음",
      "업체별 투찰률이 특정 범위에 몰림"
    ],
    whyItMatters:
      "투찰 분포가 비정상적으로 좁은 경우 검토가 필요한 신호일 수 있습니다. 정상 경쟁에서도 발생할 수 있으므로 추가 분석이 필요합니다.",
    reviewLevel: "MEDIUM"
  },
  {
    id: "award-rate-clustering",
    category: "낙찰률 특정 구간 집중",
    examples: [
      "낙찰률이 87.7~88.3% 근처에 반복 집중",
      "발주기관/품목별 정상 분포와 다르게 특정 구간 집중"
    ],
    whyItMatters:
      "낙찰률 군집은 담합 의심 패턴으로 검토가 필요하나, 가격 입찰 제도나 업종 특성에 따른 정상 분포일 수도 있습니다.",
    reviewLevel: "MEDIUM"
  },
  {
    id: "single-winner-dominance",
    category: "특정 업체 반복 낙찰",
    examples: [
      "특정 품목/지역에서 한 업체가 과도하게 반복 낙찰",
      "경쟁업체는 반복 참여하지만 낙찰하지 못함"
    ],
    whyItMatters:
      "단일 업체 지배 패턴은 검토가 필요한 신호이지만, 기술력·가격경쟁력에 따른 정상 낙찰일 수도 있어 추가 분석이 필요합니다.",
    reviewLevel: "HIGH"
  },
  {
    id: "repeated-low-competition",
    category: "낮은 경쟁 반복",
    examples: [
      "반복적으로 참여업체 수가 적음",
      "같은 업체 두세 곳만 계속 참여"
    ],
    whyItMatters:
      "낮은 경쟁 반복은 들러리·담합 의심 패턴의 배경이 될 수 있어 검토가 필요한 신호입니다.",
    reviewLevel: "MEDIUM"
  },
  {
    id: "post-bid-contract-pattern",
    category: "입찰 전후 계약 패턴 의심",
    examples: [
      "낙찰 후 특정 하도급/용역업체 반복 등장",
      "계약 변경이 반복적으로 특정 방향으로 발생"
    ],
    whyItMatters:
      "낙찰 이후 계약 단계에서 반복되는 패턴은 추가 검토가 필요한 신호일 수 있으며, 그 자체로 담합 단정은 아닙니다.",
    reviewLevel: "MEDIUM"
  }
];

const EVIDENCE_CHECKLIST: BidCollusionEvidenceChecklistItem[] = [
  { id: "bid-notice-number", label: "입찰공고번호", required: true, hint: "공개된 입찰공고번호를 기록합니다." },
  { id: "bid-notice-name", label: "공고명", required: true, hint: "공고명 그대로 보존합니다." },
  { id: "ordering-agency", label: "발주기관", required: true, hint: "발주기관명을 기록합니다." },
  { id: "notice-date", label: "공고일자", required: true, hint: "공고일자를 기록합니다." },
  { id: "opening-date", label: "개찰일자", required: true, hint: "개찰일자를 기록합니다." },
  { id: "base-price", label: "기초금액 또는 예정가격", required: true, hint: "공개된 기초금액·예정가격을 기록합니다." },
  { id: "award-price", label: "낙찰금액", required: true, hint: "낙찰금액을 기록합니다." },
  { id: "award-rate", label: "낙찰률", required: true, hint: "낙찰률(%)을 기록합니다. 군집 분석에 사용됩니다." },
  { id: "winner", label: "낙찰자", required: true, hint: "낙찰자(업체명)를 기록합니다. 단정 표현은 사용하지 않습니다." },
  { id: "participants", label: "참여업체 목록", required: true, hint: "참여업체 목록 전체를 기록합니다." },
  { id: "bid-prices", label: "업체별 투찰금액", required: true, hint: "업체별 투찰금액을 표 형태로 정리합니다." },
  { id: "bid-rates", label: "업체별 투찰률", required: true, hint: "업체별 투찰률(%)을 표 형태로 정리합니다." },
  { id: "bid-ranks", label: "업체별 개찰순위", required: true, hint: "업체별 개찰순위를 정리합니다." },
  { id: "repeated-bidder-evidence", label: "반복 참여 업체군 근거", required: true, hint: "동일 업체군이 반복 등장하는 입찰 건들의 목록을 정리합니다." },
  { id: "rotation-cover-analysis", label: "순환 낙찰 또는 들러리 패턴 분석표", required: false, hint: "순환·들러리 패턴 후보가 있는 경우 분석표 형태로 첨부합니다." },
  { id: "source-url", label: "원본 공개자료 URL", required: true, hint: "공개자료(나라장터·기관 공시 등) 원본 URL을 기록합니다." },
  { id: "collected-at", label: "수집일시", required: true, hint: "원본 자료가 사후 수정될 수 있어 수집 시점을 명시합니다." },
  { id: "analysis-report", label: "분석 리포트", required: true, hint: "패턴 분석 리포트(요약·표·근거)를 첨부합니다." },
  { id: "screenshot-pdf", label: "화면 캡처 / PDF (가능할 경우)", required: false, hint: "공개 페이지의 화면 캡처/PDF가 있으면 함께 보존합니다." }
];

const PRE_REPORT_CHECKLIST: BidCollusionPreReportChecklistItem[] = [
  { id: "public-source-confirmed", label: "원본 입찰공고와 개찰결과가 공개자료인지 확인", required: true },
  { id: "participants-bids-organized", label: "참여업체와 투찰금액이 정확히 정리됐는지 확인", required: true },
  { id: "multiple-cases-pattern", label: "최소 여러 건의 반복 패턴이 있는지 확인", required: true },
  { id: "no-single-case-conclusion", label: "단일 입찰 결과만으로 담합을 단정하지 않았는지 확인", required: true },
  { id: "no-cartel-affirmation-text", label: "담합을 단정하는 표현이 신고서 초안에 들어가 있지 않은지 확인", required: true },
  { id: "ftc-form-rechecked", label: "공정위 신고서 양식과 최신 신고경로를 공식 페이지에서 확인했는지 확인", required: true },
  { id: "evidence-tabular", label: "증빙자료가 표나 CSV 형태로 정리됐는지 확인", required: true },
  { id: "no-defamatory-company-naming", label: "특정 업체명 표시 시 단정 표현을 피했는지 확인", required: true },
  { id: "human-submits", label: "최종 제출은 사람이 직접 수행하는지 확인 (자동 제출 미수행)", required: true }
];

const REWARD_CAUTION: BidCollusionRewardCaution = {
  title: "공정위 담합 신고포상금 기준 안내",
  summary:
    "공정거래위원회 신고포상금 안내에 따르면 담합 등 부당한 공동행위 신고는 공식 기준에 따라 포상금 지급 대상이 될 수 있으며, 담합 신고포상금은 공식 안내상 최대 30억 원으로 안내됩니다. 다만 실제 지급 여부와 금액은 법 위반 인정, 조치 결과, 과징금 또는 시정명령, 제출 증거 수준, 지급 제외 사유 등에 따라 달라집니다. 공익레이더는 포상금 수령을 보장하지 않습니다.",
  notGuaranteed: true,
  officialCheckRequired: true,
  notes: [
    "공식 신고포상금 산정 기준은 사람이 직접 확인이 필요합니다.",
    "담합 신고포상금은 공식 안내상 최대 30억 원 상한선이 있으나, 지급 자체를 보장하는 것은 아닙니다.",
    "단순 의심만으로는 부족하며 증빙자료의 수준이 중요합니다.",
    "법 위반 인정 및 공정위 조치 결과가 필요할 수 있습니다.",
    "본 화면은 금액을 확정 표시하지 않습니다."
  ]
};

const EXAMPLES: BidCollusionExampleEntry[] = [
  { text: "동일 업체군 A/B/C가 12건 입찰에 반복 참여하고 낙찰자가 순환됨", category: "suspicious", explanation: "반복 업체군 + 순환 낙찰 의심 패턴 후보로 검토가 필요합니다." },
  { text: "낙찰자 외 업체들이 낙찰금액보다 0.2~0.5% 높은 금액으로 반복 투찰", category: "suspicious", explanation: "들러리 의심 투찰 패턴 후보로 검토가 필요합니다." },
  { text: "특정 품목에서 한 업체가 20건 중 17건 낙찰, 동일 경쟁업체가 반복 참여", category: "suspicious", explanation: "단일 업체 지배 + 반복 경쟁업체 패턴 후보로 검토가 필요합니다." },
  { text: "낙찰률이 특정 구간에 과도하게 집중", category: "suspicious", explanation: "낙찰률 군집 의심 패턴 후보로 검토가 필요합니다." },

  { text: "단일 입찰에서 우연히 비슷한 투찰금액 발생", category: "normal", explanation: "단일 사례는 정상 경쟁의 우연일 수 있어 단정하지 않습니다." },
  { text: "업체 수가 적은 지역의 정상적 경쟁", category: "normal", explanation: "지역·업종 특성에 따른 정상 경쟁일 수 있습니다." },
  { text: "한 업체가 기술력/가격경쟁력으로 반복 낙찰", category: "normal", explanation: "정상적인 경쟁우위에 의한 반복 낙찰일 수 있습니다." },

  { text: "낙찰률이 비슷하지만 데이터 기간이 짧음", category: "needs_review", explanation: "기간이 짧은 경우 군집 해석에 주의해야 하므로 추가 데이터 확보 후 검토합니다." },
  { text: "업체군이 반복되지만 품목·지역이 제한적", category: "needs_review", explanation: "품목·지역 제한 때문일 수도 있어 맥락 검토가 필요합니다." },
  { text: "하도급 반복 여부가 추가 확인 필요", category: "needs_review", explanation: "낙찰 이후 하도급 패턴은 추가 자료 확보 후 검토가 필요합니다." }
];

const OFFICIAL_LINKS: BidCollusionOfficialLink[] = [
  {
    id: "ftc-reward-guide",
    label: "공정거래위원회 — 신고포상금 안내",
    url: "https://www.ftc.go.kr/www/contents.do?key=402",
    caution: "신고포상금 지급 여부와 금액은 공식 기준·조치 결과·증거 수준에 따라 달라집니다. 본 화면은 금액을 확정 표시하지 않습니다."
  },
  {
    id: "ftc-cartel-report",
    label: "공정거래위원회 — 담합 신고 안내",
    url: "https://www.ftc.go.kr/www/contents.do?key=368",
    caution: "신고서 작성 시 육하원칙과 증빙자료가 필요합니다. 최신 신고서 양식·접수 경로를 공식 페이지에서 사람이 직접 확인하세요."
  },
  {
    id: "ftc-report-method-epeople",
    label: "공정거래위원회 — 신고방법 안내 / 국민신문고 연계",
    url: "https://www.ftc.go.kr/www/contents.do?key=320",
    caution: "사안별 신고분류와 제출 경로가 달라질 수 있으니 공식 페이지에서 사람이 직접 확인하세요."
  },
  {
    id: "ftc-unfair-trade-report",
    label: "공정거래위원회 — 불공정거래 신고 안내 (참고)",
    url: "https://www.ftc.go.kr/www/cmsTmpl.do?cmsCode=newReport",
    caution: "사이트 구조 변경으로 페이지 위치가 바뀔 수 있으니 공정위 메인에서 '신고' 메뉴를 사람이 직접 확인하세요."
  }
];

export class BidCollusionGuideService {
  getGuide(): BidCollusionGuidePayload {
    return {
      schemaVersion: "1.0.0",
      moduleId: "bid_collusion",
      displayName: "입찰담합 의심 패턴 분석 — 공정위 담합 신고·포상 가이드",
      generatedAt: new Date().toISOString(),
      reportingChannels: REPORTING_CHANNELS.map((c) => ({ ...c })),
      suspiciousPatterns: SUSPICIOUS_PATTERNS.map((p) => ({
        ...p,
        examples: p.examples.slice()
      })),
      evidenceChecklist: EVIDENCE_CHECKLIST.map((i) => ({ ...i })),
      preReportChecklist: PRE_REPORT_CHECKLIST.map((i) => ({ ...i })),
      rewardCaution: { ...REWARD_CAUTION, notes: REWARD_CAUTION.notes.slice() },
      examples: EXAMPLES.map((e) => ({ ...e })),
      officialLinks: OFFICIAL_LINKS.map((l) => ({ ...l })),
      safetyNotice: BID_COLLUSION_GUIDE_SAFETY_NOTICE
    };
  }
}

export const bidCollusionGuideService = new BidCollusionGuideService();
