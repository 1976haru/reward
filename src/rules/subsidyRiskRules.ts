// 보조금 룰 5종 통합 실행 엔진 (체크리스트 60).
//
// 정규화된 보조금 레코드 목록에 5종 룰(A 반복수급, B 동일주소, C 결과물/정산 누락,
// D 예산집행 이상치, E 사업명 유사 반복)을 실행하고, 룰 결과를 합쳐 검토 후보 TOP N을 만든다.
//
// 안전 원칙:
// - 결과는 "사람 검토 필요 후보"이며 부정수급/위법 확정이 아니다(reviewRequired/notLegalConclusion 항상 true).
// - 정렬 점수는 룰 기반 보조 점수이며 100점 위험점수가 아니다.
// - 개인정보 원문(대표자명/연락처/계좌/상세주소)은 근거로 쓰지 않는다.

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  calculateProjectNameSimilarity,
  normalizeProjectName
} from "../normalizers/projectNameSimilarity.js";
import {
  SEVERITY_WEIGHT,
  SUBSIDY_RISK_RULE_NAMES,
  SUBSIDY_RISK_RULES_NOTICE,
  type SubsidyRiskInputRecord,
  type SubsidyRiskRuleCount,
  type SubsidyRiskRuleId,
  type SubsidyRiskRuleResult,
  type SubsidyRiskRunResult,
  type SubsidyRiskSeverity,
  type SubsidyRiskTopCandidate
} from "../types/subsidyRisk.js";

// ---------- 옵션 ----------

export interface SubsidyRiskRunOptions {
  /** 사업명 유사 반복 임계값(기본 0.85). */
  similarityThreshold?: number;
  /** 예산집행 이상치 절대 임계값(원). 기본 5억. */
  amountAbsoluteThreshold?: number;
  /** 예산집행 이상치 표준편차 배수(기본 2). */
  amountStdMultiplier?: number;
  /** TOP N 후보 수(기본 50). */
  topN?: number;
  /** 입력 모드 설명. */
  inputMode?: string;
  /** 실데이터 여부(콘솔/리포트 표기용). */
  isRealData?: boolean;
}

// ---------- 유틸 ----------

function shortHash(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 10);
}

function recipientKey(r: SubsidyRiskInputRecord): string | undefined {
  const k = (r.normalizedRecipientName ?? r.recipientName ?? "").trim();
  return k.length > 0 ? k : undefined;
}

function addressKey(r: SubsidyRiskInputRecord): string | undefined {
  const k = (r.addressRegionKey ?? r.normalizedAddressKey ?? "").trim();
  return k.length > 0 ? k : undefined;
}

function projectKey(r: SubsidyRiskInputRecord): string | undefined {
  const k = (r.projectNameCompactKey ?? r.projectName ?? "").trim();
  return k.length > 0 ? k : undefined;
}

