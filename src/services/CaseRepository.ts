// 레거시 import 경로 호환 — 실 구현은 src/repositories/CaseRepository.ts 로 이동했다.
// 신규 코드는 ../repositories/CaseRepository.js 에서 import 하는 것을 권장한다.

export {
  JsonCaseRepository as CaseRepository,
  createCaseRepository,
  CaseNotFoundError,
  CaseTransitionError,
  type ICaseRepository,
  type CaseListQuery,
  type CaseListResult,
  type CreateCaseInput,
  type PatchCaseFields,
  type TransitionInput,
  type ReviewInput
} from "../repositories/CaseRepository.js";
