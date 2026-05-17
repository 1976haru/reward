import type { CollectedDocument } from "../types/core.js";

export class PolicyAgent {
  validatePublicAnalysis(doc: CollectedDocument): string[] {
    const warnings: string[] = [];
    if (doc.text.length < 80) warnings.push("본문이 너무 짧습니다. 동적 페이지이거나 수집 제한이 있을 수 있습니다.");
    if (/login|로그인|비밀번호|password/i.test(doc.title)) warnings.push("로그인/계정 페이지일 수 있으므로 분석 대상에서 제외하는 것이 안전합니다.");
    if (/주민등록번호|계좌번호|개인정보|전화번호/i.test(doc.text.slice(0, 2000))) warnings.push("개인정보가 포함될 수 있어 저장/공유 전 마스킹이 필요합니다.");
    return warnings;
  }
}
