/**
 * Forensic evidence types — append-only, tamper-evident.
 *
 * Design notes:
 *  - All hashes are SHA-256 hex (lowercase, 64 chars).
 *  - All times are ISO 8601 strings (UTC, "Z" suffix preferred).
 *  - Optional fields are omitted (undefined dropped) in canonical JSON.
 */

export type Sha256Hex = string;

export interface EvidenceFile {
  readonly name: string;
  readonly relativePath: string; // relative to caseDir
  readonly bytes: number;
  readonly sha256: Sha256Hex;
  readonly mime: string;
  readonly createdAt: string;
  readonly tool:
    | 'playwright'
    | 'cheerio'
    | 'manual'
    | 'warc-writer'
    | 'http-collector'
    | 'pdf-generator';
}

export interface BrowserFingerprint {
  readonly userAgent: string;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly locale: string;
  readonly timeZone: string;
  readonly platform?: string;
  readonly playwrightVersion?: string;
  readonly collectedAtMs: number; // ms since epoch
}

export interface AttestationRef {
  readonly attestationFile: string;
  readonly attestationSha256: Sha256Hex;
}

export interface ChainEntry {
  readonly index: number;
  readonly previousChainHash: Sha256Hex;
  readonly chainHash: Sha256Hex;
}

export interface EvidenceManifest {
  readonly version: '2.0';
  readonly caseId: string;
  readonly sourceUrl: string;
  readonly canonicalUrl: string;
  readonly collectedAt: string;
  readonly collectorVersion: string;
  readonly httpStatus?: number;
  readonly contentType?: string;
  readonly contentLength?: number;
  readonly files: ReadonlyArray<EvidenceFile>;
  readonly fingerprint?: BrowserFingerprint;
  readonly analyzerVersion?: string;
  readonly ruleVersionHash?: Sha256Hex;
  readonly keywordsHash?: Sha256Hex;
  readonly attestation?: AttestationRef;
  readonly chain: ChainEntry;
  /** Self-signature: sha256 of canonical JSON of the manifest with manifestSha256 omitted. */
  readonly manifestSha256: Sha256Hex;
}

export interface CollectorAttestation {
  readonly version: '1.0';
  readonly caseId: string;
  readonly reviewerId: string;
  readonly statement: string;
  readonly observedAt: string;
  readonly checks: ReadonlyArray<{
    readonly question: string;
    readonly answer: 'yes' | 'no' | 'na';
    readonly note?: string;
  }>;
}

export interface OtsReceipt {
  readonly file: string;
  readonly targetSha256: Sha256Hex;
  readonly status: 'pending' | 'confirmed';
  readonly anchoredAt?: string;
  readonly btcBlockHeight?: number;
  readonly btcBlockTime?: string;
  readonly lastCheckedAt: string;
}

export const GENESIS_HASH: Sha256Hex = '0'.repeat(64);
