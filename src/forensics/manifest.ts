import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type {
  EvidenceFile,
  EvidenceManifest,
  BrowserFingerprint,
  ChainEntry,
  Sha256Hex,
  AttestationRef,
} from '../types/forensics.js';
import { HashChain } from './hashChain.js';

export interface ManifestBuildInput {
  caseId: string;
  sourceUrl: string;
  canonicalUrl: string;
  collectedAt: string;
  collectorVersion: string;
  httpStatus?: number;
  contentType?: string;
  contentLength?: number;
  files: ReadonlyArray<EvidenceFile>;
  fingerprint?: BrowserFingerprint;
  analyzerVersion?: string;
  ruleVersionHash?: Sha256Hex;
  keywordsHash?: Sha256Hex;
  attestation?: AttestationRef;
}

/**
 * Build a tamper-evident manifest in three deterministic steps:
 *
 *   1. Serialize all fields except manifestSha256 and chain (canonical JSON, sorted keys).
 *   2. Append (caseId, pre-chain sha256, createdAt) to the hash chain → get ChainEntry.
 *   3. Compute manifestSha256 over the canonical JSON including chain (still excluding the
 *      self-signature field itself).
 *
 * Verification reproduces step 3 and recomputes file digests.
 */
export async function buildAndWriteManifest(
  input: ManifestBuildInput,
  options: { caseDir: string; chainLogPath: string; manifestFileName?: string }
): Promise<{ manifest: EvidenceManifest; manifestPath: string }> {
  const bodyWithoutChain = canonicalize({
    version: '2.0',
    caseId: input.caseId,
    sourceUrl: input.sourceUrl,
    canonicalUrl: input.canonicalUrl,
    collectedAt: input.collectedAt,
    collectorVersion: input.collectorVersion,
    httpStatus: input.httpStatus,
    contentType: input.contentType,
    contentLength: input.contentLength,
    files: input.files,
    fingerprint: input.fingerprint,
    analyzerVersion: input.analyzerVersion,
    ruleVersionHash: input.ruleVersionHash,
    keywordsHash: input.keywordsHash,
    attestation: input.attestation,
  });
  const preChainSha = createHash('sha256').update(bodyWithoutChain).digest('hex');

  const chain = new HashChain(options.chainLogPath);
  const entry = await chain.append({
    caseId: input.caseId,
    manifestSha256: preChainSha,
    createdAt: input.collectedAt,
  });
  const chainRef: ChainEntry = {
    index: entry.index,
    previousChainHash: entry.previousChainHash,
    chainHash: entry.chainHash,
  };

  const bodyWithChain = canonicalize({
    version: '2.0',
    caseId: input.caseId,
    sourceUrl: input.sourceUrl,
    canonicalUrl: input.canonicalUrl,
    collectedAt: input.collectedAt,
    collectorVersion: input.collectorVersion,
    httpStatus: input.httpStatus,
    contentType: input.contentType,
    contentLength: input.contentLength,
    files: input.files,
    fingerprint: input.fingerprint,
    analyzerVersion: input.analyzerVersion,
    ruleVersionHash: input.ruleVersionHash,
    keywordsHash: input.keywordsHash,
    attestation: input.attestation,
    chain: chainRef,
  });
  const manifestSha256 = createHash('sha256').update(bodyWithChain).digest('hex');

  const finalManifest: EvidenceManifest = {
    version: '2.0',
    caseId: input.caseId,
    sourceUrl: input.sourceUrl,
    canonicalUrl: input.canonicalUrl,
    collectedAt: input.collectedAt,
    collectorVersion: input.collectorVersion,
    httpStatus: input.httpStatus,
    contentType: input.contentType,
    contentLength: input.contentLength,
    files: input.files,
    fingerprint: input.fingerprint,
    analyzerVersion: input.analyzerVersion,
    ruleVersionHash: input.ruleVersionHash,
    keywordsHash: input.keywordsHash,
    attestation: input.attestation,
    chain: chainRef,
    manifestSha256,
  };

  await fs.mkdir(options.caseDir, { recursive: true });
  const manifestPath = path.join(options.caseDir, options.manifestFileName ?? 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(finalManifest, null, 2), 'utf8');
  return { manifest: finalManifest, manifestPath };
}

export type ManifestVerifyResult =
  | { ok: true; manifest: EvidenceManifest }
  | { ok: false; reason: string; manifest?: EvidenceManifest };

export async function verifyManifest(
  manifestPath: string,
  options: { verifyFiles?: boolean } = { verifyFiles: true }
): Promise<ManifestVerifyResult> {
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, 'utf8');
  } catch (err) {
    return { ok: false, reason: `manifest not readable: ${(err as Error).message}` };
  }
  let manifest: EvidenceManifest;
  try {
    manifest = JSON.parse(raw) as EvidenceManifest;
  } catch (err) {
    return { ok: false, reason: `manifest not valid JSON: ${(err as Error).message}` };
  }
  if (manifest.version !== '2.0') {
    return { ok: false, reason: `unknown manifest version: ${manifest.version}`, manifest };
  }
  const { manifestSha256, ...rest } = manifest;
  const recomputed = createHash('sha256').update(canonicalize(rest)).digest('hex');
  if (recomputed !== manifestSha256) {
    return {
      ok: false,
      reason: `manifestSha256 mismatch (expected ${recomputed}, found ${manifestSha256})`,
      manifest,
    };
  }
  if (options.verifyFiles) {
    const dir = path.dirname(manifestPath);
    for (const f of manifest.files) {
      const filePath = path.join(dir, f.relativePath);
      let buf: Buffer;
      try {
        buf = await fs.readFile(filePath);
      } catch (err) {
        return {
          ok: false,
          reason: `file not readable: ${f.relativePath} (${(err as Error).message})`,
          manifest,
        };
      }
      const sha = createHash('sha256').update(buf).digest('hex');
      if (sha !== f.sha256) {
        return {
          ok: false,
          reason: `file sha256 mismatch: ${f.relativePath} (expected ${f.sha256}, got ${sha})`,
          manifest,
        };
      }
      if (buf.length !== f.bytes) {
        return {
          ok: false,
          reason: `file size mismatch: ${f.relativePath} (expected ${f.bytes}, got ${buf.length})`,
          manifest,
        };
      }
    }
  }
  return { ok: true, manifest };
}

/**
 * Canonical JSON serialization:
 *   - Object keys sorted lexicographically (recursive).
 *   - undefined values dropped.
 *   - No whitespace.
 *   - Arrays preserve order.
 *
 * This guarantees the same input → same string → same hash, regardless of
 * object key insertion order.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(v: unknown): unknown {
  if (v === null) return null;
  if (Array.isArray(v)) return v.map(sortValue);
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const val = obj[key];
      if (val === undefined) continue;
      out[key] = sortValue(val);
    }
    return out;
  }
  return v;
}

/** Build an EvidenceFile entry from a real on-disk file. */
export async function fileEntry(input: {
  caseDir: string;
  relativePath: string;
  mime: string;
  tool: EvidenceFile['tool'];
  createdAt?: string;
}): Promise<EvidenceFile> {
  const full = path.join(input.caseDir, input.relativePath);
  const buf = await fs.readFile(full);
  const sha = createHash('sha256').update(buf).digest('hex');
  const stat = await fs.stat(full);
  return {
    name: path.basename(input.relativePath),
    relativePath: input.relativePath,
    bytes: stat.size,
    sha256: sha,
    mime: input.mime,
    createdAt: input.createdAt ?? stat.birthtime.toISOString(),
    tool: input.tool,
  };
}
