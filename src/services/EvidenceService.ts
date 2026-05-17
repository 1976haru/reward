import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import type { CollectedDocument, EvidenceBundle } from "../types/core.js";
import { ensureDir, writeJson, readJson } from "../utils/fs.js";
import { config } from "../utils/config.js";

// 표준 파일명 — 외부에서 fileName으로 요청 가능한 항목은 반드시 이 allowlist 안에 있어야 한다.
export const EVIDENCE_FILES = {
  html: "page.html",
  text: "page.txt",
  screenshot: "screenshot.png",
  pdf: "page.pdf",
  metadata: "metadata.json",
  manifest: "manifest.json"
} as const;

export const ALLOWED_EVIDENCE_FILENAMES: ReadonlySet<string> = new Set(Object.values(EVIDENCE_FILES));

const CASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export function isSafeCaseId(caseId: string): boolean {
  return typeof caseId === "string" && CASE_ID_PATTERN.test(caseId);
}

export function isAllowedEvidenceFileName(fileName: string): boolean {
  return typeof fileName === "string" && ALLOWED_EVIDENCE_FILENAMES.has(fileName);
}

export interface EvidenceFileEntry {
  name: string;          // 표준 파일명 (e.g. "page.html")
  path: string;          // 절대 경로 (서버 내부 사용)
  relativePath: string;  // 프로젝트 루트 기준 경로 (응답에 노출)
  size: number;          // bytes
  sha256: string;
  mimeType: string;
  capturedAt: string;
}

export interface EvidenceManifest {
  schemaVersion: "1.0.0";
  caseId: string;
  sourceUrl: string;
  pageTitle: string;
  fetchedAt: string;
  capturedAt: string;
  captureStatus: {
    html: "ok" | "skipped" | "failed";
    text: "ok" | "skipped" | "failed";
    screenshot: "ok" | "skipped" | "failed";
    pdf: "ok" | "skipped" | "failed";
    error?: string;
  };
  files: EvidenceFileEntry[];
  safety: {
    automaticReportSubmission: false;
    publicSourceOnly: true;
    humanReviewRequired: true;
    note: string;
  };
}

const MIME = {
  html: "text/html; charset=utf-8",
  text: "text/plain; charset=utf-8",
  screenshot: "image/png",
  pdf: "application/pdf",
  metadata: "application/json; charset=utf-8",
  manifest: "application/json; charset=utf-8"
} as const;

export class EvidenceService {
  // 외부에서 절대 경로를 만들 때 반드시 거쳐야 함 (path traversal 방지)
  getCaseDir(caseId: string): string {
    if (!isSafeCaseId(caseId)) {
      throw new Error(`Invalid caseId: ${caseId}`);
    }
    return path.join(config.evidenceDir, caseId);
  }

  getFilePath(caseId: string, fileName: string): string {
    if (!isAllowedEvidenceFileName(fileName)) {
      throw new Error(`Invalid evidence file name: ${fileName}`);
    }
    return path.join(this.getCaseDir(caseId), fileName);
  }

  manifestPath(caseId: string): string {
    return this.getFilePath(caseId, EVIDENCE_FILES.manifest);
  }