/** 레코드의 근거 참조(공개 URL / 출처 파일). 개인정보는 넣지 않는다. */
function evidenceRefForRecord(r: SubsidyRiskInputRecord): string {
  if (r.publicListingUrl) return `공시URL:${r.publicListingUrl}`;
  if (r.resultEvidenceUrl) return `결과물URL:${r.resultEvidenceUrl}`;
  if (r.sourceFileName) return `출처파일:${r.sourceFileName}#${r.recordId}`;
  return `레코드:${r.recordId}`;
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

// ---------- A. 반복수급 ----------

/**
 * 동일 (정규화)수급기관이 서로 다른 회계연도 또는 서로 다른 사업으로 2건 이상 등장하면
 * 반복수급 검토 후보로 본다. 확정 아님 — 정상 다년도 사업일 수 있음.
 */
export function repeatRecipientRule(records: SubsidyRiskInputRecord[]): SubsidyRiskRuleResult[] {
  const groups = new Map<string, SubsidyRiskInputRecord[]>();
  for (const r of records) {
    const key = recipientKey(r);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const results: SubsidyRiskRuleResult[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const years = uniq(list.map((r) => r.fiscalYear).filter((y): y is number => typeof y === "number"));
    const projects = uniq(list.map((r) => projectKey(r)).filter((p): p is string => Boolean(p)));
    // 반복 신호: 여러 해에 걸치거나 여러 사업으로 반복 등장
    if (years.length < 2 && projects.length < 2 && list.length < 2) continue;

    const count = list.length;
    const severity: SubsidyRiskSeverity = count >= 4 ? "high" : count >= 3 ? "medium" : "low";
    results.push({
      ruleId: "repeat_recipient",
      ruleName: SUBSIDY_RISK_RULE_NAMES.repeat_recipient,
      severity,
      candidateId: `repeat_recipient:${shortHash(key)}`,
      involvedRecordIds: list.map((r) => r.recordId),
      evidenceRefs: uniq(list.map(evidenceRefForRecord)),
      reason: `동일 수급기관 후보가 ${count}건(회계연도 ${years.length || "?"}종, 사업 ${projects.length || "?"}종) 반복 등장 — 반복수급 검토 후보.`,
      caution:
        "정상적인 다년도·연속 사업이거나 동명이단체일 수 있습니다. 기관명 정규화는 확정 병합이 아니므로 동일 기관 여부부터 사람이 확인해야 합니다.",
      reviewRequired: true,
      notLegalConclusion: true,
      suggestedNextCheck: [
        "동일 기관 여부(사업자등록·고유번호 등 공식 식별자) 확인",
        "각 건의 사업 목적·기간이 실제로 중복되는지 확인",
        "중복 교부 금지·연속 지원 제한 규정 적용 여부 확인"
      ]
    });
  }
  return results;
}

// ---------- B. 동일주소 다단체 ----------

/**
 * 동일 주소 지역키에 서로 다른 수급기관 2곳 이상이 묶이면 동일주소 다단체 검토 후보로 본다.
 * 공유오피스/회관/복지관/공공시설은 정상일 수 있어 오탐 주의를 명시한다.
 */
export function sameAddressRule(records: SubsidyRiskInputRecord[]): SubsidyRiskRuleResult[] {
  const groups = new Map<string, SubsidyRiskInputRecord[]>();
  for (const r of records) {
    const key = addressKey(r);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const results: SubsidyRiskRuleResult[] = [];
  for (const [key, list] of groups) {
    const recipients = uniq(list.map((r) => recipientKey(r)).filter((v): v is string => Boolean(v)));
    if (recipients.length < 2) continue;

    const severity: SubsidyRiskSeverity =
      recipients.length >= 4 ? "high" : recipients.length >= 3 ? "medium" : "low";
    results.push({
      ruleId: "same_address",
      ruleName: SUBSIDY_RISK_RULE_NAMES.same_address,
      severity,
      candidateId: `same_address:${shortHash(key)}`,
      involvedRecordIds: list.map((r) => r.recordId),
      evidenceRefs: uniq(list.map(evidenceRefForRecord)),
      reason: `동일 주소(지역 단위 키)에 서로 다른 수급기관 후보 ${recipients.length}곳이 묶임 — 동일주소 다단체 검토 후보.`,
      caution:
        "공유오피스·창업보육센터·주민센터·복지관·시민회관 등은 여러 단체가 정상적으로 같은 주소를 쓸 수 있습니다. 상세주소(동·호수)는 저장하지 않으므로 같은 호실 여부까지는 사람이 별도 확인해야 합니다.",
      reviewRequired: true,
      notLegalConclusion: true,
      suggestedNextCheck: [
        "해당 주소가 공유시설/집합건물인지 확인",
        "단체 간 대표자·연락처·계좌 공유 등 특수관계 정황 확인(공식 자료)",
        "같은 주소 단체들이 유사 사업으로 중복 수급했는지 확인"
      ]
    });
  }
  return results;
}

// ---------- C. 결과물/정산 증빙 누락 ----------

/**
 * 보조금을 받았는데 정산액·결과물 증빙·결과보고가 모두 확인되지 않으면 증빙 누락 검토 후보로 본다.
 * 공개 시점 차이(정산 전)일 수 있어 주의를 명시한다.
 */
export function missingOutputSettlementRule(
  records: SubsidyRiskInputRecord[]
): SubsidyRiskRuleResult[] {
  const results: SubsidyRiskRuleResult[] = [];
  for (const r of records) {
    const hasSubsidy = typeof r.subsidyAmount === "number" && r.subsidyAmount > 0;
    if (!hasSubsidy) continue;
    const hasSettlement = typeof r.settlementAmount === "number" && r.settlementAmount > 0;
    const hasResult = Boolean(r.hasResultReport) || Boolean(r.resultEvidenceUrl);
    if (hasSettlement || hasResult) continue;

    results.push({
      ruleId: "missing_output_settlement",
      ruleName: SUBSIDY_RISK_RULE_NAMES.missing_output_settlement,
      severity: "medium",
      candidateId: `missing_output_settlement:${shortHash(r.recordId)}`,
      involvedRecordIds: [r.recordId],
      evidenceRefs: [evidenceRefForRecord(r)],
      reason:
        "보조금 교부 기록은 있으나 정산액·결과물 증빙·결과보고가 공개 자료에서 확인되지 않음 — 추가 확인 필요.",
      caution:
        "정산·결과보고가 아직 공개되지 않았거나(사업 진행 중) 공시 시점 차이일 수 있습니다. 누락이 곧 부정수급을 뜻하지 않습니다.",
      reviewRequired: true,
      notLegalConclusion: true,
      suggestedNextCheck: [
        "해당 사업의 정산·결과보고 공시 시점이 도래했는지 확인",
        "기관 공시·게시판에서 결과물 증빙이 별도로 공개됐는지 확인",
        "정산 누락이라면 관할 부서에 사실 여부 문의(사람)"
      ]
    });
  }
  return results;
}

// ---------- D. 예산집행 이상치 ----------

/**
 * 교부금액(또는 집행액)이 절대 임계값을 넘거나, 집합 평균+표준편차*배수를 넘으면 이상치 후보로 본다.
 * 큰 사업은 원래 금액이 클 수 있어 주의를 명시한다.
 */
export function budgetAnomalyRule(
  records: SubsidyRiskInputRecord[],
  opts: { amountAbsoluteThreshold: number; amountStdMultiplier: number }
): SubsidyRiskRuleResult[] {
  const amounts = records
    .map((r) => (typeof r.subsidyAmount === "number" ? r.subsidyAmount : undefined))
    .filter((v): v is number => typeof v === "number" && v > 0);
  const mean = amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
  const variance = amounts.length
    ? amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / amounts.length
    : 0;
  const std = Math.sqrt(variance);
  const statThreshold = mean + opts.amountStdMultiplier * std;

  const results: SubsidyRiskRuleResult[] = [];
  for (const r of records) {
    const amount = typeof r.subsidyAmount === "number" ? r.subsidyAmount : undefined;
    if (typeof amount !== "number" || amount <= 0) continue;

    const overAbsolute = amount >= opts.amountAbsoluteThreshold;
    const overStat = amounts.length >= 3 && std > 0 && amount > statThreshold;
    // 집행액이 교부금액을 초과(역전)하는 경우도 이상 신호
    const overExecution =
      typeof r.executionAmount === "number" && r.executionAmount > amount * 1.05;
    if (!overAbsolute && !overStat && !overExecution) continue;

    const severity: SubsidyRiskSeverity = overAbsolute && overStat ? "high" : "medium";
    const reasons: string[] = [];
    if (overAbsolute) reasons.push(`교부금액이 절대 임계값(${opts.amountAbsoluteThreshold.toLocaleString()}원) 이상`);
    if (overStat)
      reasons.push(`집합 평균+${opts.amountStdMultiplier}σ(${Math.round(statThreshold).toLocaleString()}원) 초과`);
    if (overExecution) reasons.push("집행액이 교부금액을 초과(역전)");

    results.push({
      ruleId: "budget_anomaly",
      ruleName: SUBSIDY_RISK_RULE_NAMES.budget_anomaly,
      severity,
      candidateId: `budget_anomaly:${shortHash(r.recordId)}`,
      involvedRecordIds: [r.recordId],
      evidenceRefs: [evidenceRefForRecord(r)],
      reason: `예산집행 이상치 신호(${reasons.join(", ")}) — 검토 후보.`,
      caution:
        "대규모 시설·인프라 사업은 원래 금액이 클 수 있고, 회계연도 이월·추경으로 금액이 달라질 수 있습니다. 금액 크기만으로 부정수급을 뜻하지 않습니다.",
      reviewRequired: true,
      notLegalConclusion: true,
      suggestedNextCheck: [
        "사업 규모·성격상 금액이 합당한지 확인",
        "집행액>교부액 역전이면 추가 재원·오기재 여부 확인",
        "동종 사업 평균 대비 단가·산출물 적정성 확인"
      ]
    });
  }
  return results;
}

// ---------- E. 사업명 유사 반복 ----------

/**
 * 서로 다른 레코드의 사업명 유사도가 임계값(기본 0.85) 이상이면 유사 사업명 반복 후보로 본다.
 * 같은 수급기관 내 반복은 별도 가중(반복 신청 가능성).
 */
export function similarProjectRepeatRule(
  records: SubsidyRiskInputRecord[],
  opts: { similarityThreshold: number }
): SubsidyRiskRuleResult[] {
  const withProject = records.filter((r) => projectKey(r));
  const normalized = withProject.map((r) => ({
    record: r,
    norm: normalizeProjectName(r.projectName ?? r.projectNameCompactKey ?? "")
  }));

  // 유사 쌍을 union-find 로 묶어 후보 그룹 형성
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b));
  };
  for (const n of normalized) parent.set(n.record.recordId, n.record.recordId);

  const pairScores = new Map<string, number>();
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const a = normalized[i];
      const b = normalized[j];
      if (a.norm.compactCore.length < 2 || b.norm.compactCore.length < 2) continue;
      const score = calculateProjectNameSimilarity(a.norm, b.norm);
      if (score >= opts.similarityThreshold) {
        union(a.record.recordId, b.record.recordId);
        pairScores.set(`${a.record.recordId}|${b.record.recordId}`, score);
      }
    }
  }

  const byRecord = new Map(normalized.map((n) => [n.record.recordId, n.record]));
  const clusters = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const list = clusters.get(root) ?? [];
    list.push(id);
    clusters.set(root, list);
  }

  const results: SubsidyRiskRuleResult[] = [];
  for (const [root, ids] of clusters) {
    if (ids.length < 2) continue;
    const recs = ids.map((id) => byRecord.get(id)).filter((r): r is SubsidyRiskInputRecord => Boolean(r));
    const maxScore = Math.max(
      0,
      ...Array.from(pairScores.entries())
        .filter(([k]) => k.split("|").every((id) => ids.includes(id)))
        .map(([, v]) => v)
    );
    const recipients = uniq(recs.map((r) => recipientKey(r)).filter((v): v is string => Boolean(v)));
    const sameRecipientRepeat = recipients.length === 1;
    const severity: SubsidyRiskSeverity =
      maxScore >= 0.95 || sameRecipientRepeat ? "high" : recs.length >= 3 ? "medium" : "low";

    results.push({
      ruleId: "similar_project_repeat",
      ruleName: SUBSIDY_RISK_RULE_NAMES.similar_project_repeat,
      severity,
      candidateId: `similar_project_repeat:${shortHash(root)}`,
      involvedRecordIds: recs.map((r) => r.recordId),
      evidenceRefs: uniq(recs.map(evidenceRefForRecord)),
      reason: `핵심 사업명 유사도 ${maxScore.toFixed(2)}(≥${opts.similarityThreshold})인 사업 ${recs.length}건이 묶임${
        sameRecipientRepeat ? " — 동일 수급기관 반복 신청 가능성" : ""
      } — 사업명 유사 반복 검토 후보.`,
      caution:
        "표준 명칭의 공모·정형 사업은 사업명이 비슷할 수 있고, 유사도는 확정 동일을 뜻하지 않습니다. 연도/차수가 다른 정상 연속 사업일 수 있습니다.",
      reviewRequired: true,
      notLegalConclusion: true,
      suggestedNextCheck: [
        "사업 목적·내용·산출물이 실제로 중복되는지 확인",
        "같은 사업을 여러 기관·연도에 분할 신청했는지 확인",
        "동일 결과물을 재활용해 정산했는지 확인(결과물 비교)"
      ]
    });
  }
  return results;
}

