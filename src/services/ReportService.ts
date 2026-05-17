import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { RewardCase } from "../types/core.js";
import { config } from "../utils/config.js";
import { ensureDir } from "../utils/fs.js";

export class ReportService {
  async createReport(rewardCase: RewardCase): Promise<string> {
    const reportDir = config.reportsDir;
    await ensureDir(reportDir);
    const reportPath = path.join(reportDir, `${rewardCase.id}.md`);

    const hitLines = rewardCase.ruleHits.map((hit, idx) => [
      `### ${idx + 1}. ${hit.category}`,
      `- 키워드: ${hit.keyword}`,
      `- 심각도: ${hit.severity}`,
      `- 사유: ${hit.reason}`,
      `- 발췌: ${hit.excerpt}`
    ].join("\n")).join("\n\n");

    const body = `# 공익신고 검토용 증거 패키지 초안\n\n` +
      `> 주의: 이 문서는 위반을 확정하지 않습니다. 공개자료 기반 의심 정리이며, 신고 전 사람이 최종 확인해야 합니다.\n\n` +
      `## 1. 기본 정보\n\n` +
      `- 사건 ID: ${rewardCase.id}\n` +
      `- 모듈: ${rewardCase.moduleId}\n` +
      `- 상태: ${rewardCase.status}\n` +
      `- URL: ${rewardCase.url}\n` +
      `- 제목: ${rewardCase.title}\n` +
      `- 생성일시: ${rewardCase.createdAt}\n` +
      `- 위험도 점수: ${rewardCase.score}/100\n\n` +
      `## 2. AI 요약\n\n${rewardCase.aiFinding.summary}\n\n` +
      `## 3. 신고 검토 문구\n\n${rewardCase.aiFinding.safeWording}\n\n` +
      `## 4. 주요 의심 근거\n\n${rewardCase.aiFinding.reasons.map((r) => `- ${r}`).join("\n")}\n\n` +
      `## 5. 규칙 탐지 결과\n\n${hitLines || "탐지된 규칙 없음"}\n\n` +
      `## 6. 사람 검토 필요 항목\n\n${rewardCase.aiFinding.requiredHumanChecks.map((r) => `- ${r}`).join("\n")}\n\n` +
      `## 7. 권장 신고기관 후보\n\n- ${rewardCase.aiFinding.recommendedAgency}\n\n` +
      `## 8. 첨부 증거\n\n` +
      `- HTML 원본: ${rewardCase.evidence.htmlPath}\n` +
      `- 텍스트 추출본: ${rewardCase.evidence.textPath}\n` +
      `- 스크린샷: ${rewardCase.evidence.screenshotPath ?? "캡처 실패 또는 미생성"}\n` +
      `- PDF: ${rewardCase.evidence.pdfPath ?? "PDF 생성 실패 또는 미생성"}\n`;

    await writeFile(reportPath, body, "utf8");
    return reportPath;
  }
}
