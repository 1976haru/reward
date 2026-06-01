/**
 * GuideService — 사용자 가이드 / Q&A 데이터 빌더.
 *
 * 공익레이더는 자동 신고를 수행하지 않으며, 포상금 수령을 보장하지 않는다.
 * 가이드 데이터는 사람이 검토할 수 있도록 안내만 제공한다.
 *
 * 공식 링크는 변경될 수 있으므로 사람이 실전 신고 전 직접 재확인한다.
 */

export type GuideOfficialCategory =
  | "false_ad"
  | "counterfeit_goods"
  | "subsidy_fraud"
  | "bid_collusion"
  | "general";

export interface GuideOfficialLink {
  id: string;
  label: string;
  url: string;
  moduleId: GuideOfficialCategory;
  caution: string;
}

export interface GuideModuleEntry {
  moduleId: string;
  displayName: string;
  whatToCollect: string[];
  whereToReport: string[];
  evidence: string[];
  rewardGuide: string[];
  officialLinks: GuideOfficialLink[];
}

export interface GuideFaq {
  id: string;
  question: string;
  answer: string;
  category?: "auto-submit" | "reward" | "data" | "privacy" | "process" | "ai" | "first-run";
}

export interface GuideFirstRunStep {
  step: number;
  title: string;
  detail: string;
  anchor?: string;
}

export interface GuidePayload {
  schemaVersion: "1.0.0";
  generatedAt: string;
  title: string;
  subtitle: string;
  description: string;
  firstRunSteps: GuideFirstRunStep[];
  moduleGuides: GuideModuleEntry[];
  faqs: GuideFaq[];
  officialLinks: GuideOfficialLink[];
  safetyNotice: string;
  safetyRules: string[];
  rewardDisclaimer: string;
}

export const GUIDE_SAFETY_NOTICE =
  "공익레이더는 자동 신고를 수행하지 않으며, 포상금 수령을 보장하지 않습니다. AI 분석은 참고용이며, 최종 신고 여부는 사람이 공식 기준을 확인한 뒤 직접 결정합니다.";

const REWARD_DISCLAIMER =
  "포상금/보상금은 공식 기관 기준, 조사 결과, 처분 결과, 지급 제외 사유에 따라 달라집니다. 공익레이더는 수령을 보장하지 않으며 본 안내는 참고용입니다.";

const SAFETY_RULES: string[] = [
  "공익레이더는 자동 신고를 수행하지 않습니다.",
  "포상금 수령을 보장하지 않습니다.",
  "AI 분석은 참고용이며, 최종 신고 여부는 사람이 검토해야 합니다.",
  "공식 기준은 변경될 수 있으므로 신고 전 반드시 재확인하세요."
];

// 공식 링크 (필수 4개) — 사람이 실전 신고 전 직접 재확인할 것.
const OFFICIAL_LINKS: GuideOfficialLink[] = [
  {
    id: "mfds-online-illegal-trade",
    label: "식품의약품안전처 — 온라인 불법유통 신고",
    url: "https://www.mfds.go.kr/wpge/m_660/de010410l001.do",
    moduleId: "false_ad",
    caution: "공식 기준은 변경될 수 있으므로 실전 신고 전 재확인하세요. 건강기능식품·일반식품·화장품·의료기기 등 카테고리별 신고처가 다를 수 있습니다."
  },
  {
    id: "kipo-counterfeit-reward",
    label: "특허청 — 위조상품 신고포상금 제도",
    url: "https://www.kipo.go.kr/ko/kpoContentView.do?menuCd=SCD0200346",
    moduleId: "counterfeit_goods",
    caution: "위조 여부 확정은 권리자/기관 판단이 필요합니다. 공식 기준은 변경될 수 있으므로 실전 신고 전 재확인하세요."
  },
  {
    id: "ftc-reward-guide",
    label: "공정거래위원회 — 신고포상금 안내",
    url: "https://www.ftc.go.kr/www/contents.do?key=402",
    moduleId: "bid_collusion",
    caution: "담합·부당공동행위 확정은 관계기관 조사가 필요합니다. 공식 기준은 변경될 수 있으므로 실전 신고 전 재확인하세요."
  },
  {
    id: "clean-acrc-portal",
    label: "국민권익위원회 — 청렴포털",
    url: "https://www.clean.go.kr/menu.es?mid=a10613010000",
    moduleId: "subsidy_fraud",
    caution: "보조금 부정수급·공익신고 등 사안에 따라 신고처가 달라질 수 있습니다. 공식 기준은 변경될 수 있으므로 실전 신고 전 재확인하세요."
  }
];

