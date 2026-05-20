/**
 * SubsidyGuideService — 보조금 부정수급 의심 후보 탐지 모듈(`subsidy_fraud`)의
 * 실전 보조금/공익신고 보상·포상 가이드 안내 (조회 전용).
 *
 * 안전 원칙:
 * - 공공자료(공개 공고·공시·공공데이터포털 등) 기반으로만 검토하며, 비공개 자료는 다루지 않는다.
 * - 외부 신고기관(국민권익위원회·국민신문고·보조금 관리기관·지자체)에 자동 제출하지 않는다.
 * - 부정수급 여부를 단정하지 않는다. 횡령·사기·범죄 단정도 하지 않는다.
 * - 특정 단체·개인·사업자를 형사적 표현으로 단정하지 않는다.
 * - 포상금/보상금 수령을 보장하지 않는다.
 * - 표현 정책: 수령 단정 / 지급 단정 / 보장 단정 류의 긍정 표현은 사용하지 않는다.
 *   대신 "검토가 필요합니다", "공식 기준 확인 필요", "공개자료 기반 검토 후보" 같은
 *   중립 표현을 사용한다.
 */

export const SUBSIDY_GUIDE_SAFETY_NOTICE =
  "이 가이드는 신고지원용이며, 부정수급 여부 또는 보상·포상 지급을 확정하지 않습니다. 공익레이더는 외부 신고기관에 자동으로 제출하지 않으며, 보상금·포상금 수령을 보장하지 않습니다. 보상·포상 여부는 국민권익위원회·보조금 관리기관·지자체 등 관계기관의 공식 기준과 처리 결과(환수·처분·공공기관 수입 회복 등)에 따라 달라지며, 실전 신고 전 공식 페이지에서 사람이 직접 최신 기준을 확인하세요.";

export interface SubsidyReportingChannel {
  id: string;
  agencyName: string;
  officialUrl: string;
  description: string;
  caution: string;
}

export interface SubsidyPublicDataSource {
  id: string;
  name: string;
  officialUrl: string;
  dataTypes: string[];
  usage: string;
  caution: string;
}

export interface SubsidySuspiciousSignal {
  id: string;
  category: string;
  examples: string[];
  whyItMatters: string;
  reviewLevel: "HIGH" | "MEDIUM" | "LOW";
}

export interface SubsidyEvidenceChecklistItem {
  id: string;
  label: string;
  required: boolean;
  hint: string;
}

export interface SubsidyPreReportChecklistItem {
  id: string;
  label: string;
  required: boolean;
}

export interface SubsidyRewardCaution {
  title: string;
  summary: string;
  notGuaranteed: true;
  officialCheckRequired: true;
  notes: string[];
}

export interface SubsidyExampleEntry {
  text: string;
  category: "suspicious" | "normal" | "needs_review";
  explanation: string;
}

export interface SubsidyOfficialLink {
  id: string;
  label: string;
  url: string;
  caution: string;
}

export interface SubsidyGuidePayload {
  schemaVersion: "1.0.0";
  moduleId: "subsidy_fraud";
  displayName: string;
  generatedAt: string;
  reportingChannels: SubsidyReportingChannel[];
  publicDataSources: SubsidyPublicDataSource[];
  suspiciousSignals: SubsidySuspiciousSignal[];
  evidenceChecklist: SubsidyEvidenceChecklistItem[];
  preReportChecklist: SubsidyPreReportChecklistItem[];
  rewardCaution: SubsidyRewardCaution;
  examples: SubsidyExampleEntry[];
  officialLinks: SubsidyOfficialLink[];
  safetyNotice: string;
}

const REPORTING_CHANNELS: SubsidyReportingChannel[] = [
  {
    id: "acrc-public-interest",
    agencyName: "국민권익위원회 / 청렴포털",
    officialUrl: "https://www.clean.go.kr/menu.es?mid=a10613010000",
    description:
      "공익신고 보상금·포상금 제도와 신고자 보호 제도를 확인할 수 있습니다.",
    caution:
      "보상금/포상금은 공식 요건과 처리 결과에 따라 달라지며 수령을 보장하지 않습니다. 본 시스템은 자동 제출하지 않습니다."
  },
  {
    id: "acrc-corruption-report",
    agencyName: "국민권익위원회 / 청렴포털",
    officialUrl: "https://www.clean.go.kr/menu.es?mid=a10613000000",
    description: "부패행위 신고 보상·포상 제도를 참고할 수 있습니다.",
    caution:
      "신고 대상과 보상·포상 요건은 공식 기준에서 사람이 직접 재확인해야 합니다."
  },
  {
    id: "epeople",
    agencyName: "국민신문고",
    officialUrl: "https://www.epeople.go.kr",
    description:
      "보조금 관리기관 또는 관할 지자체로 민원/신고 접수가 가능합니다.",
    caution: "사안별로 관할 기관과 접수 분류가 달라질 수 있어 사람이 직접 확인이 필요합니다."
  },
  {
    id: "subsidy-managing-agency",
    agencyName: "보조금 관리기관 / 관할 지자체 감사부서",
    officialUrl: "",
    description:
      "해당 보조사업을 교부·관리한 중앙부처, 지자체, 공공기관의 감사·보조금 담당 부서를 확인합니다.",
    caution:
      "관할과 절차는 사업별로 다르므로 공고문과 교부기관 정보를 사람이 직접 확인해야 합니다."
  }
];

