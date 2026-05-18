/**
 * Synthetic Eval Set Generator (체크리스트 22)
 *
 * 합성 광고 문구 200건(VIOLATION_CANDIDATE 100 / NORMAL 100)을 생성한다.
 * - 모든 상품명/문구는 가상의 텍스트이다.
 * - 실제 업체명/판매자/개인정보를 포함하지 않는다.
 * - seed 고정으로 매 실행마다 동일한 결과를 반환한다.
 *
 * 산출물: src/modules/false-ad/eval/health_false_ad_synthetic_v1.json
 *
 * 사용:
 *   npm run eval:generate
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// ---- 결정적 난수 (mulberry32) — Math.random 미사용 -----
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(2026_05_18);
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function maybe(prob: number): boolean {
  return rand() < prob;
}

// ---- 가상 상품명 ----
const PRODUCTS = [
  "프리미엄 혈당 케어 A",
  "조인트 밸런스 B",
  "데일리 비타민 C",
  "굿나잇 허브 D",
  "이뮨 부스터 E",
  "디톡스 클렌즈 F",
  "퓨어 콜라겐 G",
  "프로 다이어트 H",
  "오메가3 그린 I",
  "리커버리 슬립 J",
  "헬시 콜레스테롤 K",
  "비타라이프 멀티 L"
];

const PRODUCT_TYPES = ["영양제", "건강기능식품", "헬스 보조제", "건강식품", "기능성 식품"];

// ---- VIOLATION 템플릿 (9개 카테고리) ----
// 각 템플릿은 [category, keywords[], builder]

type ViolationCat =
  | "DISEASE_TREATMENT"
  | "DISEASE_PREVENTION"
  | "DRUG_SUBSTITUTION"
  | "EXAGGERATED_EFFECT"
  | "DETOX_OVERSTATEMENT"
  | "TESTIMONIAL_OVERSTATEMENT"
  | "DIET_OVERSTATEMENT"
  | "INFLAMMATION_TUMOR"
  | "BP_BS_CHOL";

interface ViolationTemplate {
  category: ViolationCat;
  expected: string[];
  render: (p: string, t: string) => string;
}

const VIOLATION_TEMPLATES: ViolationTemplate[] = [
  // DISEASE_TREATMENT
  {
    category: "DISEASE_TREATMENT",
    expected: ["당뇨 완치"],
    render: (p, t) =>
      `${p} ${t}는 당뇨 완치에 도움을 주며, 꾸준히 섭취하면 혈당이 정상화됩니다. 약 없이도 가능합니다.`
  },
  {
    category: "DISEASE_TREATMENT",
    expected: ["고혈압 치료"],
    render: (p) =>
      `${p}는 고혈압 치료 효과가 있으며, 복용 후 혈압이 즉시 정상으로 돌아옵니다.`
  },
  {
    category: "DISEASE_TREATMENT",
    expected: ["관절염 완치"],
    render: (p, t) =>
      `${p} ${t}는 관절염 완치를 약속드립니다. 임상 결과 100% 효과를 확인했습니다.`
  },
  // DISEASE_PREVENTION (과한 예방 단정)
  {
    category: "DISEASE_PREVENTION",
    expected: ["암 예방"],
    render: (p) =>
      `${p}는 암 예방 효과가 입증되었으며, 꾸준히 드시면 종양 발생 위험이 사라집니다.`
  },
  {
    category: "DISEASE_PREVENTION",
    expected: ["치매 예방"],
    render: (p) =>
      `${p}는 치매 예방에 탁월합니다. 3개월 복용으로 인지 기능 저하를 막을 수 있습니다.`
  },
  // DRUG_SUBSTITUTION
  {
    category: "DRUG_SUBSTITUTION",
    expected: ["혈압약 대체"],
    render: (p) =>
      `${p}는 혈압약 대체가 가능합니다. 의사 처방 없이도 안전하게 드실 수 있습니다.`
  },
  {
    category: "DRUG_SUBSTITUTION",
    expected: ["약 대신"],
    render: (p, t) =>
      `${p} ${t}는 약 대신 먹는 자연 해결책입니다. 병원에 갈 필요 없이 가정에서 관리하세요.`
  },
  // EXAGGERATED_EFFECT
  {
    category: "EXAGGERATED_EFFECT",
    expected: ["기적의 효과", "100% 효과"],
    render: (p) =>
      `${p}는 기적의 효과를 약속드립니다. 단 7일 만에 100% 효과를 체감할 수 있습니다.`
  },
  {
    category: "EXAGGERATED_EFFECT",
    expected: ["면역력 1000%"],
    render: (p) =>
      `${p} 복용으로 면역력이 1000% 강해집니다. 한 통이면 평생 건강을 보장합니다.`
  },
  // DETOX_OVERSTATEMENT
  {
    category: "DETOX_OVERSTATEMENT",
    expected: ["독소 배출"],
    render: (p) =>
      `${p}는 체내 독소 배출을 완벽하게 해결합니다. 간과 신장의 모든 유해물질을 제거해 줍니다.`
  },
  {
    category: "DETOX_OVERSTATEMENT",
    expected: ["완벽 해독"],
    render: (p) =>
      `${p}는 완벽 해독 효과로 모든 질병의 원인인 노폐물을 한 번에 제거합니다.`
  },
  // TESTIMONIAL_OVERSTATEMENT
  {
    category: "TESTIMONIAL_OVERSTATEMENT",
    expected: ["완치되었어요"],
    render: (p, t) =>
      `구매 후기: ${p} ${t}를 먹고 당뇨가 완치되었어요. 약 끊고 일상에 복귀했습니다.`
  },
  {
    category: "TESTIMONIAL_OVERSTATEMENT",
    expected: ["부작용 없이 치료"],
    render: (p) =>
      `${p}로 부작용 없이 치료되었다는 후기가 쏟아지고 있습니다. 모든 환자에게 추천합니다.`
  },
  // DIET_OVERSTATEMENT
  {
    category: "DIET_OVERSTATEMENT",
    expected: ["체지방 100%"],
    render: (p) =>
      `${p}는 체지방 100% 분해를 약속드립니다. 운동 없이도 30일에 10kg 감량 가능합니다.`
  },
  {
    category: "DIET_OVERSTATEMENT",
    expected: ["살이 빠지는"],
    render: (p) =>
      `${p}는 먹기만 해도 살이 빠지는 마법의 보조제입니다. 식단 조절 없이 다이어트 성공.`
  },
  // INFLAMMATION_TUMOR
  {
    category: "INFLAMMATION_TUMOR",
    expected: ["염증 완전 제거"],
    render: (p) =>
      `${p}는 만성 염증을 완전 제거합니다. 류마티스, 자가면역질환에도 효과적입니다.`
  },
  {
    category: "INFLAMMATION_TUMOR",
    expected: ["종양 감소"],
    render: (p) =>
      `${p} 임상에서 종양 감소가 확인되었습니다. 환자 95%가 호전을 경험했습니다.`
  },
  // BP_BS_CHOL
  {
    category: "BP_BS_CHOL",
    expected: ["콜레스테롤 정상화"],
    render: (p) =>
      `${p}는 콜레스테롤 정상화를 보장합니다. 스타틴 계열 약을 끊을 수 있습니다.`
  },
  {
    category: "BP_BS_CHOL",
    expected: ["혈당 즉시"],
    render: (p, t) =>
      `${p} ${t} 복용 후 혈당이 즉시 떨어집니다. 식후 혈당 관리가 완벽해집니다.`
  },
  {
    category: "BP_BS_CHOL",
    expected: ["혈압이 즉시"],
    render: (p) =>
      `${p}는 혈압이 즉시 정상으로 돌아오는 효과를 제공합니다. 의약품과 동일한 작용입니다.`
  }
];

// ---- NORMAL 템플릿 (보수적·일반 표현, 일부는 의도적으로 '혈당/관절/피로' 단어 포함) ----

type NormalCat =
  | "GENERAL_HEALTH"
  | "FUNCTIONAL_INGREDIENT"
  | "USAGE_WARNING"
  | "GENERIC_REVIEW"
  | "PRICE_SHIPPING"
  | "EXPERT_CONSULT"
  | "NUTRITION_INFO"
  | "SELLER_INFO"
  | "EXCHANGE_RETURN";

interface NormalTemplate {
  category: NormalCat;
  render: (p: string, t: string) => string;
}

const NORMAL_TEMPLATES: NormalTemplate[] = [
  // GENERAL_HEALTH — 일반 건강 표현
  {
    category: "GENERAL_HEALTH",
    render: (p, t) =>
      `${p} ${t}는 일상의 건강 유지에 도움을 줄 수 있는 보조제입니다. 균형 잡힌 식단과 함께 섭취해 보세요.`
  },
  {
    category: "GENERAL_HEALTH",
    render: (p) =>
      `${p}는 활기찬 하루를 시작하는 분들을 위해 설계된 일반 건강식품입니다.`
  },
  // FUNCTIONAL_INGREDIENT — 기능성 원료 설명 수준
  {
    category: "FUNCTIONAL_INGREDIENT",
    render: (p) =>
      `${p}의 주요 원료는 바나바잎 추출물 600mg과 여주분말 200mg입니다. 자세한 함량은 영양정보를 참고하세요.`
  },
  {
    category: "FUNCTIONAL_INGREDIENT",
    render: (p) =>
      `${p}에는 식약처 인정 기능성 원료가 포함되어 있으며, 일반적인 영양 보충을 목적으로 합니다.`
  },
  // USAGE_WARNING — 섭취방법/주의사항
  {
    category: "USAGE_WARNING",
    render: (p) =>
      `${p} 섭취 방법: 1일 1회 2캡슐, 식후 30분 이내 드세요. 권장 섭취량을 지켜 주세요.`
  },
  {
    category: "USAGE_WARNING",
    render: (p) =>
      `${p} 섭취 시 주의사항: 임산부, 수유부, 만성질환자는 전문가와 상담 후 섭취하세요. 알레르기 체질은 원료를 확인해 주세요.`
  },
  // GENERIC_REVIEW — 일반 후기, 단정 효능 없음
  {
    category: "GENERIC_REVIEW",
    render: (p) =>
      `구매 후기: ${p}를 한 달간 꾸준히 먹어보고 있습니다. 컨디션 관리에 참고가 되어 만족합니다.`
  },
  {
    category: "GENERIC_REVIEW",
    render: (p) =>
      `구매 후기: ${p} 포장이 깔끔하고 섭취가 편합니다. 효과는 개인차가 있을 수 있어 보입니다.`
  },
  // PRICE_SHIPPING — 가격/배송/상품 구성
  {
    category: "PRICE_SHIPPING",
    render: (p) =>
      `${p}는 30정 39,800원, 60정 69,800원으로 구성됩니다. 3만원 이상 무료 배송이 적용됩니다.`
  },
  {
    category: "PRICE_SHIPPING",
    render: (p) =>
      `${p} 상품은 일반 택배로 발송되며, 평일 오후 2시 이전 주문 시 당일 출고됩니다.`
  },
  // EXPERT_CONSULT — 질환자 상담 권고
  {
    category: "EXPERT_CONSULT",
    render: (p) =>
      `${p}는 일반 건강기능식품이며, 질환이 있으신 분은 의사나 약사와 상담 후 섭취하시기 바랍니다.`
  },
  {
    category: "EXPERT_CONSULT",
    render: (p) =>
      `혈당 관리가 필요한 분은 전문가와 상담 후 ${p} 섭취 여부를 결정해 주세요.`
  },
  // NUTRITION_INFO — 일반 영양정보
  {
    category: "NUTRITION_INFO",
    render: (p) =>
      `${p} 1일 섭취량(2캡슐) 기준 열량 8kcal, 탄수화물 1g, 단백질 0.5g, 지방 0.3g 입니다.`
  },
  {
    category: "NUTRITION_INFO",
    render: (p) =>
      `${p} 영양정보는 포장지 후면에 표기된 내용을 참고해 주시고, 일반 식품으로 활용해 주세요.`
  },
  // SELLER_INFO — 판매자 안내 (가상 사업자)
  {
    category: "SELLER_INFO",
    render: (p) =>
      `${p} 판매자: 예시건강(주) · 사업자 정보는 상품 상세 페이지 하단을 참고해 주세요.`
  },
  {
    category: "SELLER_INFO",
    render: (p) =>
      `${p}는 식약처 신고 절차를 거친 일반 건강기능식품 카테고리에 속합니다. 광고 표현은 보수적으로 유지합니다.`
  },
  // EXCHANGE_RETURN — 교환/반품
  {
    category: "EXCHANGE_RETURN",
    render: () =>
      `교환/반품 안내: 단순 변심은 수령 후 7일 이내 가능합니다. 식품 특성상 개봉 후 교환은 제한될 수 있습니다.`
  },
  {
    category: "EXCHANGE_RETURN",
    render: (p) =>
      `${p} 환불 정책은 일반 식품 기준을 따릅니다. 자세한 사항은 고객센터 안내 페이지를 확인해 주세요.`
  },
  // 추가: 의도적으로 '혈당/관절/피로' 단어 포함 — 키워드만 보고 오탐하지 않도록 측정
  {
    category: "GENERAL_HEALTH",
    render: (p) =>
      `${p}는 일상에서 관절 건강 유지에 관심 있는 분들이 참고할 수 있는 일반 건강식품입니다.`
  },
  {
    category: "GENERAL_HEALTH",
    render: (p) =>
      `${p}는 피로감을 느끼는 일상에서 영양 보충을 보조하는 일반 식품입니다.`
  }
];

function buildViolationSample(i: number): {
  id: string;
  label: "VIOLATION_CANDIDATE";
  category: string;
  productName: string;
  text: string;
  expectedKeywords: string[];
  notes: string;
} {
  const tpl = VIOLATION_TEMPLATES[i % VIOLATION_TEMPLATES.length];
  const product = pick(PRODUCTS);
  const productType = pick(PRODUCT_TYPES);
  let text = tpl.render(product, productType);
  // 일부는 정상 문장(가격/주의)을 같이 섞어서 노이즈 추가
  if (maybe(0.4)) {
    text += ` 정가 49,800원, 무료 배송. 일반 식품이므로 의학적 효과를 보장하지 않습니다.`;
  }
  return {
    id: `sample_v${String(i + 1).padStart(3, "0")}`,
    label: "VIOLATION_CANDIDATE",
    category: tpl.category,
    productName: product,
    text,
    expectedKeywords: tpl.expected,
    notes: "synthetic — 가상의 위반 의심 광고 문구"
  };
}

function buildNormalSample(i: number): {
  id: string;
  label: "NORMAL";
  category: string;
  productName: string;
  text: string;
  notes: string;
} {
  const tpl = NORMAL_TEMPLATES[i % NORMAL_TEMPLATES.length];
  const product = pick(PRODUCTS);
  const productType = pick(PRODUCT_TYPES);
  let text = tpl.render(product, productType);
  if (maybe(0.3)) {
    text += ` 본 제품은 일반 식품이며, 질병의 예방·치료를 목적으로 하지 않습니다.`;
  }
  return {
    id: `sample_n${String(i + 1).padStart(3, "0")}`,
    label: "NORMAL",
    category: tpl.category,
    productName: product,
    text,
    notes: "synthetic — 가상의 정상 광고/안내 문구"
  };
}

async function main() {
  const samples: Array<ReturnType<typeof buildViolationSample> | ReturnType<typeof buildNormalSample>> = [];
  for (let i = 0; i < 100; i++) samples.push(buildViolationSample(i));
  for (let i = 0; i < 100; i++) samples.push(buildNormalSample(i));

  const out = {
    schemaVersion: "1.0.0" as const,
    evalSetId: "health_false_ad_synthetic_v1",
    moduleId: "false_ad",
    name: "건강기능식품 허위·과대광고 합성 평가셋 v1",
    description:
      "체크리스트 22를 위해 만든 가상 광고 문구 평가셋. 실제 업체/개인정보는 포함하지 않는다. RuleAgent/ScoringAgent의 Precision/Recall/F1/Accuracy 측정을 위한 200건 (위반 100/정상 100).",
    language: "ko" as const,
    synthetic: true as const,
    source: "synthetic_generator_v1",
    createdAt: new Date("2026-05-18T00:00:00.000Z").toISOString(),
    notes: [
      "모든 상품명/문구는 가상의 합성 데이터입니다.",
      "실제 업체명/판매자/개인정보는 포함하지 않습니다.",
      "평가 결과는 내부 품질 측정용이며, 실제 신고 판단을 대체하지 않습니다.",
      "평가 결과로 룰/프롬프트/점수를 자동 변경하지 않습니다."
    ],
    samples
  };

  const outDir = path.join("src", "modules", "false-ad", "eval");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "health_false_ad_synthetic_v1.json");
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(
    `[eval:generate] wrote ${outPath} samples=${samples.length} (violation=${samples.filter((s) => s.label === "VIOLATION_CANDIDATE").length}, normal=${samples.filter((s) => s.label === "NORMAL").length})`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
