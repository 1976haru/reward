#!/usr/bin/env node
/**
 * Hash chain integrity verifier.
 *
 *   $ npm run forensics:chain:verify
 *
 * Reads the append-only chain log (default: data/audit/chain.jsonl)
 * and recomputes every link. Exits 0 on success, 2 on broken chain.
 */
import { HashChain } from '../src/forensics/hashChain';

async function main(): Promise<void> {
  const logPath = process.env['CHAIN_LOG_PATH'] ?? 'data/audit/chain.jsonl';
  const chain = new HashChain(logPath);
  const res = await chain.verify();
  if (res.ok) {
    console.log(`[forensics] chain OK — ${res.count} entries verified (${logPath})`);
    process.exit(0);
  } else {
    console.error(`[forensics] CHAIN BROKEN at index ${res.brokenAtIndex}`);
    console.error(`  reason:   ${res.reason}`);
    console.error(`  expected: ${res.expected}`);
    console.error(`  actual:   ${res.actual}`);
    console.error(`  log:      ${logPath}`);
    process.exit(2);
  }
}

main().catch((err: unknown) => {
  console.error('[forensics] error:', err);
  process.exit(1);
});