const PUBLIC_DATA_SOURCES: SubsidyPublicDataSource[] = [
  {
    id: "bojo-portal",
    name: "보조금통합포털",
    officialUrl: "https://www.bojo.go.kr/",
    dataTypes: ["공모사업", "보조사업자 정보", "보조금 정보 공개"],
    usage: "보조금 사업 공고와 보조사업자 정보를 확인합니다.",
    caution: "공개 범위와 메뉴 구조는 변경될 수 있어 사람이 직접 확인이 필요합니다."
  },
  {
    id: "gosims",
    name: "e나라도움",
    officialUrl: "https://www.gosims.go.kr/",
    dataTypes: ["국고보조금 사업", "집행", "정산 관련 공개 정보"],
    usage: "국고보조금 사업 흐름과 공개자료를 확인합니다.",
    caution: "로그인 또는 권한이 필요한 자료는 수집하지 않습니다 (공개자료만 사용)."
  },
  {
    id: "losims",
    name: "지방보조금관리시스템 보탬e",
    officialUrl: "https://www.losims.go.kr/",
    dataTypes: ["지방보조금 사업", "교부", "집행", "정산 관련 자료"],
    usage: "지방보조금 공개자료를 확인합니다.",
    caution: "공개자료만 사용하며, 비공개 페이지는 다루지 않습니다."
  },
  {
    id: "data-go-kr",
    name: "공공데이터포털",
    officialUrl: "https://www.data.go.kr/",
    dataTypes: ["지자체별 지방보조금 파일/API 데이터", "공모/교부/집행/정산 데이터셋"],
    usage: "보조사업·보조사업자·교부·집행 데이터를 확보합니다.",
    caution: "데이터셋별 활용신청/API 키가 필요할 수 있으며, API 키 원문은 응답에 표시하지 않습니다."
  },
  {
    id: "local-gov-homepage",
    name: "지자체 홈페이지",
    officialUrl: "",
    dataTypes: ["공고", "보도자료", "결과보고서", "회의자료", "감사자료"],
    usage: "보조금 사업 결과물과 공개 공고를 확인합니다.",
    caution: "지자체별 메뉴와 공개 범위가 다르므로 해당 지자체 공식 홈페이지에서 사람이 직접 확인하세요."
  }
];