function pickLinksForModule(moduleId: GuideOfficialCategory): GuideOfficialLink[] {
  return OFFICIAL_LINKS.filter((l) => l.moduleId === moduleId);
}

const FIRST_RUN_STEPS: GuideFirstRunStep[] = [
  { step: 1, title: "Home/Notice 확인", detail: "현재 모드(Mock/Mixed/Real)와 API 연결 상태, 실전 가능 단계를 확인하세요.", anchor: "#homeNoticeCard" },
  { step: 2, title: "공지사항 확인", detail: "공식 기준 재확인, 자동신고 금지, 실데이터 검증 상태 카드를 읽어보세요.", anchor: "#noticeCardSection" },
  { step: 3, title: "신고 분야 선택", detail: "어떤 모듈로 검토 후보를 찾을지 선택합니다. 현재는 건강기능식품 허위·과대광고가 1차 MVP 모듈입니다.", anchor: "#moduleList" },
  { step: 4, title: "Mock 후보 발굴 실행", detail: "Mock/Synthetic 모드에서 흐름을 먼저 검증합니다. 실제 후보 수집에는 허용된 검색 소스 설정이 필요합니다.", anchor: "#discoveryStatus" },
  { step: 5, title: "후보를 Review Queue로 이동", detail: "후보를 선택해 Case로 만들면 사람 검토 대기열로 들어갑니다.", anchor: "#caseList" },
  { step: 6, title: "분석 결과·증거 패키지·신고서 초안 확인", detail: "AI 분석은 참고용입니다. 사람이 원본 URL·캡처·PDF·문구 위치를 직접 확인하세요." },
  { step: 7, title: "공식 기준 확인 후 사람이 직접 신고 여부 결정", detail: "신고처 공식 기준을 다시 확인하고, 사람이 신고 여부를 결정합니다. 자동 제출은 수행하지 않습니다." },
  { step: 8, title: "제출 후 Outcome Tracker에 결과 기록", detail: "사람이 공식 창구에서 제출한 뒤, 접수·처리·결과를 Outcome Tracker에 사람이 직접 입력합니다.", anchor: "#outcomeCard" }
];

