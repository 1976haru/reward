// Module bootstrap — 이 파일이 import 되면 모든 모듈이 registry에 등록된다.
// 새 모듈을 추가하려면 plannedModules 배열을 옮기거나 별도 폴더에서 import 한 뒤 register 한다.

import { moduleRegistry, type ModuleDefinition } from "../core/moduleRegistry.js";
import { falseAdDefinition } from "./false-ad/index.js";
import { generalFoodFalseAdDefinition } from "./general-food-false-ad/index.js";
import { cosmeticFalseAdDefinition } from "./cosmetic-false-ad/index.js";
import { counterfeitGoodsDefinition } from "./counterfeit-goods/index.js";
import { subsidyFraudDefinition } from "./subsidy-fraud/index.js";
import { bidCollusionDefinition } from "./bid-collusion/index.js";

const plannedModules: ModuleDefinition[] = [
  {
    id: "origin_labeling",
    slug: "origin-labeling",
    name: "원산지 표시 위반",
    category: "food_labeling",
    status: "planned",
    capabilities: {
      publicUrlAnalysis: false,
      ruleBasedDetection: false,
      aiAnalysis: false,
      evidencePackage: false,
      reportDraft: false
    },
    supportedInputTypes: [],
    safetyNotes: [
      "자동 신고 금지",
      "사람 검토 필수",
      "포상금 수령 보장 없음"
    ],
    ui: {
      agency: "국립농산물품질관리원, 관세청, 지자체",
      target: "식품·농수산물·가공식품 원산지 표기",
      difficulty: "보통",
      rewardLikelihood: "공식 기준 확인 필요"
    }
  },
];

let bootstrapped = false;
export function bootstrapModules(): void {
  if (bootstrapped) return;
  moduleRegistry.register(falseAdDefinition, { isDefault: true });
  // 일반식품 허위·과대광고 — 2차 확장
  moduleRegistry.register(generalFoodFalseAdDefinition);
  // 화장품 허위·과대광고 — 3차 확장 (룰셋 준비 완료, 신고서/agency_config 는 다음 단계)
  moduleRegistry.register(cosmeticFalseAdDefinition);
  // 위조상품 모듈 — ready 상태로 등록 (룰/스카웃/리포트 최소 연결 완료)
  moduleRegistry.register(counterfeitGoodsDefinition);
  // 보조금 부정수급 의심 — prototype 상태 (체크리스트 25)
  moduleRegistry.register(subsidyFraudDefinition);
  // 입찰담합 의심 패턴 — prototype 상태 (체크리스트 26)
  moduleRegistry.register(bidCollusionDefinition);
  for (const planned of plannedModules) {
    moduleRegistry.register(planned);
  }
  bootstrapped = true;
}

bootstrapModules();

export { moduleRegistry };
