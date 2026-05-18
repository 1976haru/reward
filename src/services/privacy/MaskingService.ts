// MaskingService (체크리스트 28)
//
// 개인정보성 문자열을 SensitiveDataDetector 로 찾아 마스킹 토큰으로 치환한다.
// 본 서비스는 보수적이며 오탐 가능성이 있으므로, 사람 검토가 필요한 결과에는 권고 액션이 포함된다.

import { detectSensitive } from "./SensitiveDataDetector.js";
import {
  MASK_TOKENS,
  PRIVACY_SAFETY_NOTICE,
  type MaskingResult,
  type PrivacyFinding,
  type SensitiveDataType
} from "../../types/privacy.js";

export interface MaskOptions {
  enabled?: boolean;
  // 키-이름 기반 매치 (JSON 직렬화) 도 함께 치환할지
  applyJsonKeyMask?: boolean;
}

export function maskText(input: string, opts: MaskOptions = {}): MaskingResult {
  const original = typeof input === "string" ? input : "";
  if (!original) {
    return {
      original: "",
      masked: "",
      changed: false,
      findings: [],
      byType: {},
      safetyNotice: PRIVACY_SAFETY_NOTICE
    };
  }
  const enabled = opts.enabled ?? true;
  const findings = detectSensitive(original);

  if (!enabled) {
    return {
      original,
      masked: original,
      changed: false,
      findings,
      byType: countByType(findings),
      safetyNotice: PRIVACY_SAFETY_NOTICE
    };
  }

  // 위치 역순으로 치환 (오프셋 어긋남 방지)
  let masked = original;
  const sorted = [...findings].sort((a, b) => b.startIndex - a.startIndex);
  let changed = false;
  for (const f of sorted) {
    // ACCOUNT_NUMBER / IP_ADDRESS 처럼 confidence LOW/MEDIUM 은 키-이름 기반이 아닌 한 마스킹 적용
    masked = masked.slice(0, f.startIndex) + f.replacement + masked.slice(f.endIndex);
    changed = true;
  }

  return {
    original,
    masked,
    changed,
    findings,
    byType: countByType(findings),
    safetyNotice: PRIVACY_SAFETY_NOTICE
  };
}

function countByType(findings: PrivacyFinding[]): Partial<Record<SensitiveDataType, number>> {
  const out: Partial<Record<SensitiveDataType, number>> = {};
  for (const f of findings) out[f.type] = (out[f.type] ?? 0) + 1;
  return out;
}

// 개별 유형별 헬퍼 — 호출자가 명시적으로 한 종류만 마스킹하고 싶을 때
export function maskEmail(s: string): string {
  return s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, MASK_TOKENS.EMAIL);
}
export function maskPhone(s: string): string {
  return s.replace(/\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, MASK_TOKENS.PHONE);
}
export function maskRrn(s: string): string {
  return s.replace(/\b\d{6}-\d{7}\b/g, MASK_TOKENS.KOREAN_RRN);
}
export function maskApiKey(s: string): string {
  return s.replace(
    /\b(sk-[A-Za-z0-9_\-]{16,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|xox[apbs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_\-]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,})\b/g,
    MASK_TOKENS.API_KEY
  );
}
export function maskBearer(s: string): string {
  return s.replace(/\bBearer\s+[A-Za-z0-9._\-]{20,}/g, MASK_TOKENS.AUTH_HEADER);
}
export function maskJwt(s: string): string {
  return s.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, MASK_TOKENS.TOKEN);
}

export { PRIVACY_SAFETY_NOTICE };
