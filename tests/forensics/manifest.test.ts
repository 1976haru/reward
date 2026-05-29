import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildAndWriteManifest,
  verifyManifest,
  fileEntry,
  canonicalize,
} from '../../src/forensics/manifest';

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'manifest-'));
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('canonicalize: sorts keys and drops undefined', () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), canonicalize({ a: 2, b: 1 }));
  assert.equal(canonicalize({ a: 1, b: undefined, c: 2 }), '{"a":1,"c":2}');
});

test('canonicalize: nested objects sorted recursively', () => {
  const a = canonicalize({ z: { c: 1, b: 2 }, a: [{ y: 1, x: 2 }] });
  const b = canonicalize({ a: [{ x: 2, y: 1 }], z: { b: 2, c: 1 } });
  assert.equal(a, b);
});

test('build + verify roundtrip on real files', async () => {
  const s = await setup();
  try {
    const caseDir = join(s.root, 'case-1');
    await mkdir(caseDir, { recursive: true });
    await writeFile(join(caseDir, 'page.html'), '<html>hello</html>');
    await writeFile(join(caseDir, 'screenshot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const files = [
      await fileEntry({ caseDir, relativePath: 'page.html', mime: 'text/html', tool: 'cheerio' }),
      await fileEntry({
        caseDir,
        relativePath: 'screenshot.png',
        mime: 'image/png',
        tool: 'playwright',
      }),
    ];
    const out = await buildAndWriteManifest(
      {
        caseId: 'case-1',
        sourceUrl: 'https://example.test/x',
        canonicalUrl: 'https://example.test/x',
        collectedAt: '2026-01-01T00:00:00Z',
        collectorVersion: 'test/1.0',
        files,
      },
      { caseDir, chainLogPath: join(s.root, 'chain.jsonl') }
    );
    assert.equal(out.manifest.manifestSha256.length, 64);
    assert.equal(out.manifest.chain.index, 0);

    const v = await verifyManifest(out.manifestPath);
    assert.equal(v.ok, true);
    if (v.ok) {
      assert.equal(v.manifest.caseId, 'case-1');
      assert.equal(v.manifest.files.length, 2);
    }
  } finally {
    await s.cleanup();
  }
});

test('tampering with evidence file is detected', async () => {
  const s = await setup();
  try {
    const caseDir = join(s.root, 'case-2');
    await mkdir(caseDir, { recursive: true });
    await writeFile(join(caseDir, 'page.html'), '<html>v1</html>');
    const entry = await fileEntry({
      caseDir,
      relativePath: 'page.html',
      mime: 'text/html',
      tool: 'cheerio',
    });
    const out = await buildAndWriteManifest(
      {
        caseId: 'case-2',
        sourceUrl: 'https://example.test/y',
        canonicalUrl: 'https://example.test/y',
        collectedAt: '2026-01-01T00:00:00Z',
        collectorVersion: 'test/1.0',
        files: [entry],
      },
      { caseDir, chainLogPath: join(s.root, 'chain.jsonl') }
    );
    await writeFile(join(caseDir, 'page.html'), '<html>v2-tampered</html>');
    const v = await verifyManifest(out.manifestPath);
    assert.equal(v.ok, false);
    if (!v.ok) assert.match(v.reason, /sha256 mismatch/);
  } finally {
    await s.cleanup();
  }
});

test('tampering with manifest itself is detected', async () => {
  const s = await setup();
  try {
    const caseDir = join(s.root, 'case-3');
    await mkdir(caseDir, { recursive: true });
    await writeFile(join(caseDir, 'a.txt'), 'a');
    const entry = await fileEntry({
      caseDir,
      relativePath: 'a.txt',
      mime: 'text/plain',
      tool: 'manual',
    });
    const out = await buildAndWriteManifest(
      {
        caseId: 'case-3',
        sourceUrl: 'https://example.test/z',
        canonicalUrl: 'https://example.test/z',
        collectedAt: '2026-01-01T00:00:00Z',
        collectorVersion: 'test/1.0',
        files: [entry],
      },
      { caseDir, chainLogPath: join(s.root, 'chain.jsonl') }
    );

    const { readFile } = await import('node:fs/promises');
    const raw = JSON.parse(await readFile(out.manifestPath, 'utf8'));
    raw.caseId = 'case-3-tampered'; // mutate
    await writeFile(out.manifestPath, JSON.stringify(raw, null, 2));

    const v = await verifyManifest(out.manifestPath);
    assert.equal(v.ok, false);
    if (!v.ok) assert.match(v.reason, /manifestSha256 mismatch/);
  } finally {
    await s.cleanup();
  }
});

test('two manifests in same chain link correctly', async () => {
  const s = await setup();
  try {
    const chainLog = join(s.root, 'chain.jsonl');
    for (let i = 0; i < 3; i++) {
      const caseDir = join(s.root, `case-${i}`);
      await mkdir(caseDir, { recursive: true });
      await writeFile(join(caseDir, 'f.txt'), `case-${i}`);
      const entry = await fileEntry({
        caseDir,
        relativePath: 'f.txt',
        mime: 'text/plain',
        tool: 'manual',
      });
      const out = await buildAndWriteManifest(
        {
          caseId: `case-${i}`,
          sourceUrl: `https://example.test/${i}`,
          canonicalUrl: `https://example.test/${i}`,
          collectedAt: `2026-01-0${i + 1}T00:00:00Z`,
          collectorVersion: 'test/1.0',
          files: [entry],
        },
        { caseDir, chainLogPath: chainLog }
      );
      assert.equal(out.manifest.chain.index, i);
    }
  } finally {
    await s.cleanup();
  }
});
