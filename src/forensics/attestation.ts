import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type {
  CollectorAttestation,
  AttestationRef,
  Sha256Hex,
} from '../types/forensics.js';

/**
 * 11-point fact-check (from docs/PRE_SUBMISSION_FACT_CHECKLIST.md).
 * Order is significant — used as the canonical question set for attestations.
 */
export const ELEVEN_POINT_FACT_CHECKS: readonly string[] = [
  '공개자료에서 수집했는가?',
  '원문 URL이 정확한가?',
  '관련 금액을 확인했는가? (해당 없으면 na)',
  '대상 기간을 확인했는가?',
  '수급기관/판매자가 식별되는가?',
  '사업명/상품명이 명확한가?',
  '의심근거를 한 문장으로 설명 가능한가?',
  '반대 가능성(상대 주장)을 검토했는가?',
  '개인정보 마스킹이 누락 없이 적용되었는가?',
  '단정 표현(위반/사기/처벌 등) 없이 작성되었는가?',
  '증거 패키지(스크린샷/HTML/PDF/WARC)가 모두 들어 있는가?',
];

const MIN_STATEMENT_LENGTH = 10;

/**
 * Write a collector attestation file to caseDir.
 * Returns a reference suitable for embedding into the manifest.
 *
 * Validation:
 *   - reviewerId non-empty
 *   - statement length ≥ 10 chars
 *   - all 11 fact-check items present
 *   - each check has a valid answer ('yes'|'no'|'na')
 */
export async function writeAttestation(input: {
  caseDir: string;
  caseId: string;
  reviewerId: string;
  statement: string;
  checks: ReadonlyArray<{
    question: string;
    answer: 'yes' | 'no' | 'na';
    note?: string;
  }>;
}): Promise<AttestationRef> {
  if (!input.reviewerId || input.reviewerId.trim().length === 0) {
    throw new Error('reviewerId is required (set REVIEWER_NAME env)');
  }
  if (!input.statement || input.statement.trim().length < MIN_STATEMENT_LENGTH) {
    throw new Error(`attestation statement must be at least ${MIN_STATEMENT_LENGTH} characters`);
  }
  if (input.checks.length !== ELEVEN_POINT_FACT_CHECKS.length) {
    throw new Error(
      `attestation must include all ${ELEVEN_POINT_FACT_CHECKS.length} fact-check items, got ${input.checks.length}`
    );
  }
  for (const c of input.checks) {
    if (!['yes', 'no', 'na'].includes(c.answer)) {
      throw new Error(`invalid answer for "${c.question}": ${String(c.answer)}`);
    }
  }

  const att: CollectorAttestation = {
    version: '1.0',
    caseId: input.caseId,
    reviewerId: input.reviewerId,
    statement: input.statement,
    observedAt: new Date().toISOString(),
    checks: input.checks,
  };
  await fs.mkdir(input.caseDir, { recursive: true });
  const fileName = 'attestation.json';
  const filePath = path.join(input.caseDir, fileName);
  const json = JSON.stringify(att, null, 2);
  await fs.writeFile(filePath, json, 'utf8');
  const sha = createHash('sha256').update(json).digest('hex') as Sha256Hex;
  return { attestationFile: fileName, attestationSha256: sha };
}

/**
 * Quick-build for tests/wiring: marks every check as 'yes'.
 * NOTE: do NOT use in production — the reviewer must explicitly answer each item.
 */
export function blankAttestationChecks(): ReadonlyArray<{
  question: string;
  answer: 'yes' | 'no' | 'na';
}> {
  return ELEVEN_POINT_FACT_CHECKS.map((q) => ({ question: q, answer: 'yes' as const }));
}
