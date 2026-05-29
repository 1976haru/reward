#!/usr/bin/env node
/**
 * Walk data/evidence/{caseId}/ and verify each manifest.json.ots.
 *
 *   $ npm run forensics:ots:verify
 *
 * For each case: prints "confirmed @ block N" or "pending".
 * On first run, every case will be pending; check back in 24-48h.
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { verifyOts } from '../src/forensics/openTimestamps';

async function main(): Promise<void> {
  const root = process.env['EVIDENCE_ROOT'] ?? 'data/evidence';
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (err) {
    console.error(`[ots] cannot read ${root}: ${(err as Error).message}`);
    process.exit(2);
  }

  let pending = 0;
  let confirmed = 0;
  let noOts = 0;

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const caseDir = path.join(root, ent.name);
    const manifest = path.join(caseDir, 'manifest.json');
    const ots = path.join(caseDir, 'manifest.json.ots');
    try {
      await fs.access(manifest);
      await fs.access(ots);
    } catch {
      noOts++;
      console.log(`  - ${ent.name}: no .ots receipt yet`);
      continue;
    }
    try {
      const r = await verifyOts({ targetFile: manifest, otsFile: ots });
      if (r.status === 'confirmed') {
        confirmed++;
        console.log(
          `  ✓ ${ent.name}: confirmed @ block ${r.btcBlockHeight} (${r.btcBlockTime})`
        );
      } else {
        pending++;
        console.log(`  … ${ent.name}: pending (last check ${r.lastCheckedAt})`);
      }
    } catch (err) {
      console.error(`  ✗ ${ent.name}: ${(err as Error).message}`);
    }
  }

  console.log(
    `\n[ots] summary: confirmed=${confirmed} pending=${pending} no_ots=${noOts}`
  );
}

main().catch((err: unknown) => {
  console.error('[ots] error:', err);
  process.exit(1);
});