const MODULE_GUIDES: GuideModuleEntry[] = [
  {
    moduleId: "false_ad",
    displayName: "건강기능식품 온라인 허위·과대광고 탐지",
    whatToCollect: [
      "공개 상품 URL",
      "광고 문구",
      "상품명",
      "판매자 공개 정보",
      "화면 캡처",
      "PDF 저장본",
      "수집일시"
    ],
    whereToReport: [
      "식품의약품안전처 — 온라인 불법유통 신고",
      "국민신문고",
      "관할 보건소/지자체"
    ],
    evidence: [
      "원본 URL",
      "광고 문구 원문",
      "질병 치료·예방·완치 표현 여부",
      "화면 캡처",
      "PDF 저장본",
      "판매자 표시 정보"
    ],
    rewardGuide: [
      "공식 기준 확인 필요 (식약처 등)",
      "처분 결과·지급 제외 사유에 따라 달라짐",
      "수령 보장 없음"
    ],
    officialLinks: pickLinksForModule("false_ad")
  },
  {
    moduleId: "counterfeit_goods",
    displayName: "위조상품 온라인 판매 의심 탐지",
    whatToCollect: [
      "공개 판매게시글 URL",
      "상품명",
      "브랜드/상표 표시",
      "가격",
      "판매자 공개 정보",
      "위조 의심 표현",
      "동일 판매자 추정 증거"
    ],
    whereToReport: [
      "특허청",
      "지식재산침해 원스톱 신고상담센터"
    ],
    evidence: [
      "판매게시글 URL",
      "상품 이미지",
      "로고/상표 표시 캡처",
      "동일 판매자 추정 화면",
      "화면 캡처",
      "PDF 저장본"
    ],
    rewardGuide: [
      "특허청 공식 신고포상금 기준 확인 필요",
      "위조 여부 확정은 권리자/기관 판단 필요",
      "수령 보장 없음"
    ],
    officialLinks: pickLinksForModule("counterfeit_goods")
  },
  {
    moduleId: "subsidy_fraud",
    displayName: "보조금 부정수급 의심 후보 탐지",
    whatToCollect: [
      "보조금 공고",
      "보조사업자 정보",
      "사업명",
      "교부금액",
      "집행/정산 자료",
      "결과보고서",
      "결과물 URL",
      "단체명/주소 반복 패턴"
    ],
    whereToReport: [
      "국민권익위원회 / 청렴포털",
      "보조금 관리기관",
      "관할 지자체 감사부서"
    ],
    evidence: [
      "공고 URL",
      "정보공시 URL",
      "교부/집행/정산 자료",
      "반복 수급 정황",
      "결과물 부족 정황"
    ],
    rewardGuide: [
      "환수·처분·공공기관 수입 회복 등 공식 기준 확인 필요",
      "포상/보상 여부는 기관 판단에 따름",
      "수령 보장 없음"
    ],
    officialLinks: pickLinksForModule("subsidy_fraud")
  },
  {
    moduleId: "bid_collusion",
    displayName: "입찰담합 의심 패턴 분석",
    whatToCollect: [
      "입찰공고번호",
      "발주기관",
      "입찰일/개찰일",
      "참여업체 목록",
      "투찰금액",
      "낙찰금액",
      "낙찰률",
      "반복 참여 업체군"
    ],
    whereToReport: [
      "공정거래위원회",
      "발주기관 감사부서",
      "국민신문고"
    ],
    evidence: [
      "입찰공고",
      "개찰결과",
      "업체별 투찰금액",
      "반복 업체군 분석",
      "낙찰률 패턴"
    ],
    rewardGuide: [
      "공정위 신고포상금 기준 확인 필요",
      "담합 확정은 관계기관 조사 필요",
      "수령 보장 없음"
    ],
    officialLinks: pickLinksForModule("bid_collusion")
  }
];