const SUSPICIOUS_SIGNALS: SubsidySuspiciousSignal[] = [
  {
    id: "repeated-grant-receipt",
    category: "반복 수급",
    examples: [
      "동일 단체가 여러 해 유사 사업명으로 보조금을 반복 수령",
      "동일 목적 사업이 매년 반복됨"
    ],
    whyItMatters:
      "반복 수급은 공개자료 기반 검토 후보로 분류되며, 정상적인 다년도 사업일 수도 있으므로 추가 검토가 필요합니다.",
    reviewLevel: "HIGH"
  },
  {
    id: "same-address-similar-org",
    category: "동일 주소 / 유사 단체명",
    examples: [
      "같은 주소에 여러 보조사업자 존재",
      "단체명만 조금 다른 유사 조직"
    ],
    whyItMatters:
      "공유오피스·공공시설 입주 등 정상 사유일 수 있어 단정하지 않고 검토가 필요한 공개자료 기반 검토 후보로 분류합니다.",
    reviewLevel: "HIGH"
  },
  {
    id: "similar-project-name",
    category: "유사 사업명 반복",
    examples: [
      "같은 사업명 또는 유사 문구의 사업을 여러 기관에서 수령",
      "사업명이 키워드만 바뀌어 반복"
    ],
    whyItMatters:
      "유사 사업명 패턴은 사업 분류 차이일 수도 있으므로 단정하지 않고 검토가 필요한 신호로 분류합니다.",
    reviewLevel: "MEDIUM"
  },
  {
    id: "low-output",
    category: "결과물 부족",
    examples: [
      "교부금액 대비 행사·보고서·홍보물·결과물이 부족해 보임",
      "결과보고서·정산자료가 공시되지 않음"
    ],
    whyItMatters:
      "공개 결과물이 단순한 사업은 비공개 자료에 충분한 산출물이 있을 수도 있어 단정 없이 검토가 필요합니다.",
    reviewLevel: "HIGH"
  },
  {
    id: "amount-vs-output",
    category: "금액 대비 산출물 부족",
    examples: [
      "큰 금액 대비 공개 결과물이 단순 게시글 몇 개 수준",
      "교부금액 규모에 비해 공개된 결과물이 미흡해 보임"
    ],
    whyItMatters:
      "공개 산출물만으로는 사업 전체를 평가할 수 없어 단정 없이 검토가 필요한 신호입니다.",
    reviewLevel: "MEDIUM"
  },
  {
    id: "settlement-report-missing",
    category: "정산/결과보고 자료 미확인",
    examples: [
      "정산보고서, 결과보고서, 정보공시 자료 확인 곤란",
      "공시 의무 대상이지만 자료 위치를 찾기 어려움"
    ],
    whyItMatters:
      "공시·공개 시점이 늦거나 위치가 변경된 경우일 수 있어 사람이 추가 검토가 필요합니다.",
    reviewLevel: "MEDIUM"
  },
  {
    id: "special-relationship",
    category: "특수관계 의심 공개 정황",
    examples: [
      "수급단체와 용역업체의 주소/대표/연락처가 공개자료상 유사",
      "공개자료상 동일 대표자가 여러 단체에 등재"
    ],
    whyItMatters:
      "공개자료상 유사 정황은 정상 사유(공동대표·계열단체 등)일 수도 있어 단정 없이 검토가 필요합니다.",
    reviewLevel: "HIGH"
  },
  {
    id: "duplicate-content",
    category: "중복 콘텐츠 / 이미지",
    examples: [
      "다른 사업 결과물과 동일한 사진·문구·보고서 양식 반복",
      "유사 사업의 보고서가 거의 동일한 양식·문구로 반복"
    ],
    whyItMatters:
      "공통 템플릿 사용일 수도 있어 단정 없이 사람이 추가 검토가 필요한 공개자료 기반 검토 후보입니다.",
    reviewLevel: "MEDIUM"
  }
];

const EVIDENCE_CHECKLIST: SubsidyEvidenceChecklistItem[] = [
  { id: "project-name", label: "보조사업명", required: true, hint: "공개 공고상 정식 사업명을 그대로 기록합니다." },
  { id: "recipient-name", label: "보조사업자명", required: true, hint: "공개자료에 표시된 보조사업자명을 단정 표현 없이 기록합니다." },
  { id: "granting-agency", label: "교부기관", required: true, hint: "보조금을 교부한 중앙부처·지자체·공공기관명을 기록합니다." },
  { id: "fiscal-year", label: "회계연도", required: true, hint: "사업이 진행된 회계연도를 기록합니다." },
  { id: "grant-amount", label: "교부금액", required: true, hint: "공개된 교부금액을 기록합니다." },
  { id: "notice-url", label: "사업 공고 URL", required: true, hint: "공개 공고 페이지 URL을 보존합니다." },
  { id: "selection-result-url", label: "교부/선정 결과 URL", required: true, hint: "교부·선정 결과가 공개된 페이지 URL을 보존합니다." },
  { id: "execution-settlement", label: "집행내역 또는 정산자료", required: false, hint: "공개된 집행/정산자료가 있으면 보존합니다. 비공개 자료는 수집하지 않습니다." },
  { id: "final-report", label: "결과보고서", required: false, hint: "공개된 결과보고서가 있으면 보존합니다." },
  { id: "output-url", label: "결과물 URL", required: false, hint: "행사·홍보물·결과물이 공개된 페이지 URL을 보존합니다." },
  { id: "recipient-address", label: "보조사업자 주소", required: true, hint: "공개자료상 주소만 기록합니다. 개인 주소는 수집하지 않습니다." },
  { id: "repeated-receipt-basis", label: "반복 수급 근거", required: true, hint: "다년도·다기관 수급 정황을 표·목록 형태로 정리합니다." },
  { id: "same-address-basis", label: "동일 주소/유사 단체 근거", required: false, hint: "공개자료상 동일 주소·유사 단체명 근거를 정리합니다." },
  { id: "similar-project-basis", label: "유사 사업명 근거", required: false, hint: "유사 사업명·키워드 비교 표를 정리합니다." },
  { id: "low-output-evidence", label: "결과물 부족 정황", required: false, hint: "공개 결과물의 수량·내용 부족 정황을 정리합니다 (단정 표현 없이)." },
  { id: "screenshot-pdf", label: "화면 캡처 / PDF", required: true, hint: "원본 페이지가 사후 변경될 수 있어 캡처/PDF 보존이 권장됩니다." },
  { id: "collected-at", label: "수집일시", required: true, hint: "원본 자료 수집 시점을 기록합니다." },
  { id: "official-check-record", label: "공식 기준 확인 결과", required: true, hint: "권익위·관리기관·지자체 공식 페이지에서 사람이 직접 확인한 결과(일자·요약)를 기록합니다." }
];

