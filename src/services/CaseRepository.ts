import { readdir } from "node:fs/promises";
import path from "node:path";
import type { CaseStatus, RewardCase } from "../types/core.js";
import { config } from "../utils/config.js";
import { ensureDir, readJson, writeJson } from "../utils/fs.js";

export class CaseRepository {
  private casesDir = path.join(config.dataDir, "cases");

  async save(rewardCase: RewardCase): Promise<void> {
    await ensureDir(this.casesDir);
    await writeJson(path.join(this.casesDir, `${rewardCase.id}.json`), rewardCase);
  }

  async list(): Promise<RewardCase[]> {
    await ensureDir(this.casesDir);
    const files = await readdir(this.casesDir);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));
    const cases = await Promise.all(jsonFiles.map((file) => readJson<RewardCase>(path.join(this.casesDir, file))));
    return cases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id: string): Promise<RewardCase> {
    return readJson<RewardCase>(path.join(this.casesDir, `${id}.json`));
  }

  async updateStatus(id: string, status: CaseStatus): Promise<RewardCase> {
    const current = await this.get(id);
    const updated = { ...current, status, updatedAt: new Date().toISOString() };
    await this.save(updated);
    return updated;
  }
}
