/**
 * FalseAdGuideService — 1차 MVP (건강기능식품 온라인 허위·과대광고 탐지 모듈)의
 * 실전 신고·포상 가이드 안내 (조회 전용).
 *
 * 이 가이드는 신고지원/검토 후보 도구 안내이며, 다음을 수행하거나 단정하지 않는다.
 * - 외부 신고기관에 자동 제출하지 않는다.
 * - 법 위반을 확정하지 않는다.
 * - 포상금/보상금 수령을 보장하지 않는다.
 * - 표현 정책: 위법 단정 / 지급 단정 / 보장 단정 류의 긍정 표현은 사용하지 않는다.
 *   대신 "검토가 필요합니다", "공식 기준 확인 필요", "처리 결과에 따라 달라질 수 있습니다"
 *   같은 중립 표현을 사용한다.
 */

export const FALSE_AD_GUIDE_SAFETY_NOTICE =
  "이 가이드는 신고지원용이며, 법 위반 또는 포상금 지급을 확정하지 않습니다. 공익레이더는 외부 신고기관에 자동으로 제출하지 않으며, 포상금 수령을 보장하지 않습니다. 실전 신고 전 식약처 등 공식 페이지에서 최신 기준을 직접 확인하세요.";

export interface FalseAdReportingChannel {
  id: string;
  agencyName: string;
  officialUrl: string;
  description: string;
  caution: string;
}

export interface FalseAdProhibitedClaimExample {
  text: string;
  reviewLevel: "HIGH" | "MEDIUM" | "LOW";
}

export interface FalseAdProhibitedClaimType {
  id: string;
  category: string;
  examples: string[];
  whyItMatters: string;
  reviewLevel: "HIGH" | "MEDIUM" | "LOW";
}

export interface FalseAdEvidenceChecklistItem {
  id: string;
  label: string;
  required: boolean;
  hint: string;
}

export interface FalseAdPreReportChecklistItem {
  id: string;
  label: string;
  required: boolean;
}

export interface FalseAdRewardCaution {
  title: string;
  summary: string;
  notGuaranteed: true;
  officialCheckRequired: true;
  notes: string[];
}

export interface FalseAdExampleEntry {
  text: string;
  category: "suspicious" | "normal" | "needs_review";
  explanation: string;
}

export interface FalseAdOfficialLink {
  id: string;
  label: string;
  url: string;
  caution: string;
}

export interface FalseAdGuidePayload {
  schemaVersion: "1.0.0";
  moduleId: "false_ad";
  displayName: string;
  generatedAt: string;
  reportingChannels: FalseAdReportingChannel[];
  prohibitedClaimTypes: FalseAdProhibitedClaimType[];
  evidenceChecklist: FalseAdEvidenceChecklistItem[];
  preReportChecklist: FalseAdPreReportChecklistItem[];
  rewardCaution: FalseAdRewardCaution;
  examples: FalseAdExampleEntry[];
  officialLinks: FalseAdOfficialLink[];
  safetyNotice: string;
}

const REPORTING_CHANNELS: FalseAdReportingChannel[] = [
  {
    id: "mfds",
    agencyName: "식품의약품안전처",
    officialUrl: "https://www.mfds.go.kr/wpge/m_660/de010410l001.do",
    description:
      "식품·건강기능식품·화장품·의료기기 온라인 불법유통 신고 안내. 판매되는 식품·건강기능식품 등의 허위·과대광고 및 불법유통 신고를 접수합니다.",
    caution:
      "신고 전 공식 페이지에서 최신 경로(m_660 / m_661 등)와 제출 방법, 신고 분류를 사람이 직접 재확인해야 합니다. 본 시스템은 자동 제출하지 않습니다."
  },
  {
    id: "epeople",
    agencyName: "국민신문고",
    officialUrl: "https://www.epeople.go.kr",
    description: "일반 민원·신고 접수 경로. 행정기관 분류 후 관할 기관으로 이송될 수 있습니다.",
    caution: "구체적 접수 분류는 사안별로 확인이 필요합니다. 신고처 선택은 사람이 결정합니다."
  },
  {
    id: "local-health-center",
    agencyName: "관할 보건소 / 지자체",
    officialUrl: "",
    description:
      "사업장 소재지 또는 판매자 관할 기관(보건소·지자체)에 신고가 필요한 경우가 있습니다. 관할 지자체 공식 홈페이지에서 신고 부서를 확인하세요.",
    caution: "관할은 사안별로 달라질 수 있으며, 관할 지자체 공식 안내에서 사람이 직접 확인해야 합니다."
  }
];