const PRE_REPORT_CHECKLIST: SubsidyPreReportChecklistItem[] = [
  { id: "public-source-confirmed", label: "수집한 모든 자료가 공개자료인지 확인", required: true },
  { id: "no-private-info", label: "개인정보/민감정보가 포함되지 않았는지 확인", required: true },
  { id: "no-single-fact-conclusion", label: "단일 정황만으로 부정수급을 단정하지 않았는지 확인", required: true },
  { id: "notice-selection-evidence", label: "보조사업 공고와 선정 결과를 확보했는지 확인", required: true },
  { id: "execution-settlement-checked", label: "집행/정산/결과자료를 확인했는지 확인", required: true },
  { id: "repeat-or-address-source-confirmed", label: "반복 수급 또는 동일 주소 정황을 원본자료로 확인했는지 확인", required: true },
  { id: "managing-agency-identified", label: "보조금 관리기관 또는 지자체 관할을 확인했는지 확인", required: true },
  { id: "no-fraud-affirmation-text", label: "신고서 초안에 부정수급을 단정하는 표현이 들어가 있지 않은지 확인", required: true },
  { id: "no-reward-guarantee-text", label: "포상금/보상금 수령을 단정하는 표현이 신고서 초안에 들어가 있지 않은지 확인", required: true },
  { id: "human-submits", label: "최종 제출은 사람이 직접 수행하는지 확인 (자동 제출 미수행)", required: true }
];

const REWARD_CAUTION: SubsidyRewardCaution = {
  title: "보조금·공익신고 보상·포상 기준 안내",
  summary:
    "보조금 부정수급 또는 부패행위 신고와 관련된 보상금·포상금은 국민권익위원회, 보조금 관리기관, 관할 지자체 등 공식 기준과 처리 결과에 따라 달라질 수 있습니다. 환수, 처분, 공공기관 수입 회복 또는 손실 방지, 공익 증진 여부 등이 검토될 수 있으며, 공익레이더는 보상금·포상금 수령을 보장하지 않습니다.",
  notGuaranteed: true,
  officialCheckRequired: true,
  notes: [
    "공익신고 보상금과 포상금은 요건이 다를 수 있습니다.",
    "부패행위 신고 보상·포상 기준은 별도 확인이 필요합니다.",
    "보조금 환수·처분 결과가 중요할 수 있습니다.",
    "지자체별 조례·지급 기준이 다를 수 있습니다.",
    "본 화면은 지급 여부와 금액을 확정 표시하지 않습니다."
  ]
};

const EXAMPLES: SubsidyExampleEntry[] = [
  { text: "동일 단체가 3년 연속 유사 사업명으로 보조금을 수령했고 공개 결과물이 부족함", category: "suspicious", explanation: "반복 수급 + 결과물 부족 정황 후보로 검토가 필요합니다." },
  { text: "같은 주소에 여러 보조사업자가 등록되어 있고 유사 사업을 반복 수행", category: "suspicious", explanation: "동일 주소 + 유사 사업명 패턴 후보로 검토가 필요합니다." },
  { text: "교부금액은 크지만 결과보고서와 행사 기록이 확인되지 않음", category: "suspicious", explanation: "금액 대비 산출물 부족 정황 후보로 검토가 필요합니다." },

  { text: "동일 단체가 반복 수급했지만 매년 다른 사업 결과보고서와 정산자료가 충분히 공개됨", category: "normal", explanation: "다년도 정상 사업으로 보일 수 있는 참고 예시입니다." },
  { text: "주소가 같지만 공공시설 입주단체로 확인됨", category: "normal", explanation: "공공시설 입주 등 정상 사유 예시입니다." },
  { text: "결과물이 별도 공식 홈페이지에 공개되어 있음", category: "normal", explanation: "공개 위치가 다른 경우의 참고 예시입니다." },

  { text: "결과물이 적어 보이나 정산자료 확인 전", category: "needs_review", explanation: "정산자료 확인 후 다시 검토가 필요합니다." },
  { text: "단체명이 유사하나 법인/대표/주소 확인 필요", category: "needs_review", explanation: "법인등기·공개자료로 추가 확인이 필요합니다." },
  { text: "동일 주소이나 공유오피스 가능성 있음", category: "needs_review", explanation: "공유오피스 여부 확인 후 검토가 필요합니다." }
];