// ---------- 통합 실행 ----------

export function runSubsidyRiskRules(
  records: SubsidyRiskInputRecord[],
  options: SubsidyRiskRunOptions = {}
): SubsidyRiskRunResult {
  const similarityThreshold = options.similarityThreshold ?? 0.85;
  const amountAbsoluteThreshold = options.amountAbsoluteThreshold ?? 500_000_000;
  const amountStdMultiplier = options.amountStdMultiplier ?? 2;
  const topN = options.topN ?? 50;

  const ruleResults: SubsidyRiskRuleResult[] = [
    ...repeatRecipientRule(records),
    ...sameAddressRule(records),
    ...missingOutputSettlementRule(records),
    ...budgetAnomalyRule(records, { amountAbsoluteThreshold, amountStdMultiplier }),
    ...similarProjectRepeatRule(records, { similarityThreshold })
  ];

  const ruleCounts: SubsidyRiskRuleCount[] = (
    Object.keys(SUBSIDY_RISK_RULE_NAMES) as SubsidyRiskRuleId[]
  ).map((ruleId) => {
    const hits = ruleResults.filter((r) => r.ruleId === ruleId);
    return {
      ruleId,
      ruleName: SUBSIDY_RISK_RULE_NAMES[ruleId],
      candidateCount: hits.length,
      highSeverityCount: hits.filter((h) => h.severity === "high").length
    };
  });

  const topCandidates = buildTopCandidates(ruleResults, topN);

  return {
    runId: makeRunId(),
    ranAt: new Date().toISOString(),
    inputMode: options.inputMode ?? "input",
    isRealData: options.isRealData ?? false,
    totalRecords: records.length,
    totalRuleResults: ruleResults.length,
    ruleCounts,
    ruleResults,
    topCandidates,
    topN,
    safetyNotice: SUBSIDY_RISK_RULES_NOTICE
  };
}

