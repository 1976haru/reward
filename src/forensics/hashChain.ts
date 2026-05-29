import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Sha256Hex } from '../types/forensics';
import { GENESIS_HASH } from '../types/forensics';

export interface ChainLogEntry {
  readonly index: number;
  readonly previousChainHash: Sha256Hex;
  readonly chainHash: Sha256Hex;
  readonly caseId: string;
  readonly manifestSha256: Sha256Hex;
  readonly createdAt: string;
}

export type VerifyResult =
  | { ok: true; count: number }
  | {
      ok: false;
      brokenAtIndex: number;
      reason: string;
      expected: string;
      actual: string;
    };

/**
 * Append-only SHA-256 chain over manifest hashes.
 * One entry per case. Storage = JSONL (one JSON object per line).
 *
 * chainHash(n) = sha256( chainHash(n-1) | "|" | manifestSha256 | "|" | caseId | "|" | createdAt )
 * chainHash(0) uses GENESIS_HASH as the previous.
 */
export class HashChain {
  constructor(private readonly logPath: string) {}

  static computeChainHash(input: {
    previousChainHash: Sha256Hex;
    manifestSha256: Sha256Hex;
    caseId: string;
    createdAt: string;
  }): Sha256Hex {
    const h = createHash('sha256');
    h.update(input.previousChainHash);
    h.update('|');
    h.update(input.manifestSha256);
    h.update('|');
    h.update(input.caseId);
    h.update('|');
    h.update(input.createdAt);
    return h.digest('hex');
  }

  async append(input: {
    caseId: string;
    manifestSha256: Sha256Hex;
    createdAt: string;
  }): Promise<ChainLogEntry> {
    await fs.mkdir(path.dirname(this.logPath), { recursive: true });
    const last = await this.tail();
    const previousChainHash = last?.chainHash ?? GENESIS_HASH;
    const index = last ? last.index + 1 : 0;
    const chainHash = HashChain.computeChainHash({
      previousChainHash,
      manifestSha256: input.manifestSha256,
      caseId: input.caseId,
      createdAt: input.createdAt,
    });
    const entry: ChainLogEntry = {
      index,
      previousChainHash,
      chainHash,
      caseId: input.caseId,
      manifestSha256: input.manifestSha256,
      createdAt: input.createdAt,
    };
    await fs.appendFile(this.logPath, JSON.stringify(entry) + '\n', 'utf8');
    return entry;
  }

  async tail(): Promise<ChainLogEntry | null> {
    const content = await this.readSafe();
    if (content === null) return null;
    const lines = content.trimEnd().split('\n').filter(Boolean);
    if (lines.length === 0) return null;
    return JSON.parse(lines[lines.length - 1]!) as ChainLogEntry;
  }

  async *iterate(): AsyncGenerator<ChainLogEntry> {
    const content = await this.readSafe();
    if (content === null) return;
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      yield JSON.parse(t) as ChainLogEntry;
    }
  }

  async verify(): Promise<VerifyResult> {
    let count = 0;
    let prev: Sha256Hex = GENESIS_HASH;
    for await (const entry of this.iterate()) {
      if (entry.index !== count) {
        return {
          ok: false,
          brokenAtIndex: entry.index,
          reason: 'index out of order',
          expected: String(count),
          actual: String(entry.index),
        };
      }
      if (entry.previousChainHash !== prev) {
        return {
          ok: false,
          brokenAtIndex: entry.index,
          reason: 'previousChainHash mismatch',
          expected: prev,
          actual: entry.previousChainHash,
        };
      }
      const recomputed = HashChain.computeChainHash({
        previousChainHash: entry.previousChainHash,
        manifestSha256: entry.manifestSha256,
        caseId: entry.caseId,
        createdAt: entry.createdAt,
      });
      if (recomputed !== entry.chainHash) {
        return {
          ok: false,
          brokenAtIndex: entry.index,
          reason: 'chainHash mismatch',
          expected: recomputed,
          actual: entry.chainHash,
        };
      }
      prev = entry.chainHash;
      count++;
    }
    return { ok: true, count };
  }

  private async readSafe(): Promise<string | null> {
    try {
      return await fs.readFile(this.logPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }
}
