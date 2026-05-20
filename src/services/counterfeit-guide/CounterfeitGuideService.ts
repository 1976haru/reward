/**
 * CounterfeitGuideService — 2차 모듈(`counterfeit_goods`, 위조상품 온라인 판매 의심 탐지)의
 * 실전 신고·포상 가이드 안내 (조회 전용).
 *
 * 안전 원칙:
 * - 외부 신고기관(특허청 / 지식재산침해 원스톱 신고상담센터)에 자동 제출하지 않는다.
 * - 위조 여부를 확정하지 않는다. 모든 항목은 "위조상품 의심 후보 / 검토 필요" 로 표현한다.
 * - 특정 판매자를 형사적 표현으로 단정하지 않는다.
 * - 포상금/보상금 수령을 보장하지 않는다.
 * - 표현 정책: 위조 단정 / 지급 단정 / 보장 단정 류의 긍정 표현은 사용하지 않는다.
 *   대신 "검토가 필요합니다", "공식 기준 확인 필요", "권리자/관계기관 판단 필요" 같은
 *   중립 표현을 사용한다.
 */

export const COUNTERFEIT_GUIDE_SAFETY_NOTICE =
  "이 가이드는 신고지원용이며, 위조 여부 또는 포상금 지급을 확정하지 않습니다. 공익레이더는 외부 신고기관에 자동으로 제출하지 않으며, 포상금 수령을 보장하지 않습니다. 위조 여부 확정은 권리자/관계기관 판단이 필요하며, 실전 신고 전 특허청·지식재산침해 원스톱 신고상담센터의 공식 기준을 사람이 직접 확인하세요.";

export interface CounterfeitReportingChannel {
  id: string;
  agencyName: string;
  officialUrl: string;
  description: string;
  caution: string;
}

export interface CounterfeitSuspiciousSignal {
  id: string;
  category: string;
  examples: string[];
  whyItMatters: string;
  reviewLevel: "HIGH" | "MEDIUM" | "LOW";
}

export interface CounterfeitEvidenceChecklistItem {
  id: string;
  label: string;
  required: boolean;
  hint: string;
}

export interface CounterfeitPreReportChecklistItem {
  id: string;
  label: string;
  required: boolean;
}

export interface CounterfeitRewardCaution {
  title: string;
  summary: string;
  notGuaranteed: true;
  officialCheckRequired: true;
  notes: string[];
}

export interface CounterfeitExampleEntry {
  text: string;
  category: "suspicious" | "normal" | "needs_review";
  explanation: string;
}

export interface CounterfeitOfficialLink {
  id: string;
  label: string;
  url: string;
  caution: string;
}

export interface CounterfeitGuidePayload {
  schemaVersion: "1.0.0";
  moduleId: "counterfeit_goods";
  displayName: string;
  generatedAt: string;
  reportingChannels: CounterfeitReportingChannel[];
  suspiciousSignals: CounterfeitSuspiciousSignal[];
  evidenceChecklist: CounterfeitEvidenceChecklistItem[];
  preReportChecklist: CounterfeitPreReportChecklistItem[];
  rewardCaution: CounterfeitRewardCaution;
  examples: CounterfeitExampleEntry[];
  officialLinks: CounterfeitOfficialLink[];
  safetyNotice: string;
}

const REPORTING_CHANNELS: CounterfeitReportingChannel[] = [
  {
    id: "kipo-counterfeit-reward",
    agencyName: "특허청",
    officialUrl: "https://www.kipo.go.kr/ko/kpoContentView.do?menuCd=SCD0200346",
    description:
      "위조상품 신고포상금 제도의 신청기한, 구비서류, 신청방법, 지급 대상 등 공식 기준을 안내합니다.",
    caution:
      "포상금 신청기한·구비서류·지급 대상은 공식 페이지에서 사람이 직접 최신 기준을 확인해야 합니다. 본 시스템은 자동 제출하지 않습니다."
  },
  {
    id: "koipa-ippolice",
    agencyName: "한국지식재산보호원 / 지식재산침해 원스톱 신고상담센터",
    officialUrl: "https://www.koipa.re.kr/ippolice/",
    description:
      "상표(위조상품) 침해, 특허·디자인·영업비밀 등 지식재산침해에 대한 신고·상담을 안내합니다.",
    caution:
      "위조상품 신고는 해당 센터의 침해신고 또는 간편제보 경로를 사람이 직접 확인해야 합니다."
  },
  {
    id: "koipa-trademark-infringement-report",
    agencyName: "지식재산침해 원스톱 신고상담센터 — 상표(위조상품) 침해신고",
    officialUrl: "https://www.koipa.re.kr/ippolice/indusPropReport/infringementReport.do",
    description:
      "상표(위조상품) 침해 신고/간편제보 경로 안내. 제출 항목과 접수 가능 유형이 안내됩니다.",
    caution:
      "실제 신고 전 제출항목과 접수 가능 유형을 공식 페이지에서 사람이 재확인해야 합니다."
  }
];

