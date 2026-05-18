// Feedback / 검토 메모용 개인정보 마스킹 유틸
// services/TextExtractor.ts 의 maskPII 와 동일한 정책이지만, 마스킹 여부를 함께 리턴한다.
// 완벽한 PII 탐지가 아니며, "최소화 원칙" 수준의 1차 방어선이다.

export interface PiiMaskResult {
  masked: string;
  changed: boolean;
  hits: {
    email: number;
    phone: number;
    rrn: number;
  };
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g;
// 주민등록번호 패턴 (정확 검증 아님 — 형태만)
const RRN_RE = /\b\d{6}[-]\d{7}\b/g;

export function maskPiiForFeedback(input: string | undefined | null): PiiMaskResult {
  if (!input) return { masked: "", changed: false, hits: { email: 0, phone: 0, rrn: 0 } };
  const hits = { email: 0, phone: 0, rrn: 0 };
  let out = input;
  out = out.replace(EMAIL_RE, () => {
    hits.email += 1;
    return "[masked-email]";
  });
  out = out.replace(PHONE_RE, () => {
    hits.phone += 1;
    return "[masked-phone]";
  });
  out = out.replace(RRN_RE, () => {
    hits.rrn += 1;
    return "[masked-id]";
  });
  return { masked: out, changed: out !== input, hits };
}
