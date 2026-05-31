import { randomUUID, createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Sha256Hex } from '../types/forensics.js';

/**
 * Minimal WARC 1.1 writer.
 *
 * Spec: https://iipc.github.io/warc-specifications/specifications/warc-format/warc-1.1/
 *
 * Record format (each):
 *   "WARC/1.1\r\n" headers "\r\n\r\n" content "\r\n\r\n"
 *
 * We write all records uncompressed in-memory then optionally gzip the whole file.
 * Per-record gzip is also valid per spec; whole-file gzip is the simpler archival variant
 * and both warcio/jwarc read it fine.
 */
export class WarcWriter {
  private chunks: Buffer[] = [];
  private byteLength = 0;
  private readonly streamHasher = createHash('sha256');

  constructor(
    private readonly outputPath: string,
    private readonly options: {
      collectorVersion: string;
      operator?: string;
      gzip?: boolean;
    } = { collectorVersion: 'gongik-radar/2.0' }
  ) {}

  writeWarcinfo(extraFields: Record<string, string> = {}): void {
    const fields: Record<string, string> = {
      software: this.options.collectorVersion,
      format: 'WARC File Format 1.1',
      conformsTo:
        'http://iipc.github.io/warc-specifications/specifications/warc-format/warc-1.1/',
      robots: 'classic',
      ...extraFields,
    };
    const body = Object.entries(fields)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n');
    this.writeRecord('warcinfo', Buffer.from(body, 'utf8'), 'application/warc-fields');
  }

  writeResponse(input: {
    targetUri: string;
    httpStatusLine: string;
    httpHeaders: string;
    body: Buffer;
    capturedAt: Date;
  }): void {
    const httpBlock = Buffer.concat([
      Buffer.from(input.httpStatusLine + '\r\n', 'utf8'),
      Buffer.from(input.httpHeaders + '\r\n\r\n', 'utf8'),
      input.body,
    ]);
    const payloadDigest = sha256OfBuffer(input.body);
    const blockDigest = sha256OfBuffer(httpBlock);
    this.writeRecord(
      'response',
      httpBlock,
      'application/http;msgtype=response',
      {
        'WARC-Target-URI': input.targetUri,
        'WARC-Date': input.capturedAt.toISOString(),
        'WARC-Payload-Digest': `sha256:${payloadDigest}`,
        'WARC-Block-Digest': `sha256:${blockDigest}`,
      }
    );
  }

  writeMetadata(input: {
    targetUri: string;
    metadata: Record<string, string>;
    capturedAt: Date;
  }): void {
    const body = Object.entries(input.metadata)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n');
    this.writeRecord('metadata', Buffer.from(body, 'utf8'), 'application/warc-fields', {
      'WARC-Target-URI': input.targetUri,
      'WARC-Date': input.capturedAt.toISOString(),
    });
  }

  /**
   * Resource record — for artifacts NOT obtained over HTTP
   * (screenshots, generated PDFs, DOM JSON snapshots, etc.)
   * Use urn:local:<filename> as targetUri for synthesized artifacts.
   */
  writeResource(input: {
    targetUri: string;
    contentType: string;
    body: Buffer;
    capturedAt: Date;
  }): void {
    const blockDigest = sha256OfBuffer(input.body);
    this.writeRecord('resource', input.body, input.contentType, {
      'WARC-Target-URI': input.targetUri,
      'WARC-Date': input.capturedAt.toISOString(),
      'WARC-Block-Digest': `sha256:${blockDigest}`,
    });
  }

  private writeRecord(
    type: string,
    body: Buffer,
    contentType: string,
    extra: Record<string, string> = {}
  ): void {
    const headers: Record<string, string> = {
      'WARC-Type': type,
      'WARC-Record-ID': `<urn:uuid:${randomUUID()}>`,
      'WARC-Date': new Date().toISOString(),
      'Content-Length': String(body.length),
      'Content-Type': contentType,
      ...extra,
    };
    const headerStr =
      'WARC/1.1\r\n' +
      Object.entries(headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n') +
      '\r\n\r\n';
    const headerBuf = Buffer.from(headerStr, 'utf8');
    const trailer = Buffer.from('\r\n\r\n', 'utf8');
    for (const buf of [headerBuf, body, trailer]) {
      this.chunks.push(buf);
      this.byteLength += buf.length;
      this.streamHasher.update(buf);
    }
  }

  async close(): Promise<{
    bytes: number;
    sha256: Sha256Hex;
    path: string;
  }> {
    await fs.mkdir(path.dirname(this.outputPath), { recursive: true });
    if (this.options.gzip) {
      const finalPath = this.outputPath.endsWith('.gz')
        ? this.outputPath
        : this.outputPath + '.gz';
      await new Promise<void>((resolve, reject) => {
        const gz = createGzip();
        const ws = createWriteStream(finalPath);
        gz.pipe(ws).on('finish', () => resolve()).on('error', reject);
        gz.on('error', reject);
        for (const c of this.chunks) gz.write(c);
        gz.end();
      });
      const data = await fs.readFile(finalPath);
      const sha = createHash('sha256').update(data).digest('hex');
      return { bytes: data.length, sha256: sha, path: finalPath };
    }
    await fs.writeFile(this.outputPath, Buffer.concat(this.chunks));
    return {
      bytes: this.byteLength,
      sha256: this.streamHasher.digest('hex'),
      path: this.outputPath,
    };
  }
}

function sha256OfBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}