const PROHIBITED_CLAIM_TYPES: FalseAdProhibitedClaimType[] = [
  {
    id: "disease-treatment",
    category: "질병 치료 표현",
    examples: ["당뇨 치료", "고혈압 치료", "관절염 치료", "비염 치료"],
    whyItMatters:
      "건강기능식품을 질병 치료제처럼 오인하게 할 수 있으므로 검토가 필요합니다. 위법 확정이 아니라 사람이 추가 점검해야 할 검토 후보로 분류합니다.",
    reviewLevel: "HIGH"
  },
  {
    id: "disease-cure",
    category: "질병 완치 표현",
    examples: ["당뇨 완치", "암 완치", "불면증 완치"],
    whyItMatters:
      "완치를 단정하는 표현은 의약품 효능을 표시한 것으로 오인될 수 있어 검토가 필요합니다.",
    reviewLevel: "HIGH"
  },
  {
    id: "disease-prevention",
    category: "질병 예방 표현",
    examples: ["암 예방", "코로나 예방", "치매 예방"],
    whyItMatters:
      "질병 예방 효능을 단정하는 표현은 건강기능식품 광고 범위를 벗어날 수 있으므로 검토가 필요합니다.",
    reviewLevel: "HIGH"
  },
  {
    id: "drug-substitute",
    category: "의약품 오인 표현",
    examples: ["약 대신", "혈압약 대체", "병원 갈 필요 없음", "부작용 없는 치료"],
    whyItMatters:
      "건강기능식품이 의약품을 대체할 수 있다는 인상을 줄 수 있으므로 검토가 필요합니다.",
    reviewLevel: "HIGH"
  },
  {
    id: "exaggerated-efficacy",
    category: "과장 효능 표현",
    examples: ["하루 만에 효과", "기적의 효과", "100% 효과", "먹기만 하면 해결"],
    whyItMatters:
      "객관적 근거 없이 효능을 단정하는 과장 표현은 소비자 오인 가능성이 있어 검토가 필요합니다.",
    reviewLevel: "MEDIUM"
  },
  {
    id: "body-function-detox",
    category: "신체 기능 과장 / 해독 표현",
    examples: ["혈관 청소", "독소 배출", "간 해독", "지방 분해"],
    whyItMatters:
      "신체 기능 또는 해독 효과를 단정하는 표현은 의학적 효능과 혼동될 수 있으므로 검토가 필요합니다.",
    reviewLevel: "MEDIUM"
  }
];

