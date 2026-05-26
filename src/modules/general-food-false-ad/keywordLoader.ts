// 일반식품 허위·과대광고 키워드 로더 (체크리스트 33).
//
// false-ad/keywordLoader.ts 와 동일한 KeywordConfig 스키마를 재사용한다.
// RuleAgent 가 사용하는 필드(rules, riskWeights, schemaVersion, moduleId, *Terms)는 동일하므로
// 별도 스키마 없이 false-ad 의 validateKeywordConfig 로 검증한다.

import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  KeywordConfigError,
  validateKeywordConfig,
  type KeywordConfig
} from "../false-ad/keywordLoader.js";

const KEYWORDS_PATH = path.join(
  process.cwd(),
  "src/modules/general-food-false-ad/keywords.json"
);

let cache: KeywordConfig | null = null;

function parse(raw: string): KeywordConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new KeywordConfigError(`invalid JSON in general-food keywords.json: ${(error as Error).message}`);
  }
  return validateKeywordConfig(parsed);
}

export async function loadGeneralFoodKeywords(): Promise<KeywordConfig> {
  if (cache) return cache;
  let raw: string;
  try {
    raw = await readFile(KEYWORDS_PATH, "utf8");
  } catch (error) {
    throw new KeywordConfigError(`failed to read general-food keywords.json: ${(error as Error).message}`);
  }
  cache = parse(raw);
  return cache;
}

export function loadGeneralFoodKeywordsSync(): KeywordConfig {
  if (cache) return cache;
  let raw: string;
  try {
    raw = readFileSync(KEYWORDS_PATH, "utf8");
  } catch (error) {
    throw new KeywordConfigError(`failed to read general-food keywords.json: ${(error as Error).message}`);
  }
  cache = parse(raw);
  return cache;
}

export function clearGeneralFoodKeywordCache(): void {
  cache = null;
}

export type { KeywordConfig };
