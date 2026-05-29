import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { OtsReceipt, Sha256Hex } from '../types/forensics';

/**
 * OpenTimestamps wrapper.
 *
 * Anchors a SHA-256 hash to the Bitcoin blockchain via free public calendars,
 * giving you a cryptographic "this file existed by time T" proof that you can
 * verify independently months/years later.
 *
 * Requires the peer dep `javascript-opentimestamps` to be installed:
 *   npm i javascript-opentimestamps
 *
 * Workflow:
 *   1. stampFile()  → writes <target>.ots, returns receipt with status='pending'
 *   2. ~24-48 hrs later, verifyOts() → status flips to 'confirmed' with block height
 *
 * Notes:
 *   - The .ots file is the proof and should be stored next to manifest.json.
 *   - You can verify against the public calendars at any time without
 *     trusting our infrastructure.
 */

type OtsLib = {
  DetachedTimestampFile: {
    fromBytes(op: unknown, data: Buffer): unknown;
    deserialize(buf: Buffer): unknown;
  };
  Ops: { OpSHA256: new () => unknown };
  stamp(detached: unknown): Promise<void>;
  verify(otsDetached: unknown, fileDetached: unknown): Promise<unknown>;
  upgrade(otsDetached: unknown): Promise<boolean>;
};

let _ots: OtsLib | null = null;

async function loadOts(): Promise<OtsLib> {
  if (_ots) return _ots;
  try {
    // dynamic import keeps this module loadable even when the peer dep is missing
    const lib = (await import('javascript-opentimestamps' as string)) as
      | OtsLib
      | { default: OtsLib };
    _ots = ('default' in lib ? lib.default : lib) as OtsLib;
    return _ots;
  } catch (err) {
    throw new Error(
      `OpenTimestamps unavailable. Install peer dep: npm i javascript-opentimestamps (${(err as Error).message})`
    );
  }
}

export async function stampFile(input: {
  targetFile: string;
  outDir?: string;
}): Promise<OtsReceipt> {
  const ots = await loadOts();
  const data = await fs.readFile(input.targetFile);
  const detached = ots.DetachedTimestampFile.fromBytes(new ots.Ops.OpSHA256(), data);
  await ots.stamp(detached);
  const outPath = path.join(
    input.outDir ?? path.dirname(input.targetFile),
    path.basename(input.targetFile) + '.ots'
  );
  await fs.writeFile(outPath, serializeDetached(detached));
  return {
    file: outPath,
    targetSha256: sha256Of(data),
    status: 'pending',
    lastCheckedAt: new Date().toISOString(),
  };
}

export async function verifyOts(input: {
  targetFile: string;
  otsFile: string;
}): Promise<OtsReceipt> {
  const ots = await loadOts();
  const data = await fs.readFile(input.targetFile);
  const otsBytes = await fs.readFile(input.otsFile);
  const fileDetached = ots.DetachedTimestampFile.fromBytes(new ots.Ops.OpSHA256(), data);
  const otsDetached = ots.DetachedTimestampFile.deserialize(otsBytes);

  // poll calendars for upgrade (turns a pending proof into a block-confirmed one)
  try {
    const upgraded = await ots.upgrade(otsDetached);
    if (upgraded) await fs.writeFile(input.otsFile, serializeDetached(otsDetached));
  } catch {
    // upgrade can throw while pending — that's expected
  }

  let result: unknown;
  try {
    result = await ots.verify(otsDetached, fileDetached);
  } catch {
    return {
      file: input.otsFile,
      targetSha256: sha256Of(data),
      status: 'pending',
      lastCheckedAt: new Date().toISOString(),
    };
  }

  const conf = pickConfirmation(result);
  return {
    file: input.otsFile,
    targetSha256: sha256Of(data),
    status: conf ? 'confirmed' : 'pending',
    anchoredAt: conf ? new Date(conf.timestamp * 1000).toISOString() : undefined,
    btcBlockHeight: conf?.height,
    btcBlockTime: conf ? new Date(conf.timestamp * 1000).toISOString() : undefined,
    lastCheckedAt: new Date().toISOString(),
  };
}

function pickConfirmation(
  result: unknown
): { timestamp: number; height: number } | null {
  if (!result || typeof result !== 'object') return null;
  for (const v of Object.values(result as Record<string, unknown>)) {
    if (
      v &&
      typeof v === 'object' &&
      'timestamp' in (v as Record<string, unknown>) &&
      'height' in (v as Record<string, unknown>)
    ) {
      const o = v as Record<string, unknown>;
      return { timestamp: Number(o['timestamp']), height: Number(o['height']) };
    }
  }
  return null;
}

function serializeDetached(detached: unknown): Buffer {
  const d = detached as { serializeToBytes?: () => Uint8Array; serialize?: () => Uint8Array };
  if (typeof d.serializeToBytes === 'function') return Buffer.from(d.serializeToBytes());
  if (typeof d.serialize === 'function') return Buffer.from(d.serialize());
  throw new Error('cannot serialize detached timestamp');
}

function sha256Of(buf: Buffer): Sha256Hex {
  return createHash('sha256').update(buf).digest('hex');
}