const EVIDENCE_CHECKLIST: FalseAdEvidenceChecklistItem[] = [
  { id: "source-url", label: "원본 URL", required: true, hint: "공개 접근 가능한 페이지 URL을 그대로 보존합니다." },
  { id: "collected-at", label: "수집일시", required: true, hint: "원본 페이지가 사후 수정·삭제될 수 있어 수집 시점을 명시합니다." },
  { id: "product-name", label: "상품명 또는 광고 제목", required: true, hint: "검토 대상이 특정 상품·게시물임을 식별할 수 있어야 합니다." },
  { id: "ad-text", label: "광고 문구 원문", required: true, hint: "의심 표현이 포함된 문구를 원문 그대로 보존합니다." },
  { id: "claim-location", label: "의심 문구 위치", required: true, hint: "페이지 내 위치(섹션·스크롤 영역 등)를 함께 메모합니다." },
  { id: "screenshot", label: "화면 캡처", required: true, hint: "원본 페이지가 수정·삭제되더라도 검토할 수 있도록 캡처를 저장합니다." },
  { id: "pdf", label: "PDF 저장본", required: true, hint: "캡처 외에 PDF 형태 저장본을 추가로 보존하면 사람이 재검토하기 쉽습니다." },
  { id: "text-extract", label: "텍스트 추출본", required: true, hint: "본문 텍스트 추출본을 함께 보관하면 키워드 검토가 쉬워집니다." },
  { id: "seller-public-info", label: "판매자 공개 정보", required: false, hint: "공개된 판매자 정보(상호·대표자 표시 등)만 기록합니다. 개인정보는 수집하지 않습니다." },
  { id: "official-check-record", label: "신고처 공식 기준 확인 결과", required: true, hint: "식약처 등 공식 페이지에서 사람이 직접 확인한 결과(일자·요약)를 기록합니다." }
];

const PRE_REPORT_CHECKLIST: FalseAdPreReportChecklistItem[] = [
  { id: "is-public-url", label: "공개 URL인지 확인", required: true },
  { id: "no-login-required", label: "로그인 없이 접근 가능한지 확인", required: true },
  { id: "claim-visible-on-page", label: "의심 문구가 실제 페이지에 표시되는지 확인", required: true },
  { id: "screenshot-pdf-open", label: "캡처와 PDF가 정상적으로 열리는지 확인", required: true },
  { id: "no-unneeded-pii", label: "개인정보가 불필요하게 포함되지 않았는지 확인", required: true },
  { id: "mfds-page-rechecked", label: "식약처 공식 신고 페이지를 재확인했는지 확인", required: true },
  { id: "no-reward-guarantee-text", label: "포상금 수령을 보장하는 표현이 신고서 초안에 들어가 있지 않은지 확인", required: true },
  { id: "human-submits", label: "최종 제출은 사람이 직접 수행하는지 확인 (자동 제출 미수행)", required: true }
];

const REWARD_CAUTION: FalseAdRewardCaution = {
  title: "신고포상금 지급 기준 안내",
  summary:
    "건강기능식품 관련 신고포상금 지급 여부와 금액은 관련 법령·고시, 위반 확인, 행정처분·고발 등 처리 결과, 지급 제외 사유에 따라 달라질 수 있습니다. 공익레이더는 포상금 수령을 보장하지 않습니다.",
  notGuaranteed: true,
  officialCheckRequired: true,
  notes: [
    "공식 법령과 고시를 사람이 직접 확인해야 합니다.",
    "지급 대상과 지급 제외 사유가 있을 수 있습니다.",
    "기관별 지급 한도와 절차가 있을 수 있습니다.",
    "신고 내용이 위반행위로 확인되어야 지급 검토 대상이 될 수 있습니다.",
    "본 화면은 금액을 확정 표시하지 않습니다."
  ]
};

const EXAMPLES: FalseAdExampleEntry[] = [
  { text: "당뇨 완치에 도움", category: "suspicious", explanation: "질병 완치 단정 표현으로 검토가 필요합니다." },
  { text: "혈압약 대신 먹는 영양제", category: "suspicious", explanation: "의약품 대체 인식을 줄 수 있어 검토가 필요합니다." },
  { text: "암 예방 효과", category: "suspicious", explanation: "질병 예방 효능 단정 표현으로 검토가 필요합니다." },
  { text: "하루 만에 관절염 통증 해결", category: "suspicious", explanation: "즉시·과장 효능 표현으로 검토가 필요합니다." },
  { text: "독소를 완전히 배출", category: "suspicious", explanation: "신체 기능·해독 단정 표현으로 검토가 필요합니다." },

  { text: "건강 유지에 도움을 줄 수 있음", category: "normal", explanation: "기능성 표시 허용 범위 안의 완화된 표현 예시입니다. 실제 표시 가능 여부는 공식 기준 확인이 필요합니다." },
  { text: "균형 잡힌 식생활과 함께 섭취하세요", category: "normal", explanation: "보조적 안내 문구 예시입니다." },
  { text: "질환자는 전문가와 상담 후 섭취하세요", category: "normal", explanation: "주의·상담 안내 문구 예시입니다." },

  { text: "혈당 관리에 도움", category: "needs_review", explanation: "맥락과 기능성 인정 범위 확인이 필요합니다. 표시 허용 여부는 식약처 공식 기준에서 확인해야 합니다." },
  { text: "면역력 관리", category: "needs_review", explanation: "표시 허용 범위와 근거 확인이 필요합니다." },
  { text: "피로 개선", category: "needs_review", explanation: "기능성 인정 여부와 표시 문구 적정성 확인이 필요합니다." }
];

