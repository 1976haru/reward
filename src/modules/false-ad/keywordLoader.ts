import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";
export type MatchType = "keyword" | "regex" | "combo";

export interface KeywordRule {
  id: string;
  keyword: string;
  riskLevel: RiskLevel;
  weight: number;
  category: string;
  reason: string;
  examples?: string[];
  matchType: MatchType;
  pattern?: string;
}

export interface RiskWeights {
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  diseaseAndTreatmentCombo: number;
  productAndDiseaseCombo: number;
  repeatedPhrase: number;
  maxScore: number;
}

export interface KeywordConfig {
  schemaVersion: string;
  moduleId: string;
  category: string;
  lastReviewedAt: string;
  disclaimer: string;
  riskWeights: RiskWeights;
  diseaseTerms: string[];
  actionTerms: string[];
  exaggerationTerms: string[];
  productTerms: string[];
  rules: KeywordRule[];
}

export class KeywordConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeywordConfigError";
  }
}

const KEYWORDS_PATH = path.join(
  process.cwd(),
  "src/modules/false-ad/keywords.json"
);

function validate(config: unknown): KeywordConfig {
  if (!config || typeof config !== "object") {
    throw new KeywordConfigError("keywords.json must be an object");
  }
  const c = config as Partial<KeywordConfig>;
  const required: (keyof KeywordConfig)[] = [
    "schemaVersion", "moduleId", "category", "lastReviewedAt",
    "disclaimer", "riskWeights", "diseaseTerms", "actionTerms",
    "exaggerationTerms", "productTerms", "rules"
  ];
  for (const k of required) {
    if (!(k in c)) throw new KeywordConfigError(`missing field: ${k}`);
  }
  if (!Array.isArray(c.rules) || c.rules.length === 0) {
    throw new KeywordConfigError("rules must be a non-empty array");
  }
  // 각 regex 룰 pattern 컴파일 가능 여부 사전 검증
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
  return c as KeywordConfig;
}

let cache: KeywordConfig | null = null;

export async function loadFalseAdKeywords(): Promise<KeywordConfig> {
  if (cache) return cache;
  let raw: string;
  try {
    raw = await readFile(KEYWORDS_PATH, "utf8");
  } catch (error) {
    throw new KeywordConfigError(`failed to read keywords.json: ${(error as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new KeywordConfigError(`invalid JSON in keywords.json: ${(error as Error).message}`);
  }
  cache = validate(parsed);
  return cache;
}

export function loadFalseAdKeywordsSync(): KeywordConfig {
  if (cache) return cache;
  let raw: string;
  try {
    raw = readFileSync(KEYWORDS_PATH, "utf8");
  } catch (error) {
    throw new KeywordConfigError(`failed to read keywords.json: ${(error as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new KeywordConfigError(`invalid JSON in keywords.json: ${(error as Error).message}`);
  }
  cache = validate(parsed);
  return cache;
}

export function clearKeywordCache(): void {
  cache = null;
}

export function validateKeywordConfig(config: unknown): KeywordConfig {
  return validate(config);
}

export function getKeywordConfigSummary(config: KeywordConfig) {
  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0, combo: 0 };
  for (const r of config.rules) {
    if (r.matchType === "regex" || r.matchType === "combo") counts.combo++;
    else counts[r.riskLevel]++;
  }
  // 모듈별 추가 단어 필드는 모듈마다 다름 — false_ad 의 필드가 없는 경우(예: counterfeit_goods)
  // 0 으로 안전하게 처리한다.
  const c = config as unknown as Record<string, unknown>;
  const len = (k: string) => (Array.isArray(c[k]) ? (c[k] as unknown[]).length : 0);
  return {
    schemaVersion: config.schemaVersion,
    moduleId: config.moduleId,
    lastReviewedAt: config.lastReviewedAt,
    totalRules: config.rules.length,
    counts,
    diseaseTerms: len("diseaseTerms"),
    actionTerms: len("actionTerms"),
    exaggerationTerms: len("exaggerationTerms"),
    productTerms: len("productTerms")
  };
}
