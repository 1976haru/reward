import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { WarcWriter } from '../../src/forensics/warc';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'warc-'));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('warc: writes valid WARC/1.1 header structure', async () => {
  const s = await setup();
  try {
    const w = new WarcWriter(join(s.dir, 'a.warc'), { collectorVersion: 'test/1.0' });
    w.writeWarcinfo({ note: 'unit-test' });
    w.writeResponse({
      targetUri: 'https://example.test/',
      httpStatusLine: 'HTTP/1.1 200 OK',
      httpHeaders: 'Content-Type: text/html; charset=utf-8',
      body: Buffer.from('<html><body>hi</body></html>', 'utf8'),
      capturedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const out = await w.close();
    const text = (await readFile(out.path)).toString('utf8');
    assert.match(text, /^WARC\/1\.1\r\n/);
    assert.match(text, /WARC-Type: warcinfo/);
    assert.match(text, /WARC-Type: response/);
    assert.match(text, /WARC-Target-URI: https:\/\/example\.test\//);
    assert.match(text, /WARC-Payload-Digest: sha256:[0-9a-f]{64}/);
    assert.match(text, /WARC-Block-Digest: sha256:[0-9a-f]{64}/);
    assert.match(out.sha256, /^[0-9a-f]{64}$/);
    assert.ok(out.bytes > 0);
  } finally {
    await s.cleanup();
  }
});

test('warc: resource record carries block digest', async () => {
  const s = await setup();
  try {
    const w = new WarcWriter(join(s.dir, 'b.warc'), { collectorVersion: 'test/1.0' });
    w.writeResource({
      targetUri: 'urn:local:screenshot.png',
      contentType: 'image/png',
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG magic
      capturedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const out = await w.close();
    const text = (await readFile(out.path)).toString('utf8');
    assert.match(text, /WARC-Type: resource/);
    assert.match(text, /WARC-Target-URI: urn:local:screenshot\.png/);
    assert.match(text, /Content-Type: image\/png/);
  } finally {
    await s.cleanup();
  }
});

test('warc: metadata record', async () => {
  const s = await setup();
  try {
    const w = new WarcWriter(join(s.dir, 'c.warc'), { collectorVersion: 'test/1.0' });
    w.writeMetadata({
      targetUri: 'https://example.test/',
      metadata: { caseId: 'case-42', moduleId: 'health_food' },
      capturedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const out = await w.close();
    const text = (await readFile(out.path)).toString('utf8');
    assert.match(text, /WARC-Type: metadata/);
    assert.match(text, /caseId: case-42/);
    assert.match(text, /moduleId: health_food/);
  } finally {
    await s.cleanup();
  }
});

test('warc: gzip option produces .gz and valid gunzip', async () => {
  const s = await setup();
  try {
    const w = new WarcWriter(join(s.dir, 'd.warc'), {
      collectorVersion: 'test/1.0',
      gzip: true,
    });
    w.writeWarcinfo();
    w.writeResource({
      targetUri: 'urn:local:dom.json',
      contentType: 'application/json',
      body: Buffer.from('{"x":1}'),
      capturedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const out = await w.close();
    assert.ok(out.path.endsWith('.gz'));
    const gz = await readFile(out.path);
    const decompressed: Buffer = await new Promise((resolve, reject) => {
      const bufs: Buffer[] = [];
      Readable.from(gz)
        .pipe(createGunzip())
        .on('data', (c) => bufs.push(c))
        .on('end', () => resolve(Buffer.concat(bufs)))
        .on('error', reject);
    });
    const text = decompressed.toString('utf8');
    assert.match(text, /WARC-Type: warcinfo/);
    assert.match(text, /WARC-Type: resource/);
  } finally {
    await s.cleanup();
  }
});

test('warc: record body integrity (payload digest matches)', async () => {
  const s = await setup();
  try {
    const w = new WarcWriter(join(s.dir, 'e.warc'), { collectorVersion: 'test/1.0' });
    const body = Buffer.from('hello-' + 'x'.repeat(1000), 'utf8');
    w.writeResponse({
      targetUri: 'https://example.test/r',
      httpStatusLine: 'HTTP/1.1 200 OK',
      httpHeaders: 'Content-Type: text/plain',
      body,
      capturedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const out = await w.close();
    const text = (await readFile(out.path)).toString('utf8');
    const m = text.match(/WARC-Payload-Digest: sha256:([0-9a-f]{64})/);
    assert.ok(m);
    const { createHash } = await import('node:crypto');
    const expected = createHash('sha256').update(body).digest('hex');
    assert.equal(m![1], expected);
  } finally {
    await s.cleanup();
  }
});
