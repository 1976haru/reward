// PrivacyScanService (체크리스트 28)
//
// data/ 하위 텍스트성 파일을 보수적으로 스캔해 개인정보성 문자열의 후보를 보고한다.
// 본 결과는 오탐 가능성이 있으므로 삭제 전 사람 검토가 필요하다.
// node_modules, dist, prisma/dev.db, .git 은 스캔하지 않는다.

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { config } from "../../utils/config.js";
import { detectSensitive } from "./SensitiveDataDetector.js";
import {
  PRIVACY_SAFETY_NOTICE,
  type FileScanResult,
  type ScanResult,
  type SensitiveDataType
} from "../../types/privacy.js";

const ALLOWED_TEXT_EXT = new Set([".json", ".jsonl", ".txt", ".md", ".html", ".htm"]);
const EXCLUDED_DIR_NAMES = new Set([
  "node_modules", "dist", ".git", "build", "coverage", ".cache"
]);
// 너무 큰 파일은 메모리 보호 위해 스킵 (10MB)
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function classifyExt(filePath: string): FileScanResult["fileType"] {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".jsonl") return "jsonl";
  if (ext === ".txt") return "txt";
  if (ext === ".md") return "md";
  if (ext === ".html" || ext === ".htm") return "html";
  return "other";
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (EXCLUDED_DIR_NAMES.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, out);
    } else if (e.isFile()) {
      out.push(full);
    }
  }
}

export interface ScanOptions {
  rootDirs?: string[];
  maxFilesPerRun?: number;
  topFindingsPerFile?: number;
}

const DEFAULT_OPTIONS: Required<ScanOptions> = {
  rootDirs: config.privacy.scanDirs,
  maxFilesPerRun: 500,
  topFindingsPerFile: 5
};

export async function scanPrivacy(opts: ScanOptions = {}): Promise<ScanResult> {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  const files: string[] = [];
  for (const root of o.rootDirs) {
    await walk(root, files);
  }

  const totalFiles = files.length;
  let scannedFiles = 0;
  let skippedFiles = 0;
  let filesWithFindings = 0;
  let totalFindings = 0;
  const byTypeAll: Partial<Record<SensitiveDataType, number>> = {};
  const riskFiles: FileScanResult[] = [];

  const cap = Math.min(files.length, o.maxFilesPerRun);
  for (let i = 0; i < cap; i++) {
    const filePath = files[i];
    const fileType = classifyExt(filePath);
    let byteSize = 0;
    try {
      const st = await stat(filePath);
      byteSize = st.size;
    } catch {
      skippedFiles += 1;
      continue;
    }

    if (!ALLOWED_TEXT_EXT.has(path.extname(filePath).toLowerCase())) {
      // 텍스트성이 아닌 파일은 SKIPPED (PDF/DOCX/PNG 등)
      skippedFiles += 1;
      if (byteSize > 0) {
        // 위험 후보로 카운트하지 않음
      }
      continue;
    }
    if (byteSize > MAX_FILE_SIZE_BYTES) {
      skippedFiles += 1;
      continue;
    }

    let text: string;
    try {
      text = await readFile(filePath, "utf8");
    } catch {
      skippedFiles += 1;
      continue;
    }

    const findings = detectSensitive(text);
    scannedFiles += 1;
    if (findings.length === 0) continue;

    filesWithFindings += 1;
    totalFindings += findings.length;
    const byType: Partial<Record<SensitiveDataType, number>> = {};
    for (const f of findings) {
      byType[f.type] = (byType[f.type] ?? 0) + 1;
      byTypeAll[f.type] = (byTypeAll[f.type] ?? 0) + 1;
    }
    riskFiles.push({
      filePath,
      fileType,
      scanned: true,
      byteSize,
      findingsCount: findings.length,
      byType,
      topFindings: findings.slice(0, o.topFindingsPerFile).map((f) => ({
        type: f.type,
        confidence: f.confidence,
        excerpt: f.excerpt,
        recommendedAction: f.recommendedAction
      }))
    });
  }

  if (files.length > cap) skippedFiles += (files.length - cap);

  // 위험 파일은 findings 수 내림차순
  riskFiles.sort((a, b) => b.findingsCount - a.findingsCount);

  return {
    schemaVersion: "1.0.0",
    scannedAt: new Date().toISOString(),
    rootDirs: o.rootDirs,
    totalFiles,
    scannedFiles,
    skippedFiles,
    filesWithFindings,
    totalFindings,
    byType: byTypeAll,
    riskFiles: riskFiles.slice(0, 50),  // 응답 크기 제한
    safetyNotice: PRIVACY_SAFETY_NOTICE
  };
}