const SUSPICIOUS_SIGNALS: CounterfeitSuspiciousSignal[] = [
  {
    id: "replica-grade-claim",
    category: "레플리카 / 미러급 / 등급 표현",
    examples: ["레플리카", "미러급", "SA급", "S급"],
    whyItMatters:
      "정품이 아닌 상품을 정품처럼 판매하거나 정품과 동일·유사하다고 암시할 수 있어 검토가 필요합니다. 위조 단정이 아니라 위조상품 의심 후보로 분류합니다.",
    reviewLevel: "HIGH"
  },
  {
    id: "authentic-grade-1to1",
    category: "정품급 / 1:1 제작 / 공장판 표현",
    examples: ["정품급", "1:1 제작", "공장판", "동일 퀄리티"],
    whyItMatters:
      "정품과 동일 수준이라고 단정하는 표현은 정품 오인 가능성이 있어 검토가 필요합니다.",
    reviewLevel: "HIGH"
  },
  {
    id: "logo-trademark-replication",
    category: "브랜드 / 상표 표시 복제 의심",
    examples: ["로고 구현", "각인 구현", "풀박스 구현", "보증서 포함"],
    whyItMatters:
      "상표·로고·구성품·보증서까지 동일하게 구현했다는 표현은 상표 침해 가능성이 있어 검토가 필요합니다.",
    reviewLevel: "HIGH"
  },
  {
    id: "secret-channel-contact",
    category: "비공개 문의 / 은밀한 판매 유도",
    examples: ["카톡 문의", "텔레 문의", "비밀배송", "정품 문의 금지"],
    whyItMatters:
      "공개 게시판 대신 비공개 채널로 거래를 유도하는 패턴은 일반 판매와 다른 점검 필요성이 있어 검토가 필요합니다.",
    reviewLevel: "MEDIUM"
  },
  {
    id: "abnormal-price",
    category: "가격 비정상 신호",
    examples: ["정가 대비 초저가", "최저가 정품급", "풀구성 초특가"],
    whyItMatters:
      "정품 정가에 비해 비정상적으로 낮은 가격은 위조상품 가능성에 대한 검토가 필요한 신호일 수 있습니다.",
    reviewLevel: "MEDIUM"
  },
  {
    id: "same-seller-multi-channel",
    category: "동일 판매자 다채널 판매 신호",
    examples: [
      "동일 판매자가 다른 플랫폼에서도 유사 상품 판매",
      "동일 연락처/프로필/이미지 반복",
      "2개 이상 채널에서 판매 정황"
    ],
    whyItMatters:
      "동일 판매자가 여러 채널에서 유사 상품을 반복 노출하는 패턴은 신고 시 참고 증거가 될 수 있어 검토가 필요합니다.",
    reviewLevel: "HIGH"
  },
  {
    id: "image-logo-evidence",
    category: "상품 이미지 / 로고 · 상표 표시 증거",
    examples: [
      "상품 사진에 상표 로고 노출",
      "정품 이미지와 유사하게 구성",
      "구성품/쇼핑백/보증서 이미지 표시"
    ],
    whyItMatters:
      "상품 이미지와 상표·로고 표시 자체가 침해 판단의 근거 자료가 되므로 사람이 직접 검토·보존이 필요합니다.",
    reviewLevel: "MEDIUM"
  }
];

