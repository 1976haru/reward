import path from "node:path";
import { readdir } from "node:fs/promises";
import { config } from "../utils/config.js";
import { ensureDir, readJson, writeJson } from "../utils/fs.js";
import type {
  EvalRunResult,
  EvalSet,
  EvalSetSummary
} from "../types/eval.js";

export class EvalSetNotFoundError extends Error {
  constructor(public readonly evalSetId: string) {
    super(`Eval set not found: ${evalSetId}`);
    this.name = "EvalSetNotFoundError";
  }
}

export class EvalRunNotFoundError extends Error {
  constructor(public readonly runId: string) {
    super(`Eval run not found: ${runId}`);
    this.name = "EvalRunNotFoundError";
  }
}

// 모듈별 eval 디렉터리: src/modules/false-ad/eval/*.json
const MODULE_EVAL_DIRS: Record<string, string> = {
  false_ad: path.join(process.cwd(), "src", "modules", "false-ad", "eval")
};

// runId 안전 패턴 — path traversal 차단
export function isSafeRunId(s: string): boolean {
  return typeof s === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(s);
}

export interface IEvalRepository {
  listSets(moduleId?: string): Promise<EvalSetSummary[]>;
  getSet(evalSetId: string): Promise<EvalSet>;
  saveRun(run: EvalRunResult): Promise<void>;
  listRuns(limit?: number): Promise<EvalRunResult[]>;
  getRun(runId: string): Promise<EvalRunResult>;
  getLatest(): Promise<EvalRunResult | null>;
}

export class JsonEvalRepository implements IEvalRepository {
  private readonly runsDir: string;

  constructor(runsDir: string = path.join(config.eval.dir, "runs")) {
    this.runsDir = runsDir;
  }

  private getEvalDirForModule(moduleId: string): string {
    return MODULE_EVAL_DIRS[moduleId] ?? MODULE_EVAL_DIRS["false_ad"];
  }

  async listSets(moduleId: string = "false_ad"): Promise<EvalSetSummary[]> {
    const dir = this.getEvalDirForModule(moduleId);
    const summaries: EvalSetSummary[] = [];
    let files: string[];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return [];
      throw e;
    }
    for (const f of files) {
      try {
        const set = await readJson<EvalSet>(path.join(dir, f));
        const total = set.samples?.length ?? 0;
        const positives = (set.samples ?? []).filter((s) => s.label === "VIOLATION_CANDIDATE").length;
        const negatives = total - positives;
        summaries.push({
          evalSetId: set.evalSetId,
          name: set.name,
          description: set.description,
          moduleId: set.moduleId,
          synthetic: set.synthetic === true,
          total,
          positives,
          negatives,
          createdAt: set.createdAt
        });
      } catch {
        // 손상된 JSON은 건너뜀
      }
    }
    return summaries;
  }

  async getSet(evalSetId: string): Promise<EvalSet> {
    // 안전한 이름만 허용
    if (!/^[A-Za-z0-9_\-]{1,80}$/.test(evalSetId)) {
      throw new EvalSetNotFoundError(evalSetId);
    }
    // 모든 모듈 eval 디렉토리에서 검색 (현재는 false_ad만)
    for (const moduleId of Object.keys(MODULE_EVAL_DIRS)) {
      const filePath = path.join(this.getEvalDirForModule(moduleId), `${evalSetId}.json`);
      try {
        const set = await readJson<EvalSet>(filePath);
        if (set.evalSetId === evalSetId) return set;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw e;
      }
    }
    throw new EvalSetNotFoundError(evalSetId);
  }

  async saveRun(run: EvalRunResult): Promise<void> {
    if (!isSafeRunId(run.runId)) {
      throw new Error(`Invalid runId: ${run.runId}`);
    }
    await ensureDir(this.runsDir);
    await writeJson(path.join(this.runsDir, `${run.runId}.json`), run);
    // latest pointer (오버라이트)
    await writeJson(path.join(this.runsDir, "latest.json"), { runId: run.runId, ranAt: run.ranAt });
  }

  async listRuns(limit = 20): Promise<EvalRunResult[]> {
    await ensureDir(this.runsDir);
    let files: string[];
    try {
      files = (await readdir(this.runsDir))
        .filter((f) => f.endsWith(".json") && f !== "latest.json");
    } catch {
      return [];
    }
    const runs: EvalRunResult[] = [];
    for (const f of files) {
      try {
        const r = await readJson<EvalRunResult>(path.join(this.runsDir, f));
        runs.push(r);
      } catch { /* skip */ }
    }
    runs.sort((a, b) => b.ranAt.localeCompare(a.ranAt));
    return runs.slice(0, Math.max(1, Math.min(100, limit)));
  }

  async getRun(runId: string): Promise<EvalRunResult> {
    if (!isSafeRunId(runId)) throw new EvalRunNotFoundError(runId);
    try {
      const r = await readJson<EvalRunResult>(path.join(this.runsDir, `${runId}.json`));
      return r;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT") throw new EvalRunNotFoundError(runId);
      throw e;
    }
  }

  async getLatest(): Promise<EvalRunResult | null> {
    await ensureDir(this.runsDir);
    try {
      const ptr = await readJson<{ runId: string }>(path.join(this.runsDir, "latest.json"));
      if (!ptr?.runId) return null;
      return await this.getRun(ptr.runId);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return null;
      // pointer가 가리키는 runId가 없을 수 있음 — 그 경우 첫 listRuns로 폴백
      if (e instanceof EvalRunNotFoundError) {
        const runs = await this.listRuns(1);
        return runs[0] ?? null;
      }
      throw e;
    }
  }
}

// ---- PII 검사 — eval set 생성 시 사전 차단 ----
// 완벽한 탐지가 아닌 1차 방어선. 실제 업체명/개인정보가 들어왔는지 정규식으로 점검한다.

export interface EvalPiiCheckResult {
  ok: boolean;
  violations: Array<{ sampleId: string; pattern: string; excerpt: string }>;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g;
const RRN_RE = /\b\d{6}[-]\d{7}\b/g;
const ADDRESS_HINT_RE = /(\d+\s*동\s*\d+\s*호|\d+\s*번지|서울특별시\s*\S+구|부산광역시\s*\S+구|경기도\s*\S+시\s*\S+구)/g;

export function checkEvalSetForPii(set: EvalSet): EvalPiiCheckResult {
  const violations: EvalPiiCheckResult["violations"] = [];
  for (const s of set.samples ?? []) {
    const text = `${s.productName ?? ""} ${s.text ?? ""} ${s.notes ?? ""}`;
    const checks: Array<[string, RegExp]> = [
      ["email", EMAIL_RE],
      ["phone", PHONE_RE],
      ["rrn", RRN_RE],
      ["address", ADDRESS_HINT_RE]
    ];
    for (const [name, re] of checks) {
      re.lastIndex = 0;
      const m = re.exec(text);
      if (m) {
        violations.push({ sampleId: s.id, pattern: name, excerpt: m[0] });
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

export function createEvalRepository(): IEvalRepository {
  return new JsonEvalRepository();
}