  async computeSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash("sha256");
      const stream = createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
  }

  async readManifest(caseId: string): Promise<EvidenceManifest> {
    return readJson<EvidenceManifest>(this.manifestPath(caseId));
  }

  async writeManifest(caseId: string, manifest: EvidenceManifest): Promise<void> {
    await writeJson(this.manifestPath(caseId), manifest);
  }

  async listEvidence(caseId: string): Promise<EvidenceManifest | null> {
    const caseDir = this.getCaseDir(caseId);
    try {
      // manifest가 있으면 그대로 반환
      return await this.readManifest(caseId);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }

    // manifest는 없지만 디렉터리에 파일이 있을 수 있다 (레거시 데이터)
    let names: string[] = [];
    try {
      names = await readdir(caseDir);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return null;
      throw error;
    }
    const allowed = names.filter((n) => ALLOWED_EVIDENCE_FILENAMES.has(n));
    if (allowed.length === 0) return null;

    const files: EvidenceFileEntry[] = await Promise.all(
      allowed.map(async (n) => this.describeFile(caseId, n))
    );
    return {
      schemaVersion: "1.0.0",
      caseId,
      sourceUrl: "",
      pageTitle: "",
      fetchedAt: "",
      capturedAt: new Date().toISOString(),
      captureStatus: { html: "ok", text: "ok", screenshot: "ok", pdf: "ok" },
      files,
      safety: {
        automaticReportSubmission: false,
        publicSourceOnly: true,
        humanReviewRequired: true,
        note: "manifest 없이 발견된 레거시 evidence 항목입니다."
      }
    };
  }

  private async describeFile(caseId: string, fileName: string): Promise<EvidenceFileEntry> {
    const absolute = this.getFilePath(caseId, fileName);
    const s = await stat(absolute);
    const sha = await this.computeSha256(absolute);
    const relative = path.relative(process.cwd(), absolute).split(path.sep).join("/");
    return {
      name: fileName,
      path: absolute,
      relativePath: relative,
      size: s.size,
      sha256: sha,
      mimeType: mimeFor(fileName),
      capturedAt: new Date(s.mtimeMs).toISOString()
    };
  }

  async saveHtml(caseId: string, html: string): Promise<EvidenceFileEntry> {
    await ensureDir(this.getCaseDir(caseId));
    const filePath = this.getFilePath(caseId, EVIDENCE_FILES.html);
    await writeFile(filePath, html, "utf8");
    return this.describeFile(caseId, EVIDENCE_FILES.html);
  }

  async saveText(caseId: string, text: string): Promise<EvidenceFileEntry> {
    await ensureDir(this.getCaseDir(caseId));
    const filePath = this.getFilePath(caseId, EVIDENCE_FILES.text);
    await writeFile(filePath, text, "utf8");
    return this.describeFile(caseId, EVIDENCE_FILES.text);
  }

  async saveMetadata(caseId: string, metadata: Record<string, unknown>): Promise<EvidenceFileEntry> {
    await ensureDir(this.getCaseDir(caseId));
    const filePath = this.getFilePath(caseId, EVIDENCE_FILES.metadata);
    await writeJson(filePath, metadata);
    return this.describeFile(caseId, EVIDENCE_FILES.metadata);
  }

  /**
   * 분석 파이프라인에서 호출되는 표준 진입점.
   * HTML/TXT는 항상 저장, 스크린샷/PDF는 env 토글에 따라 시도.
   * 실패해도 manifest에 사유를 기록하고 가용한 파일만 반환한다.
   * options.extractionSummary가 들어오면 metadata.json에 함께 기록한다.
   */
  async buildEvidence(
    caseId: string,
    doc: CollectedDocument,
    options: { extractionSummary?: Record<string, unknown> } = {}
  ): Promise<EvidenceBundle> {
    if (!isSafeCaseId(caseId)) {
      throw new Error(`Invalid caseId: ${caseId}`);
    }
    const baseDir = this.getCaseDir(caseId);
    await ensureDir(baseDir);
    const startedAt = new Date().toISOString();

    const entries: EvidenceFileEntry[] = [];
    const captureStatus: EvidenceManifest["captureStatus"] = {
      html: "ok",
      text: "ok",
      screenshot: "skipped",
      pdf: "skipped"
    };

    // 1) HTML / TXT — 항상 저장
    const htmlEntry = await this.saveHtml(caseId, doc.html);
    entries.push(htmlEntry);

    const textEntry = await this.saveText(caseId, doc.text);
    entries.push(textEntry);

    // 2) metadata.json
    const metadataEntry = await this.saveMetadata(caseId, {
      caseId,
      sourceUrl: doc.url,
      pageTitle: doc.title,
      fetchedAt: doc.fetchedAt,
      sourceType: doc.sourceType,
      capturedAt: startedAt,
      collector: "RewardAgentMVP/0.1",
      extraction: options.extractionSummary ?? null,
      safety: {
        automaticReportSubmission: false,
        publicSourceOnly: true,
        humanReviewRequired: true
      }
    });
    entries.push(metadataEntry);

    // 3) 스크린샷/PDF — 토글 + 실패 graceful
    const screenshotPath = this.getFilePath(caseId, EVIDENCE_FILES.screenshot);
    const pdfPath = this.getFilePath(caseId, EVIDENCE_FILES.pdf);

    if (config.evidence.enableScreenshot || config.evidence.enablePdf) {
      try {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1366, height: 1600 } });
        await page.goto(doc.url, {
          waitUntil: "domcontentloaded",
          timeout: config.evidence.captureTimeoutMs
        });

        if (config.evidence.enableScreenshot) {
          try {
            await page.screenshot({ path: screenshotPath, fullPage: true });
            entries.push(await this.describeFile(caseId, EVIDENCE_FILES.screenshot));
            captureStatus.screenshot = "ok";
          } catch (error) {
            captureStatus.screenshot = "failed";
            captureStatus.error = `screenshot: ${(error as Error).message}`;
          }
        }
        if (config.evidence.enablePdf) {
          try {
            await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
            entries.push(await this.describeFile(caseId, EVIDENCE_FILES.pdf));
            captureStatus.pdf = "ok";
          } catch (error) {
            captureStatus.pdf = "failed";
            captureStatus.error = `${captureStatus.error ?? ""} pdf: ${(error as Error).message}`.trim();
          }
        }
        await browser.close();
      } catch (error) {
        const msg = (error as Error).message;
        console.warn("증거 캡처 실패. HTML/TXT만 저장합니다.", msg);
        if (config.evidence.enableScreenshot) captureStatus.screenshot = "failed";
        if (config.evidence.enablePdf) captureStatus.pdf = "failed";
        captureStatus.error = msg;
      }
    }

    // 4) manifest.json
    const manifest: EvidenceManifest = {
      schemaVersion: "1.0.0",
      caseId,
      sourceUrl: doc.url,
      pageTitle: doc.title,
      fetchedAt: doc.fetchedAt,
      capturedAt: startedAt,
      captureStatus,
      files: entries,
      safety: {
        automaticReportSubmission: false,
        publicSourceOnly: true,
        humanReviewRequired: true,
        note: "본 증거는 사람 검토용 보존 자료이며, 외부 신고 제출은 사용자가 직접 수행합니다."
      }
    };
    await this.writeManifest(caseId, manifest);

    const htmlPathFinal = this.getFilePath(caseId, EVIDENCE_FILES.html);
    const textPathFinal = this.getFilePath(caseId, EVIDENCE_FILES.text);

    return {
      htmlPath: htmlPathFinal,
      textPath: textPathFinal,
      screenshotPath: captureStatus.screenshot === "ok" ? screenshotPath : undefined,
      pdfPath: captureStatus.pdf === "ok" ? pdfPath : undefined,
      capturedAt: startedAt
    };
  }
}

function mimeFor(fileName: string): string {
  switch (fileName) {
    case EVIDENCE_FILES.html: return MIME.html;
    case EVIDENCE_FILES.text: return MIME.text;
    case EVIDENCE_FILES.screenshot: return MIME.screenshot;
    case EVIDENCE_FILES.pdf: return MIME.pdf;
    case EVIDENCE_FILES.metadata: return MIME.metadata;
    case EVIDENCE_FILES.manifest: return MIME.manifest;
    default: return "application/octet-stream";
  }
}

// 테스트 편의를 위한 helper export
export async function readFileSafe(filePath: string): Promise<Buffer> {
  return readFile(filePath);
}