const EVIDENCE_CHECKLIST: CounterfeitEvidenceChecklistItem[] = [
  { id: "listing-url", label: "판매게시글 URL", required: true, hint: "공개 접근 가능한 판매 페이지 URL을 그대로 보존합니다." },
  { id: "collected-at", label: "수집일시", required: true, hint: "원본 게시글이 사후 수정·삭제될 수 있어 수집 시점을 명시합니다." },
  { id: "product-name", label: "상품명", required: true, hint: "검토 대상이 특정 상품·게시물임을 식별할 수 있어야 합니다." },
  { id: "brand-trademark", label: "브랜드/상표 표시", required: true, hint: "표시된 브랜드명, 상표 위치를 함께 기록합니다." },
  { id: "product-image", label: "상품 이미지", required: true, hint: "원본 이미지 또는 캡처를 보존합니다 (재배포는 권리자 권리 범위 확인 필요)." },
  { id: "logo-trademark-capture", label: "로고/상표 표시 캡처", required: true, hint: "상표·로고가 보이는 영역을 별도 캡처로 보존하면 검토가 쉬워집니다." },
  { id: "price", label: "가격", required: true, hint: "정가 대비 비정상 신호 분석을 위해 가격을 기록합니다." },
  { id: "seller-public-info", label: "판매자 공개 정보", required: false, hint: "공개된 판매자 정보(상호·대표자 표시·연락처 등)만 기록합니다. 개인정보는 수집하지 않습니다." },
  { id: "same-seller-evidence", label: "동일 판매자 추정 증거", required: false, hint: "동일 연락처/프로필/이미지 반복 등 동일 판매자 추정 근거를 메모합니다." },
  { id: "multi-channel-evidence", label: "2개 이상 채널 판매 증거", required: true, hint: "동일인이 2개 이상 채널에서 유사 상품을 판매한다는 증거는 신고 시 참고가 됩니다." },
  { id: "screenshot", label: "화면 캡처", required: true, hint: "원본 게시글이 수정·삭제되더라도 검토할 수 있도록 캡처를 저장합니다." },
  { id: "pdf", label: "PDF 저장본", required: true, hint: "캡처 외에 PDF 형태 저장본을 추가로 보존하면 사람이 재검토하기 쉽습니다." },
  { id: "text-extract", label: "텍스트 추출본", required: true, hint: "본문 텍스트 추출본을 함께 보관하면 키워드 검토가 쉬워집니다." },
  { id: "claim-location", label: "위조상품 의심 표현 위치", required: true, hint: "의심 표현이 페이지의 어느 영역에 있는지 기록합니다." },
  { id: "official-check-record", label: "공식 신고 기준 확인 결과", required: true, hint: "특허청·원스톱센터 공식 페이지에서 사람이 직접 확인한 결과(일자·요약)를 기록합니다." }
];

const PRE_REPORT_CHECKLIST: CounterfeitPreReportChecklistItem[] = [
  { id: "is-public-url", label: "공개 URL인지 확인", required: true },
  { id: "no-login-required", label: "로그인 없이 접근 가능한지 확인", required: true },
  { id: "image-logo-visible", label: "상품 이미지와 상표/로고 표시가 확인되는지 확인", required: true },
  { id: "listing-url-saved", label: "판매게시글 URL을 저장했는지 확인", required: true },
  { id: "multi-channel-evidence-present", label: "동일 판매자 2개 이상 채널 증거가 있는지 확인", required: true },
  { id: "screenshot-pdf-open", label: "캡처와 PDF가 정상적으로 열리는지 확인", required: true },
  { id: "no-unneeded-pii", label: "개인정보가 불필요하게 포함되지 않았는지 확인", required: true },
  { id: "kipo-koipa-rechecked", label: "특허청 / 원스톱센터 공식 신고 기준을 재확인했는지 확인", required: true },
  { id: "no-counterfeit-affirmation-text", label: "위조 여부를 단정하는 표현이 신고서 초안에 들어가 있지 않은지 확인", required: true },
  { id: "human-submits", label: "최종 제출은 사람이 직접 수행하는지 확인 (자동 제출 미수행)", required: true }
];

const REWARD_CAUTION: CounterfeitRewardCaution = {
  title: "위조상품 신고포상금 기준 안내",
  summary:
    "위조상품 신고포상금은 특허청 또는 관련 공식 기준에 따라 신청기한, 구비서류, 처리결과, 기소의견 송치 여부, 지급 제외 사유 등을 확인해야 합니다. 공익레이더는 포상금 수령을 보장하지 않습니다.",
  notGuaranteed: true,
  officialCheckRequired: true,
  notes: [
    "특허청 공식 기준에 따르면 신청기한과 구비서류 확인이 필요합니다.",
    "신고사건의 처리 결과와 지급 요건에 따라 달라질 수 있습니다.",
    "동일인이 2개 이상의 채널에서 위조상품을 판매한다는 증거가 중요할 수 있습니다.",
    "위조 여부 확정은 관계기관 또는 권리자 판단이 필요합니다.",
    "본 화면은 금액을 확정 표시하지 않습니다."
  ]
};

