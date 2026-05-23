// 데이터 기준선 품질검증 테스트용 가짜 보조사업 데이터 생성기 (체크리스트 16 — 필수 작업 5).
//
// 모든 데이터는 가짜(합성)이며 실제 기관명/개인정보가 아니다.
// 일부 레코드는 "마스킹 동작 검증" 목적으로 개인정보처럼 보이는 합성 패턴을 포함한다.
// 본 fixture 는 적재 경로/품질 리포트 검증용이며 실데이터 기준선으로 간주하지 않는다.

export interface RawBaselineInput {
  projectName?: string;
  recipientName?: string;
  localGovName?: string;
  fiscalYear?: number;
  subsidyAmount?: number;
  documentType?: string;
  sourceUrl?: string;
  evidenceUrl?: string;
  collectedAt?: string;
  sourceText?: string;
}

const PROJECT_THEMES = [
  "청년 문화활동 지원사업",
  "아동 돌봄 지원사업",
  "노인 일자리 지원사업",
  "장애인 활동 지원사업",
  "농업 기술 교육사업",
  "스마트팜 보급사업",
  "마을 공동체 활성화 지원사업",
  "주거 환경 개선 지원사업",
  "예술인 창작 지원사업",
  "다문화 가정 교육지원사업",
  "환경 정화 활동 지원사업",
  "창업 지원 프로그램"
];

const RECIPIENT_BASES = [
  "행복나눔",
  "미래복지",
  "푸른솔",
  "한울타리",
  "늘봄돌봄",
  "청춘나래",
  "두드림",
  "우리마을",
  "빛고을",
  "참좋은",
  "새빛",
  "다온누리"
];

const RECIPIENT_FORMS = ["주식회사 {b}", "(주){b}", "사단법인 {b}", "재단법인 {b}복지재단", "{b}협동조합", "{b}센터"];

const LOCAL_GOVS = ["예시시", "예시군", "가상시 가상구", "표본시", "샘플군", "테스트시 테스트구"];

const YEARS = [2023, 2024, 2025];

const DOC_TYPES = ["subsidy_notice", "settlement", "selection_result", "recovery_return", "inspection"];

// 사업명 세부 변형(연도/차수가 아니라 정규화 키에 남는 토큰) — 자연 중복률을 낮춘다.
const SUB_VARIANTS = ["기본형", "확대형", "신규형", "계속형", "특화형", "연계형", "협력형", "자립형"];

/**
 * 가짜 보조사업 데이터 count 건 생성.
 * - 일부 중복 후보(동일 사업/기관/금액/연도) 포함
 * - 일부 결측 필드(사업명/금액/지자체 누락) 포함
 * - 일부 합성 PII(전화/이메일) 포함 — 저장 시 마스킹되어야 함
 */
export function createBaselineFixtures(count = 1000): RawBaselineInput[] {
  const out: RawBaselineInput[] = [];
  for (let i = 0; i < count; i++) {
    // 인덱스를 서로소 배수로 분산해 lockstep 중복을 방지(자연 중복률↓).
    const theme = PROJECT_THEMES[i % PROJECT_THEMES.length];
    const sub = SUB_VARIANTS[(i * 13) % SUB_VARIANTS.length];
    const base = RECIPIENT_BASES[(i * 7) % RECIPIENT_BASES.length];
    const form = RECIPIENT_FORMS[(i * 3) % RECIPIENT_FORMS.length].replace("{b}", base);
    const year = YEARS[i % YEARS.length];
    const gov = LOCAL_GOVS[(i * 5) % LOCAL_GOVS.length];
    // 레코드별로 분산된 금액 — 자연 중복을 줄여 의도된 중복(약 10%)만 남도록 한다.
    const amount = 1_000_000 + i * 100_000;

    const rec: RawBaselineInput = {
      projectName: `${year}년 ${theme} ${sub}`,
      recipientName: form,
      localGovName: gov,
      fiscalYear: year,
      subsidyAmount: amount,
      documentType: DOC_TYPES[i % DOC_TYPES.length],
      sourceUrl: `https://example.go.kr/subsidy/${i}`,
      evidenceUrl: `https://example.go.kr/evidence/${i}`,
      collectedAt: new Date(Date.UTC(year, (i % 12), 1 + (i % 27))).toISOString()
    };

    // 약 10%: 명시적 중복 후보(직전 레코드와 동일 핵심 필드)
    if (i > 0 && i % 10 === 0) {
      const prev = out[i - 1];
      rec.projectName = prev.projectName;
      rec.recipientName = prev.recipientName;
      rec.localGovName = prev.localGovName;
      rec.fiscalYear = prev.fiscalYear;
      rec.subsidyAmount = prev.subsidyAmount;
    }

    // 약 7%: 결측 필드
    if (i % 14 === 0) {
      delete rec.subsidyAmount;
    }
    if (i % 23 === 0) {
      delete rec.localGovName;
    }
    if (i % 37 === 0) {
      delete rec.projectName; // 필수 필드 결측 → qualityWarnings
    }

    // 약 5%: recipientName 에 합성 PII 부착 (저장 시 마스킹되어야 함 — 결과에 원문이 남으면 안 됨)
    if (i % 20 === 0 && rec.recipientName) {
      rec.recipientName = `${rec.recipientName} (담당 010-1234-5678 test@example.com 900101-1234567)`;
    }

    out.push(rec);
  }
  return out;
}
