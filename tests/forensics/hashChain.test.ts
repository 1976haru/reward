import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HashChain } from '../../src/forensics/hashChain';
import { GENESIS_HASH } from '../../src/types/forensics';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'chain-'));
  return {
    dir,
    logPath: join(dir, 'chain.jsonl'),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

test('genesis: first append uses GENESIS_HASH', async () => {
  const s = await setup();
  try {
    const chain = new HashChain(s.logPath);
    const e = await chain.append({
      caseId: 'case-1',
      manifestSha256: 'a'.repeat(64),
      createdAt: '2026-01-01T00:00:00Z',
    });
    assert.equal(e.index, 0);
    assert.equal(e.previousChainHash, GENESIS_HASH);
    assert.equal(e.chainHash.length, 64);
    assert.match(e.chainHash, /^[0-9a-f]{64}$/);
  } finally {
    await s.cleanup();
  }
});

test('append: each entry links to previous chainHash', async () => {
  const s = await setup();
  try {
    const chain = new HashChain(s.logPath);
    const e1 = await chain.append({
      caseId: 'c1',
      manifestSha256: '1'.repeat(64),
      createdAt: '2026-01-01T00:00:00Z',
    });
    const e2 = await chain.append({
      caseId: 'c2',
      manifestSha256: '2'.repeat(64),
      createdAt: '2026-01-02T00:00:00Z',
    });
    const e3 = await chain.append({
      caseId: 'c3',
      manifestSha256: '3'.repeat(64),
      createdAt: '2026-01-03T00:00:00Z',
    });
    assert.equal(e2.index, 1);
    assert.equal(e3.index, 2);
    assert.equal(e2.previousChainHash, e1.chainHash);
    assert.equal(e3.previousChainHash, e2.chainHash);
    const v = await chain.verify();
    assert.equal(v.ok, true);
    if (v.ok) assert.equal(v.count, 3);
  } finally {
    await s.cleanup();
  }
});

test('verify: detects manifestSha256 tampering on a past entry', async () => {
  const s = await setup();
  try {
    const chain = new HashChain(s.logPath);
    await chain.append({
      caseId: 'c1',
      manifestSha256: '1'.repeat(64),
      createdAt: '2026-01-01T00:00:00Z',
    });
    await chain.append({
      caseId: 'c2',
      manifestSha256: '2'.repeat(64),
      createdAt: '2026-01-02T00:00:00Z',
    });
    const lines = (await readFile(s.logPath, 'utf8')).split('\n').filter(Boolean);
    const first = JSON.parse(lines[0]!);
    first.manifestSha256 = '9'.repeat(64);
    lines[0] = JSON.stringify(first);
    await writeFile(s.logPath, lines.join('\n') + '\n', 'utf8');
    const v = await chain.verify();
    assert.equal(v.ok, false);
    if (!v.ok) {
      assert.equal(v.brokenAtIndex, 0);
      assert.match(v.reason, /chainHash mismatch/);
    }
  } finally {
    await s.cleanup();
  }
});

test('verify: detects out-of-order index', async () => {
  const s = await setup();
  try {
    const chain = new HashChain(s.logPath);
    await chain.append({
      caseId: 'c1',
      manifestSha256: '1'.repeat(64),
      createdAt: '2026-01-01T00:00:00Z',
    });
    const lines = (await readFile(s.logPath, 'utf8')).split('\n').filter(Boolean);
    const e = JSON.parse(lines[0]!);
    e.index = 5;
    lines[0] = JSON.stringify(e);
    await writeFile(s.logPath, lines.join('\n') + '\n', 'utf8');
    const v = await chain.verify();
    assert.equal(v.ok, false);
    if (!v.ok) assert.match(v.reason, /index out of order/);
  } finally {
    await s.cleanup();
  }
});

test('computeChainHash is deterministic', () => {
  const a = HashChain.computeChainHash({
    previousChainHash: 'a'.repeat(64),
    manifestSha256: 'b'.repeat(64),
    caseId: 'c',
    createdAt: '2026-01-01T00:00:00Z',
  });
  const b = HashChain.computeChainHash({
    previousChainHash: 'a'.repeat(64),
    manifestSha256: 'b'.repeat(64),
    caseId: 'c',
    createdAt: '2026-01-01T00:00:00Z',
  });
  assert.equal(a, b);
  assert.equal(a.length, 64);
});

test('empty chain verifies as ok with count=0', async () => {
  const s = await setup();
  try {
    const chain = new HashChain(s.logPath);
    const v = await chain.verify();
    assert.equal(v.ok, true);
    if (v.ok) assert.equal(v.count, 0);
  } finally {
    await s.cleanup();
  }
});
