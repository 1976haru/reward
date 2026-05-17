// Module bootstrap — 이 파일이 import 되면 모든 모듈이 registry에 등록된다.
// 새 모듈을 추가하려면 plannedModules 배열을 옮기거나 별도 폴더에서 import 한 뒤 register 한다.

import { moduleRegistry, type ModuleDefinition } from "../core/moduleRegistry.js";
import { falseAdDefinition } from "./false-ad/index.js";

const plannedModules: ModuleDefinition[] = [
  {
    id: "counterfeit_goods",
    slug: "counterfeit-goods",
    name: "위조상품 온라인 판매",
    category: "intellectual_property",
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
      agency: "특허청, 관세청",
      target: "오픈마켓·SNS·해외직구 위조 브랜드 상품",
      difficulty: "보통",
      rewardLikelihood: "공식 기준 확인 필요"
    }
  },
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
  {
    id: "subsidy_fraud",
    slug: "subsidy-fraud",
    name: "보조금 부정수급",
    category: "public_funds",
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
      agency: "국민권익위원회, 소관 부처",
      target: "정부·지자체 보조금 공시·실집행 자료",
      difficulty: "어려움",
      rewardLikelihood: "공식 기준 확인 필요"
    }
  },
  {
    id: "bid_collusion",
    slug: "bid-collusion",
    name: "입찰담합 의심",
    category: "antitrust",
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
      agency: "공정거래위원회",
      target: "공공조달 입찰 공고·낙찰 결과 공시",
      difficulty: "어려움",
      rewardLikelihood: "공식 기준 확인 필요"
    }
  }
];

let bootstrapped = false;
export function bootstrapModules(): void {
  if (bootstrapped) return;
  moduleRegistry.register(falseAdDefinition, { isDefault: true });
  for (const planned of plannedModules) {
    moduleRegistry.register(planned);
  }
  bootstrapped = true;
}

bootstrapModules();

export { moduleRegistry };
