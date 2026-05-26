// Module bootstrap — 이 파일이 import 되면 모든 모듈이 registry에 등록된다.
// 새 모듈을 추가하려면 plannedModules 배열을 옮기거나 별도 폴더에서 import 한 뒤 register 한다.

import { moduleRegistry, type ModuleDefinition } from "../core/moduleRegistry.js";
import { falseAdDefinition } from "./false-ad/index.js";
import { generalFoodFalseAdDefinition } from "./general-food-false-ad/index.js";
import { cosmeticFalseAdDefinition } from "./cosmetic-false-ad/index.js";
import { medicalDeviceFalseAdDefinition } from "./medical-device-false-ad/index.js";
import { counterfeitGoodsDefinition } from "./counterfeit-goods/index.js";
import { originLabelingDefinition } from "./origin-labeling/index.js";
import { subsidyFraudDefinition } from "./subsidy-fraud/index.js";
import { bidCollusionDefinition } from "./bid-collusion/index.js";

// 원산지 표시 위반(origin_labeling) 은 ready 모듈로 승격되어 별도 정의로 등록한다.
// 현재 추가 예정 모듈은 없다.
const plannedModules: ModuleDefinition[] = [];

let bootstrapped = false;
export function bootstrapModules(): void {
  if (bootstrapped) return;
  moduleRegistry.register(falseAdDefinition, { isDefault: true });
  // 일반식품 허위·과대광고 — 2차 확장
  moduleRegistry.register(generalFoodFalseAdDefinition);
  // 화장품 허위·과대광고 — 3차 확장
  moduleRegistry.register(cosmeticFalseAdDefinition);
  // 의료기기 허위·과대광고 — 후속 쉬운 확장 (룰셋 준비 완료, 신고서/agency_config 는 다음 단계)
  moduleRegistry.register(medicalDeviceFalseAdDefinition);
  // 위조상품 모듈 — ready 상태로 등록 (룰/스카웃/리포트 최소 연결 완료)
  moduleRegistry.register(counterfeitGoodsDefinition);
  // 원산지 표시 위반 의심 — 후속 쉬운 확장 (룰셋 준비 완료, 신고서/agency_config 는 다음 단계)
  moduleRegistry.register(originLabelingDefinition);
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
