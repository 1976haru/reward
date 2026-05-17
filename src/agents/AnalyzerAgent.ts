import OpenAI from "openai";
import type { AiFinding, CollectedDocument, RuleHit } from "../types/core.js";
import { config } from "../utils/config.js";

export class AnalyzerAgent {
  private client: OpenAI | null;

  constructor() {
    this.client = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;
  }

  async analyze(doc: CollectedDocument, ruleHits: RuleHit[], score: number): Promise<AiFinding> {
    if (!this.client) return this.mockAnalyze(ruleHits, score);

    const prompt = [
      "너는 공익신고 지원용 검토 에이전트다.",
      "절대 위반 확정이라고 단정하지 말고, 공개자료 기반 의심 근거만 보수적으로 정리한다.",
      "자동 신고를 권하지 말고 사람이 최종 확인해야 할 항목을 제시한다.",
      "JSON만 출력한다.",
      "필드: suspicious(boolean), confidence(0~100), violationType, summary, reasons(string[]), requiredHumanChecks(string[]), recommendedAgency, safeWording",
      `URL: ${doc.url}`,
      `제목: ${doc.title}`,
      `룰 탐지 점수: ${score}`,
      `룰 히트: ${JSON.stringify(ruleHits.slice(0, 20), null, 2)}`,
      `본문 일부: ${doc.text.slice(0, 6000)}`
    ].join("\n\n");

    const response = await this.client.chat.completions.create({
      model: config.aiModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as AiFinding;
    return {
      suspicious: Boolean(parsed.suspicious),
      confidence: Number(parsed.confidence ?? score),
      violationType: parsed.violationType ?? "온라인 허위·과대광고 의심",
      summary: parsed.summary ?? "AI 분석 요약 없음",
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
      requiredHumanChecks: Array.isArray(parsed.requiredHumanChecks) ? parsed.requiredHumanChecks : ["상품 유형과 실제 광고 문구를 사람이 확인"],
      recommendedAgency: parsed.recommendedAgency ?? "식품의약품안전처 또는 관할 기관",
      safeWording: parsed.safeWording ?? "공개 웹페이지에서 위반 가능성이 있는 표현이 확인되어 검토가 필요합니다."
    };
  }

  private mockAnalyze(ruleHits: RuleHit[], score: number): AiFinding {
    const categories = [...new Set(ruleHits.map((hit) => hit.category))];
    return {
      suspicious: ruleHits.length > 0,
      confidence: Math.min(95, score),
      violationType: categories[0] ?? "탐지된 위반 유형 없음",
      summary: ruleHits.length
        ? `${ruleHits.length}개의 의심 표현이 탐지되었습니다. 사람 검토 후 신고 여부를 판단하세요.`
        : "현재 규칙 기준으로 명확한 의심 표현은 탐지되지 않았습니다.",
      reasons: ruleHits.slice(0, 5).map((hit) => `${hit.category}: '${hit.keyword}' 표현 탐지`),
      requiredHumanChecks: [
        "상품 유형이 식품/건강기능식품/화장품/의료기기/의약품 중 어디에 해당하는지 확인",
        "탐지 문구가 실제 광고 문맥에서 질병 치료·예방을 암시하는지 확인",
        "캡처 파일과 원본 URL 접속 가능 여부 확인",
        "동일 판매자의 반복 위반 여부 확인"
      ],
      recommendedAgency: "식품의약품안전처 또는 관할 기관",
      safeWording: "공개된 온라인 광고에서 소비자 오인 가능성이 있는 표현이 확인되어 관계기관 검토가 필요합니다."
    };
  }
}
