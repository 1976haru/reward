// RetentionPolicy (체크리스트 28)
//
// 카테고리별 보존 기간을 정의하고 만료 파일을 식별한다.
// 실제 삭제는 별도 명시적 요청(`dryRun: false`) 으로만 수행한다 (기본은 dryRun).
// 본 도구는 자동 영구 삭제를 수행하지 않는다.

import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { config } from "../../utils/config.js";
import {
  PRIVACY_SAFETY_NOTICE,
  type ExpiredFile,
  type RetentionCategory,
  type RetentionPolicy,
  type RetentionReport
} from "../../types/privacy.js";

const EXCLUDED_FILE_NAMES = new Set([".gitkeep", "latest.json"]);

export function getRetentionPolicies(): RetentionPolicy[] {
  const r = config.privacy.retentionDays;
  const base = config.dataDir;
  return [
    { category: "trace", days: r.trace, dir: path.join(base, "traces"), description: "Trace JSONL 로그 — 감사·디버깅용. 짧게 유지." },
    { category: "evidence", days: r.evidence, dir: path.join(base, "evidence"), description: "Evidence Package (원본 캡처/PDF/HTML/metadata)." },
    { category: "report", days: r.report, dir: path.join(base, "reports"), description: "신고서 초안 (markdown/text/docx/metadata)." },
    { category: "feedback", days: r.feedback, dir: path.join(base, "feedback"), description: "검토 피드백 DB. 룰 개선 목적이라 비교적 길게 유지." },
    { category: "case", days: r.case, dir: path.join(base, "cases"), description: "Case 메타데이터." },
    { category: "raw", days: r.raw, dir: path.join(base, "raw"), description: "수집 원본 HTML/스니펫. 짧게 유지." },
    { category: "scheduler", days: r.scheduler, dir: path.join(base, "scheduler"), description: "스케줄러 실행 기록." },
    { category: "scout", days: r.scout, dir: path.join(base, "candidates"), description: "Scout 후보 목록." }
  ];
}

async function collectFiles(dir: string, out: string[]): Promise<void> {
  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (EXCLUDED_FILE_NAMES.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await collectFiles(full, out);
    } else if (e.isFile()) {
      out.push(full);
    }
  }
}

async function findExpiredInDir(
  dir: string,
  category: RetentionCategory,
  days: number,
  now: Date
): Promise<ExpiredFile[]> {
  const files: string[] = [];
  await collectFiles(dir, files);
  const cutoffMs = now.getTime() - days * 24 * 60 * 60 * 1000;
  const out: ExpiredFile[] = [];
  for (const f of files) {
    try {
      const st = await stat(f);
      if (st.mtimeMs < cutoffMs) {
        const ageDays = Math.floor((now.getTime() - st.mtimeMs) / (24 * 60 * 60 * 1000));
        out.push({
          filePath: f,
          category,
          modifiedAt: new Date(st.mtimeMs).toISOString(),
          ageDays,
          byteSize: st.size
        });
      }
    } catch { /* skip */ }
  }
  return out;
}

export async function getExpiredFiles(category?: RetentionCategory): Promise<ExpiredFile[]> {
  const policies = getRetentionPolicies();
  const filtered = category && category !== "default"
    ? policies.filter((p) => p.category === category)
    : policies;
  const now = new Date();
  const all: ExpiredFile[] = [];
  for (const p of filtered) {
    const expired = await findExpiredInDir(p.dir, p.category, p.days, now);
    all.push(...expired);
  }
  return all;
}

export interface ApplyRetentionOptions {
  dryRun?: boolean;
  category?: RetentionCategory;
  // 최대 삭제 건수 (실수 방지)
  maxDeletions?: number;
}

export async function applyRetention(opts: ApplyRetentionOptions = {}): Promise<RetentionReport> {
  const dryRun = opts.dryRun ?? config.privacy.dryRun ?? true;
  const maxDeletions = Math.max(1, Math.min(opts.maxDeletions ?? 200, 1000));
  const policies = getRetentionPolicies();
  const expired = await getExpiredFiles(opts.category);

  const deleted: ExpiredFile[] = [];
  const errors: Array<{ filePath: string; message: string }> = [];

  if (!dryRun) {
    let count = 0;
    for (const ef of expired) {
      if (count >= maxDeletions) break;
      try {
        await unlink(ef.filePath);
        deleted.push(ef);
        count += 1;
      } catch (e) {
        errors.push({ filePath: ef.filePath, message: (e as Error).message });
      }
    }
  }

  return {
    schemaVersion: "1.0.0",
    dryRun,
    ranAt: new Date().toISOString(),
    policies,
    expired,
    deleted,
    errors,
    safetyNotice: PRIVACY_SAFETY_NOTICE
  };
}