const OFFICIAL_LINKS: FalseAdOfficialLink[] = [
  {
    id: "mfds-online-illegal-trade",
    label: "식품의약품안전처 — 온라인 불법유통 신고",
    url: "https://www.mfds.go.kr/wpge/m_660/de010410l001.do",
    caution: "공식 경로가 변경(예: m_660 ↔ m_661)될 수 있으므로 실전 신고 전 사람이 직접 확인하세요."
  },
  {
    id: "mfds-online-illegal-trade-alt",
    label: "식품의약품안전처 — 온라인 불법유통 신고 (대체 경로 후보)",
    url: "https://www.mfds.go.kr/wpge/m_661/de010410l001.do",
    caution: "현재 식약처 사이트 구조가 변경된 경우의 대체 경로 후보입니다. 공식 안내가 최신인지 확인하세요."
  },
  {
    id: "health-functional-food-law",
    label: "건강기능식품에 관한 법률 — 국가법령정보센터",
    url: "https://www.law.go.kr",
    caution: "법령 검색에서 '건강기능식품에 관한 법률' 최신 본을 사람이 직접 확인하세요."
  },
  {
    id: "reward-rule-reference",
    label: "부정·불량 식품 및 건강기능식품 등의 신고포상금 지급 관련 규정 (참고)",
    url: "https://www.law.go.kr",
    caution: "고시·규정 번호와 시행일을 사람이 공식 페이지에서 확인해야 합니다. 본 화면은 금액을 확정 표시하지 않습니다."
  },
  {
    id: "food-safety-korea",
    label: "식품안전나라 / 식약처 허위·과대광고 안내",
    url: "https://www.foodsafetykorea.go.kr",
    caution: "허위·과대광고 관련 안내가 있는 코너의 위치는 변경될 수 있으니 사람이 직접 확인하세요."
  }
];

export class FalseAdGuideService {
  getGuide(): FalseAdGuidePayload {
    return {
      schemaVersion: "1.0.0",
      moduleId: "false_ad",
      displayName: "건강기능식품 온라인 허위·과대광고 신고·포상 가이드",
      generatedAt: new Date().toISOString(),
      reportingChannels: REPORTING_CHANNELS.map((c) => ({ ...c })),
      prohibitedClaimTypes: PROHIBITED_CLAIM_TYPES.map((t) => ({
        ...t,
        examples: t.examples.slice()
      })),
      evidenceChecklist: EVIDENCE_CHECKLIST.map((i) => ({ ...i })),
      preReportChecklist: PRE_REPORT_CHECKLIST.map((i) => ({ ...i })),
      rewardCaution: { ...REWARD_CAUTION, notes: REWARD_CAUTION.notes.slice() },
      examples: EXAMPLES.map((e) => ({ ...e })),
      officialLinks: OFFICIAL_LINKS.map((l) => ({ ...l })),
      safetyNotice: FALSE_AD_GUIDE_SAFETY_NOTICE
    };
  }
}

export const falseAdGuideService = new FalseAdGuideService();
