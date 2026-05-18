import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { KeywordConfig } from "../false-ad/keywordLoader.js";
import { KeywordConfigError } from "../false-ad/keywordLoader.js";

// 위조상품 모듈 keywords.json 로더.
// false-ad/keywordLoader.ts 와 동일한 KeywordConfig 스키마를 재사용하며,
// 위조상품 룰셋이 가진 추가 필드(brandTerms/counterfeitTerms/secretContactTerms/packagingTerms 등)는
// validate() 단계에서 optional 로 허용한다.

export interface CounterfeitKeywordConfig extends Omit<KeywordConfig,
  "diseaseTerms" | "actionTerms" | "exaggerationTerms" | "productTerms"
> {
  brandTerms: string[];
  counterfeitTerms: string[];
  secretContactTerms: string[];
  packagingTerms: string[];
}

const KEYWORDS_PATH = path.join(
  process.cwd(),
  "src/modules/counterfeit-goods/keywords.json"
);

function validate(raw: unknown): CounterfeitKeywordConfig {
  if (!raw || typeof raw !== "object") {
    throw new KeywordConfigError("counterfeit keywords.json must be an object");
  }
  const c = raw as Partial<CounterfeitKeywordConfig>;
  const required: (keyof CounterfeitKeywordConfig)[] = [
    "schemaVersion", "moduleId", "category", "lastReviewedAt",
    "disclaimer", "riskWeights",
    "brandTerms", "counterfeitTerms", "secretContactTerms", "packagingTerms",
    "rules"
  ];
  for (const k of required) {
    if (!(k in c)) throw new KeywordConfigError(`missing field: ${k}`);
  }
  if (!Array.isArray(c.rules) || c.rules.length === 0) {
    throw new KeywordConfigError("rules must be a non-empty array");
  }
  for (const r of c.rules!) {
    if (r.matchType === "regex" || r.matchType === "combo") {
      if (!r.pattern) throw new KeywordConfigError(`rule ${r.id} requires pattern`);
      try { new RegExp(r.pattern, "gi"); }
      catch (e) {
        throw new KeywordConfigError(`rule ${r.id} has invalid regex: ${(e as Error).message}`);
      }
    }
    if (!r.keyword || !r.riskLevel || !r.category || !r.reason) {
      throw new KeywordConfigError(`rule ${r.id} missing required fields`);
    }
    if (!["HIGH", "MEDIUM", "LOW"].includes(r.riskLevel)) {
      throw new KeywordConfigError(`rule ${r.id} has invalid riskLevel: ${r.riskLevel}`);
    }
  }
  return c as CounterfeitKeywordConfig;
}

let cache: CounterfeitKeywordConfig | null = null;

export function loadCounterfeitKeywordsSync(): CounterfeitKeywordConfig {
  if (cache) return cache;
  let raw: string;
  try {
    raw = readFileSync(KEYWORDS_PATH, "utf8");
  } catch (error) {
    throw new KeywordConfigError(`failed to read counterfeit keywords.json: ${(error as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new KeywordConfigError(`invalid JSON in counterfeit keywords.json: ${(error as Error).message}`);
  }
  cache = validate(parsed);
  return cache;
}

export async function loadCounterfeitKeywords(): Promise<CounterfeitKeywordConfig> {
  if (cache) return cache;
  const raw = await readFile(KEYWORDS_PATH, "utf8");
  cache = validate(JSON.parse(raw));
  return cache;
}

export function clearCounterfeitKeywordCache(): void { cache = null; }

export function getCounterfeitKeywordSummary(config: CounterfeitKeywordConfig) {
  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0, combo: 0 };
  for (const r of config.rules) {
    if (r.matchType === "regex" || r.matchType === "combo") counts.combo++;
    else counts[r.riskLevel]++;
  }
  return {
    schemaVersion: config.schemaVersion,
    moduleId: config.moduleId,
    lastReviewedAt: config.lastReviewedAt,
    totalRules: config.rules.length,
    counts,
    brandTerms: config.brandTerms.length,
    counterfeitTerms: config.counterfeitTerms.length,
    secretContactTerms: config.secretContactTerms.length,
    packagingTerms: config.packagingTerms.length
  };
}