/**
 * 룰 결과를 "연루 레코드 묶음" 단위로 합쳐 검토 후보 TOP N을 만든다.
 * 정렬 키: (1) 룰 적중 종류 수, (2) high 심각도 수, (3) 심각도 가중치 합, (4) 근거 수.
 * 이 점수는 룰 기반 정렬 보조 점수이며 100점 위험점수가 아니다.
 */
export function buildTopCandidates(
  ruleResults: SubsidyRiskRuleResult[],
  topN: number
): SubsidyRiskTopCandidate[] {
  // 후보 그룹 키: 연루 레코드 집합(정렬)을 해시. 룰이 겹치는 레코드면 같은 후보로 합친다.
  const groupByRecordRoot = new Map<string, SubsidyRiskRuleResult[]>();
  for (const rr of ruleResults) {
    const key = [...rr.involvedRecordIds].sort().join(",");
    const list = groupByRecordRoot.get(key) ?? [];
    list.push(rr);
    groupByRecordRoot.set(key, list);
  }

  const candidates: SubsidyRiskTopCandidate[] = [];
  for (const [key, list] of groupByRecordRoot) {
    const involvedRecordIds = uniq(list.flatMap((r) => r.involvedRecordIds));
    const ruleHits = uniq(list.map((r) => r.ruleId));
    const highSeverityCount = list.filter((r) => r.severity === "high").length;
    const severityWeightSum = list.reduce((sum, r) => sum + SEVERITY_WEIGHT[r.severity], 0);
    const evidenceRefCount = uniq(list.flatMap((r) => r.evidenceRefs)).length;
    // 룰 기반 정렬 점수(보조): 룰 다양성*10 + 심각도 가중치 합*3 + high*5 + 근거 수
    const ruleBasedScore =
      ruleHits.length * 10 + severityWeightSum * 3 + highSeverityCount * 5 + evidenceRefCount;
    candidates.push({
      candidateKey: shortHash(key),
      involvedRecordIds,
      ruleHits,
      ruleHitCount: ruleHits.length,
      highSeverityCount,
      evidenceRefCount,
      ruleBasedScore,
      reasonSummary: list
        .map((r) => SUBSIDY_RISK_RULE_NAMES[r.ruleId])
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(" · "),
      reviewRequired: true,
      notLegalConclusion: true
    });
  }

  candidates.sort(
    (a, b) =>
      b.ruleHitCount - a.ruleHitCount ||
      b.highSeverityCount - a.highSeverityCount ||
      b.ruleBasedScore - a.ruleBasedScore ||
      b.evidenceRefCount - a.evidenceRefCount ||
      a.candidateKey.localeCompare(b.candidateKey)
  );
  return candidates.slice(0, topN);
}

