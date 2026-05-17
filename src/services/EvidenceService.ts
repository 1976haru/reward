import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import type { CollectedDocument, EvidenceBundle } from "../types/core.js";
import { ensureDir } from "../utils/fs.js";
import { config } from "../utils/config.js";

export class EvidenceService {
  async buildEvidence(caseId: string, doc: CollectedDocument): Promise<EvidenceBundle> {
    const baseDir = path.join(config.dataDir, "evidence", caseId);
    await ensureDir(baseDir);
    const htmlPath = path.join(baseDir, "original.html");
    const textPath = path.join(baseDir, "extracted.txt");
    const screenshotPath = path.join(baseDir, "screenshot.png");
    const pdfPath = path.join(baseDir, "page.pdf");

    await writeFile(htmlPath, doc.html, "utf8");
    await writeFile(textPath, doc.text, "utf8");

    let screenshotOk = false;
    let pdfOk = false;
    try {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1366, height: 1600 } });
      await page.goto(doc.url, { waitUntil: "domcontentloaded", timeout: 25000 });
      await page.screenshot({ path: screenshotPath, fullPage: true });
      screenshotOk = true;
      await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
      pdfOk = true;
      await browser.close();
    } catch (error) {
      console.warn("증거 캡처 실패. HTML/TXT 증거만 저장합니다.", error);
    }

    return {
      htmlPath,
      textPath,
      screenshotPath: screenshotOk ? screenshotPath : undefined,
      pdfPath: pdfOk ? pdfPath : undefined,
      capturedAt: new Date().toISOString()
    };
  }
}