const FAQS: GuideFaq[] = [
  {
    id: "faq-auto-submit",
    category: "auto-submit",
    question: "공익레이더가 자동으로 신고하나요?",
    answer:
      "아닙니다. 공익레이더는 후보 탐지, 증거정리, 신고서 초안 생성까지만 지원합니다. 실제 제출은 사람이 공식 신고기관에서 직접 해야 합니다. 자동 신고·자동 로그인·자동 민원 제출 기능은 제공하지 않습니다."
  },
  {
    id: "faq-reward",
    category: "reward",
    question: "포상금을 받을 수 있나요?",
    answer:
      "공익레이더는 포상금 수령을 보장하지 않습니다. 포상금/보상금은 기관별 공식 기준, 조사 결과, 처분 결과, 지급 제외 사유에 따라 달라집니다. 실전 신고 전에 해당 기관의 공식 안내를 직접 재확인하세요."
  },
  {
    id: "faq-what-collected",
    category: "data",
    question: "무엇을 수집하나요?",
    answer:
      "공개 URL, 광고 문구, 상품명, 판매자 공개 정보, 입찰/보조금 공개자료, 화면 캡처, PDF 저장본 등 공개자료 기반 증거를 수집합니다. 비공개·로그인 페이지·차단 우회 자료는 수집하지 않습니다."
  },
  {
    id: "faq-not-collected",
    category: "data",
    question: "수집하면 안 되는 것은 무엇인가요?",
    answer:
      "로그인 필요한 비공개자료, 개인정보, 민감정보, 계정정보, 주문내역, 내부자료, 차단 우회 자료는 수집하면 안 됩니다. 도구의 robots/약관·법령을 준수하세요."
  },
  {
    id: "faq-submit-method",
    category: "process",
    question: "신고서는 어떻게 제출하나요?",
    answer:
      "공익레이더가 만든 신고서 초안을 사람이 검토·수정한 뒤, 식약처·특허청·공정위·국민신문고·청렴포털 등 공식 창구에 직접 제출합니다. 도구가 외부로 자동 제출하지 않습니다."
  },
  {
    id: "faq-api-key",
    category: "process",
    question: "API 키가 없으면 사용할 수 없나요?",
    answer:
      "API 키가 없어도 Mock/Synthetic 모드로 흐름을 검증할 수 있습니다. 실제 후보 자동 발굴에는 Naver Search API 등 허용된 검색 소스 설정이 필요할 수 있으며, AI 분석을 사용하려면 OpenAI 키가 필요합니다."
  },
  {
    id: "faq-privacy",
    category: "privacy",
    question: "개인정보는 어떻게 처리하나요?",
    answer:
      "불필요한 개인정보는 저장하지 않는 것이 원칙이며, 개인정보성 문자열은 마스킹·삭제 기능으로 관리합니다. 메모/접수번호 등 사용자 입력에도 담당자 개인정보를 포함하지 마세요."
  },
  {
    id: "faq-ai-legal",
    category: "ai",
    question: "AI 판단이 법 위반 확정인가요?",
    answer:
      "아닙니다. AI 분석과 점수는 참고용이며, 법 위반 여부는 공식 기관의 판단을 대체하지 않습니다. 사람이 공식 기준과 처분 사례를 확인해야 합니다."
  },
  {
    id: "faq-pre-submit-checklist",
    category: "process",
    question: "신고 전 반드시 확인할 것은 무엇인가요?",
    answer:
      "원본 URL, 화면 캡처, PDF, 의심 문구 위치, 신고처 공식 기준, 개인정보 포함 여부, 신고서 초안에 보장성 표현(예: 수령 확정 등)이 들어가 있지 않은지 모두 확인해야 합니다."
  },
  {
    id: "faq-first-run",
    category: "first-run",
    question: "처음 사용자는 무엇부터 하면 되나요?",
    answer:
      "Home/Notice 확인 → 공지사항 확인 → Mock 후보 발굴 → Review Queue 이동 → 분석/증거/신고서 초안 확인 순서로 진행하세요. 실제 신고 전에 Mock 검증과 수동 URL 테스트를 먼저 권장합니다."
  }
];

export class GuideService {
  getGuide(): GuidePayload {
    return {
      schemaVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      title: "애드세이프(AdSafe) 사용 가이드",
      subtitle: "무엇을 수집하고 어디에 신고하는지 이해하기 위한 안내",
      description:
        "공익레이더는 공개자료 기반 신고 후보 탐지·증거정리·신고서 초안 생성 도구입니다. 실제 제출은 사람이 공식 창구에서 직접 수행하며, 포상금 수령을 보장하지 않습니다.",
      firstRunSteps: FIRST_RUN_STEPS,
      moduleGuides: MODULE_GUIDES,
      faqs: FAQS,
      officialLinks: OFFICIAL_LINKS,
      safetyNotice: GUIDE_SAFETY_NOTICE,
      safetyRules: SAFETY_RULES,
      rewardDisclaimer: REWARD_DISCLAIMER
    };
  }
}

export const guideService = new GuideService();
