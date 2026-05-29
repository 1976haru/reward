#!/usr/bin/env node
/**
 * Bundle a case's evidence dir into submission-bundle.zip + .sha256.
 *
 *   $ npm run forensics:bundle -- <caseId>
 *
 * Output: data/evidence/{caseId}/submission-bundle.zip
 *         data/evidence/{caseId}/submission-bundle.zip.sha256
 *
 * Requires archiver: npm i -D archiver @types/archiver
 */
import { promises as fs, createWriteStream } from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

interface Archiver {
  pipe(stream: NodeJS.WritableStream): unknown;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  directory(dirpath: string, destpath: string | false): unknown;
  glob(pattern: string, options: { cwd: string; ignore?: string[] }): unknown;
  finalize(): Promise<void>;
}

async function main(): Promise<void> {
  const caseId = process.argv[2];
  if (!caseId) {
    console.error('usage: npm run forensics:bundle -- <caseId>');
    process.exit(2);
  }
  const root = process.env['EVIDENCE_ROOT'] ?? 'data/evidence';
  const caseDir = path.join(root, caseId);
  try {
    await fs.access(caseDir);
  } catch {
    console.error(`case dir not found: ${caseDir}`);
    process.exit(2);
  }
  const zipPath = path.join(caseDir, 'submission-bundle.zip');

  let archiverFactory: (format: 'zip', opts?: unknown) => Archiver;
  try {
    const mod = (await import('archiver' as string)) as
      | { default?: typeof archiverFactory }
      | typeof archiverFactory;
    archiverFactory = (typeof mod === 'function'
      ? mod
      : (mod as { default?: typeof archiverFactory }).default) as typeof archiverFactory;
    if (!archiverFactory) throw new Error('archiver export shape unrecognized');
  } catch (err) {
    console.error(
      `archiver package not installed: npm i -D archiver @types/archiver (${(err as Error).message})`
    );
    process.exit(3);
  }

  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(zipPath);
    const arc = archiverFactory('zip', { zlib: { level: 9 } });
    out.on('close', () => resolve());
    arc.on('error', (err: unknown) => reject(err));
    arc.pipe(out);
    arc.glob('**/*', {
      cwd: caseDir,
      ignore: ['submission-bundle.zip', 'submission-bundle.zip.sha256'],
    });
    void arc.finalize();
  });

  const buf = await fs.readFile(zipPath);
  const sha = createHash('sha256').update(buf).digest('hex');
  await fs.writeFile(zipPath + '.sha256', `${sha}  ${path.basename(zipPath)}\n`);
  console.log(`bundle: ${zipPath}`);
  console.log(`bytes:  ${buf.length}`);
  console.log(`sha256: ${sha}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