const EXAMPLES: CounterfeitExampleEntry[] = [
  { text: "미러급 시계 1:1 제작", category: "suspicious", explanation: "정품 동일 수준 단정 표현으로 검토가 필요합니다." },
  { text: "정품급 가방 풀박스 구성", category: "suspicious", explanation: "정품 구성 동일 표현으로 검토가 필요합니다." },
  { text: "레플리카 운동화 SA급", category: "suspicious", explanation: "레플리카 등급 표현으로 검토가 필요합니다." },
  { text: "로고 각인 완벽 구현", category: "suspicious", explanation: "상표·로고 동일 구현 표현으로 검토가 필요합니다." },
  { text: "카톡 문의만 가능, 정품 문의 금지", category: "suspicious", explanation: "비공개 채널 유도 표현으로 검토가 필요합니다." },

  { text: "정품 보증서 포함, 공식 판매처 안내", category: "normal", explanation: "공식 판매·보증서 안내 표현 예시입니다. 실제 진위 여부는 사람이 직접 확인해야 합니다." },
  { text: "브랜드 정식 라이선스 상품", category: "normal", explanation: "라이선스 표시 예시입니다. 실제 라이선스 여부는 권리자 확인이 필요합니다." },
  { text: "중고 정품 구매 영수증 보유", category: "normal", explanation: "정품 거래 이력 표시 예시입니다. 진위 여부는 사람이 직접 확인해야 합니다." },

  { text: "정품급 퀄리티", category: "needs_review", explanation: "맥락에 따라 위조 의심 또는 일반 마케팅 표현으로 해석될 수 있어 사람이 점검해야 합니다." },
  { text: "풀박스 구성", category: "needs_review", explanation: "정품 구성품이 실제로 포함된 것인지 사람이 직접 확인이 필요합니다." },
  { text: "동일 디자인", category: "needs_review", explanation: "동일 디자인이라는 표현은 디자인 권리/라이선스 여부 등 추가 점검이 필요합니다." }
];

const OFFICIAL_LINKS: CounterfeitOfficialLink[] = [
  {
    id: "kipo-counterfeit-reward",
    label: "특허청 — 위조상품 신고포상금제도",
    url: "https://www.kipo.go.kr/ko/kpoContentView.do?menuCd=SCD0200346",
    caution: "신청기한·구비서류·지급 대상·지급 제외 사유는 공식 페이지에서 사람이 직접 최신 기준을 확인하세요."
  },
  {
    id: "koipa-ippolice-home",
    label: "지식재산침해 원스톱 신고상담센터",
    url: "https://www.koipa.re.kr/ippolice/",
    caution: "위조상품(상표 침해) 신고는 해당 센터의 침해신고 또는 간편제보 경로를 사람이 직접 확인하세요."
  },
  {
    id: "kipo-counterfeit-reward-guide",
    label: "위조상품 신고포상금 제도 안내 페이지 (특허청)",
    url: "https://www.kipo.go.kr/ko/kpoContentView.do?menuCd=SCD0200346",
    caution: "공식 안내 페이지 위치는 변경될 수 있으니 사람이 직접 확인하세요. 본 화면은 금액을 확정 표시하지 않습니다."
  },
  {
    id: "koipa-trademark-infringement-report",
    label: "상표(위조상품) 침해신고 페이지",
    url: "https://www.koipa.re.kr/ippolice/indusPropReport/infringementReport.do",
    caution: "제출 항목과 접수 가능 유형은 공식 페이지에서 사람이 직접 재확인하세요."
  },
  {
    id: "policy-briefing-counterfeit-online",
    label: "정책브리핑 — 위조상품 판매게시물 신고 안내 (참고)",
    url: "https://www.korea.kr",
    caution: "정책브리핑 검색에서 '위조상품 신고' 관련 최신 안내를 사람이 직접 확인하세요. 위조 여부 확정 안내가 아닙니다."
  }
];

export class CounterfeitGuideService {
  getGuide(): CounterfeitGuidePayload {
    return {
      schemaVersion: "1.0.0",
      moduleId: "counterfeit_goods",
      displayName: "위조상품 온라인 판매 의심 신고·포상 가이드",
      generatedAt: new Date().toISOString(),
      reportingChannels: REPORTING_CHANNELS.map((c) => ({ ...c })),
      suspiciousSignals: SUSPICIOUS_SIGNALS.map((s) => ({
        ...s,
        examples: s.examples.slice()
      })),
      evidenceChecklist: EVIDENCE_CHECKLIST.map((i) => ({ ...i })),
      preReportChecklist: PRE_REPORT_CHECKLIST.map((i) => ({ ...i })),
      rewardCaution: { ...REWARD_CAUTION, notes: REWARD_CAUTION.notes.slice() },
      examples: EXAMPLES.map((e) => ({ ...e })),
      officialLinks: OFFICIAL_LINKS.map((l) => ({ ...l })),
      safetyNotice: COUNTERFEIT_GUIDE_SAFETY_NOTICE
    };
  }
}

export const counterfeitGuideService = new CounterfeitGuideService();