const OFFICIAL_LINKS: SubsidyOfficialLink[] = [
  {
    id: "clean-public-interest-reward",
    label: "청렴포털 — 공익신고 보상금·포상금 안내",
    url: "https://www.clean.go.kr/menu.es?mid=a10613010000",
    caution: "보상금/포상금 요건과 지급 기준은 공식 페이지에서 사람이 직접 재확인하세요."
  },
  {
    id: "clean-corruption-reward",
    label: "청렴포털 — 부패행위 신고 보상·포상 안내",
    url: "https://www.clean.go.kr/menu.es?mid=a10613000000",
    caution: "부패행위 신고 보상·포상 기준은 별도 확인이 필요합니다."
  },
  {
    id: "epeople",
    label: "국민신문고",
    url: "https://www.epeople.go.kr",
    caution: "관할 기관과 접수 분류는 사안별로 달라질 수 있어 사람이 직접 확인이 필요합니다."
  },
  {
    id: "bojo-portal",
    label: "보조금통합포털",
    url: "https://www.bojo.go.kr/",
    caution: "공개 메뉴 구조는 변경될 수 있어 사람이 직접 확인이 필요합니다."
  },
  {
    id: "gosims",
    label: "e나라도움",
    url: "https://www.gosims.go.kr/",
    caution: "공개자료만 사용하며 로그인/권한 필요 자료는 수집하지 않습니다."
  },
  {
    id: "losims",
    label: "지방보조금관리시스템 보탬e",
    url: "https://www.losims.go.kr/",
    caution: "공개자료만 사용합니다."
  },
  {
    id: "data-go-kr",
    label: "공공데이터포털",
    url: "https://www.data.go.kr/",
    caution: "데이터셋별 활용신청/API 키가 필요할 수 있으며, API 키 원문은 응답·화면에 표시하지 않습니다."
  }
];

export class SubsidyGuideService {
  getSubsidyGuide(): SubsidyGuidePayload {
    return {
      schemaVersion: "1.0.0",
      moduleId: "subsidy_fraud",
      displayName: "보조금 부정수급 의심 후보 탐지 — 보조금/공익신고 보상·포상 가이드",
      generatedAt: new Date().toISOString(),
      reportingChannels: this.getReportingChannels(),
      publicDataSources: this.getPublicDataSources(),
      suspiciousSignals: this.getSuspiciousSignals(),
      evidenceChecklist: this.getEvidenceChecklist(),
      preReportChecklist: PRE_REPORT_CHECKLIST.map((i) => ({ ...i })),
      rewardCaution: this.getRewardCaution(),
      examples: this.getExamples(),
      officialLinks: this.getOfficialLinks(),
      safetyNotice: SUBSIDY_GUIDE_SAFETY_NOTICE
    };
  }
  getReportingChannels(): SubsidyReportingChannel[] {
    return REPORTING_CHANNELS.map((c) => ({ ...c }));
  }
  getPublicDataSources(): SubsidyPublicDataSource[] {
    return PUBLIC_DATA_SOURCES.map((s) => ({ ...s, dataTypes: s.dataTypes.slice() }));
  }
  getSuspiciousSignals(): SubsidySuspiciousSignal[] {
    return SUSPICIOUS_SIGNALS.map((s) => ({ ...s, examples: s.examples.slice() }));
  }
  getEvidenceChecklist(): SubsidyEvidenceChecklistItem[] {
    return EVIDENCE_CHECKLIST.map((i) => ({ ...i }));
  }
  getRewardCaution(): SubsidyRewardCaution {
    return { ...REWARD_CAUTION, notes: REWARD_CAUTION.notes.slice() };
  }
  getExamples(): SubsidyExampleEntry[] {
    return EXAMPLES.map((e) => ({ ...e }));
  }
  getOfficialLinks(): SubsidyOfficialLink[] {
    return OFFICIAL_LINKS.map((l) => ({ ...l }));
  }
}

export const subsidyGuideService = new SubsidyGuideService();