function makeRunId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}`;
  return `${stamp}-${shortHash(String(d.getTime() + Math.random()))}`;
}

// ---------- 산출물 쓰기 ----------

export interface SubsidyRiskWriteResult {
  runDir: string;
  ruleResultsFile: string;
  top50File: string;
  summaryMdFile: string;
  metadataFile: string;
}

export async function writeSubsidyRiskRun(
  baseDir: string,
  result: SubsidyRiskRunResult
): Promise<SubsidyRiskWriteResult> {
  const runDir = path.join(baseDir, "runs", result.runId);
  await mkdir(runDir, { recursive: true });

  const ruleResultsFile = path.join(runDir, "rule-results.json");
  const top50File = path.join(runDir, "top50-candidates.json");
  const summaryMdFile = path.join(runDir, "rule-summary.md");
  const metadataFile = path.join(runDir, "metadata.json");

  await writeFile(
    ruleResultsFile,
    JSON.stringify({ runId: result.runId, ranAt: result.ranAt, ruleResults: result.ruleResults }, null, 2),
    "utf8"
  );
  await writeFile(
    top50File,
    JSON.stringify(
      {
        runId: result.runId,
        ranAt: result.ranAt,
        topN: result.topN,
        note: "룰 기반 정렬 보조 점수 기준 상위 후보 — 100점 위험점수 아님, 사람 검토 필요.",
        topCandidates: result.topCandidates
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(summaryMdFile, buildSummaryMarkdown(result), "utf8");
  await writeFile(
    metadataFile,
    JSON.stringify(
      {
        runId: result.runId,
        ranAt: result.ranAt,
        inputMode: result.inputMode,
        isRealData: result.isRealData,
        totalRecords: result.totalRecords,
        totalRuleResults: result.totalRuleResults,
        topN: result.topN,
        ruleCounts: result.ruleCounts,
        safetyNotice: result.safetyNotice
      },
      null,
      2
    ),
    "utf8"
  );

  return { runDir, ruleResultsFile, top50File, summaryMdFile, metadataFile };
}

export function buildSummaryMarkdown(result: SubsidyRiskRunResult): string {
  const lines: string[] = [];
  lines.push("# 보조금 룰 5종 실행 요약 (검토 후보)");
  lines.push("");
  lines.push(`- runId: ${result.runId}`);
  lines.push(`- 실행시각: ${result.ranAt}`);
  lines.push(`- 입력모드: ${result.inputMode} (실데이터 추정: ${result.isRealData ? "예" : "아니오"})`);
  lines.push(`- 입력 레코드 수: ${result.totalRecords}`);
  lines.push(`- 룰 결과(후보) 수: ${result.totalRuleResults}`);
  lines.push(`- TOP N: ${result.topN}`);
  lines.push("");
  lines.push("> " + result.safetyNotice);
  lines.push("");
  lines.push("## 룰별 후보 수");
  lines.push("");
  lines.push("| 룰 | 후보 수 | high 심각도 |");
  lines.push("| --- | ---: | ---: |");
  for (const c of result.ruleCounts) {
    lines.push(`| ${c.ruleName} | ${c.candidateCount} | ${c.highSeverityCount} |`);
  }
  lines.push("");
  lines.push(`## 검토 후보 TOP ${Math.min(result.topN, result.topCandidates.length)} (룰 기반 정렬)`);
  lines.push("");
  lines.push("정렬 점수는 룰 기반 보조 점수이며 **100점 위험점수가 아닙니다.** 모든 항목은 사람 검토가 필요합니다.");
  lines.push("");
  lines.push("| 순위 | 후보키 | 적중 룰 | 룰수 | high | 점수 | 사유요약 |");
  lines.push("| ---: | --- | --- | ---: | ---: | ---: | --- |");
  result.topCandidates.forEach((c, i) => {
    lines.push(
      `| ${i + 1} | ${c.candidateKey} | ${c.ruleHits.join(", ")} | ${c.ruleHitCount} | ${c.highSeverityCount} | ${c.ruleBasedScore} | ${c.reasonSummary} |`
    );
  });
  lines.push("");
  lines.push("## 다음 단계");
  lines.push("");
  lines.push(
    "- 본 후보는 **사람 검토 필요** 목록입니다. 부정수급/위법 확정이 아닙니다."
  );
  lines.push(
    "- 다음 단계에서 이 룰 결과를 입력으로 100점 위험점수·보상가능성 점수·LLM 설명형 분석·근거검증(strict)을 진행합니다(이번 작업 범위 밖)."
  );
  return lines.join("\n");
}

export { SUBSIDY_RISK_RULES_NOTICE };
