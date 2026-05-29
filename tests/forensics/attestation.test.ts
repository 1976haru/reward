import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeAttestation,
  ELEVEN_POINT_FACT_CHECKS,
  blankAttestationChecks,
} from '../../src/forensics/attestation';

test('attestation: rejects short statement', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'att-'));
  try {
    await assert.rejects(
      () =>
        writeAttestation({
          caseDir: dir,
          caseId: 'c-1',
          reviewerId: 'tester',
          statement: 'short',
          checks: blankAttestationChecks(),
        }),
      /at least 10 characters/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('attestation: rejects missing reviewerId', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'att-'));
  try {
    await assert.rejects(
      () =>
        writeAttestation({
          caseDir: dir,
          caseId: 'c-1',
          reviewerId: '',
          statement: 'I observed the page directly.',
          checks: blankAttestationChecks(),
        }),
      /reviewerId is required/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('attestation: requires all 11 fact-check items', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'att-'));
  try {
    await assert.rejects(
      () =>
        writeAttestation({
          caseDir: dir,
          caseId: 'c-1',
          reviewerId: 'tester',
          statement: 'I observed the page directly at 2026-01-01.',
          checks: [{ question: 'q', answer: 'yes' }],
        }),
      /11 fact-check/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('attestation: write succeeds and writes file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'att-'));
  try {
    const ref = await writeAttestation({
      caseDir: dir,
      caseId: 'c-1',
      reviewerId: 'tester',
      statement: 'I observed the page directly on 2026-01-01 in my browser.',
      checks: blankAttestationChecks(),
    });
    assert.equal(ref.attestationFile, 'attestation.json');
    assert.equal(ref.attestationSha256.length, 64);
    const body = JSON.parse(await readFile(join(dir, ref.attestationFile), 'utf8'));
    assert.equal(body.version, '1.0');
    assert.equal(body.caseId, 'c-1');
    assert.equal(body.checks.length, 11);
    assert.equal(body.checks[0].question, ELEVEN_POINT_FACT_CHECKS[0]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('attestation: rejects invalid answer values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'att-'));
  try {
    const bad = blankAttestationChecks().map((c, i) =>
      i === 0 ? { ...c, answer: 'maybe' as 'yes' } : c
    );
    await assert.rejects(
      () =>
        writeAttestation({
          caseDir: dir,
          caseId: 'c-1',
          reviewerId: 'tester',
          statement: 'I observed the page directly on 2026-01-01.',
          checks: bad,
        }),
      /invalid answer/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
