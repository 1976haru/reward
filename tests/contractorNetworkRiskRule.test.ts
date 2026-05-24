import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  calculateContractAmountSimilarity,
  clampContractorNetworkRiskScore,
  createContractorNetworkRiskCandidate,
  generateContractorNetworkRiskReport,
  getContractorNetworkRiskLevel,
  groupEdgesByRecipientVendorPair,
  normalizeContractorNetworkEdge,
  writeContractorNetworkRiskReport
} from "../src/rules/contractorNetworkRiskRule.js";
import { ContractorNetworkEdge } from "../src/types/contractorNetworkRisk.js";
import { createContractorNetworkRiskFixtures } from "./fixtures/createContractorNetworkRiskFixtures.js";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

const PHONE_SAMPLE = ["010", "1234", "5678"].join("-");
const RRN_SAMPLE = ["900101", "1234567"].join("-");
const EMAIL_SAMPLE = ["test", "example.com"].join("@");
const ADDRESS_SAMPLE = ["서울시 테스트구", "상세로 123"].join(" ");
const PII_RAW = [PHONE_SAMPLE, RRN_SAMPLE, EMAIL_SAMPLE, ADDRESS_SAMPLE];
const BANNED_ASSERTIVE = [
  ["담합", "확정"],
  ["유착", "확정"],
  ["관계", "확정"],
  ["부정수급", "확정"],
  ["불법", "확정"],
  ["사기", "확정"]
].map((parts) => parts.join(" "));
const cleanupDirs: string[] = [];

let edges: ContractorNetworkEdge[];
let report: ReturnType<typeof generateContractorNetworkRiskReport>;

const findByEdgePrefix = (prefix: string) =>
  report.topCandidates.find((c) => c.evidence.some((e) => e.edgeId.startsWith(prefix)));
const signalCodes = (prefix: string) => findByEdgePrefix(prefix)?.networkSignals.map((s) => s.code) ?? [];

test("setup: fixture 1,000개 edge에서 계약업체 연관성 후보를 생성한다", async () => {
  edges = createContractorNetworkRiskFixtures(1000).edges;
  assert.equal(edges.length, 1000);
  report = generateContractorNetworkRiskReport(edges, { isRealData: false });
  const out = path.join(os.tmpdir(), `contractor-risk-${Date.now()}`);
  cleanupDirs.push(out);
  await writeContractorNetworkRiskReport(out, report);
});

test("TOP 후보 목록이 생성되고 50개 이하이다", () => {
  assert.ok(report.totalCandidates >= 1);
  assert.ok(report.topCandidates.length >= 1);
  assert.ok(report.topCandidates.length <= 50);
});

test("특정 수급단체계약업체 반복 연결 그룹이 high 또는 medium으로 탐지된다", () => {
  const candidate = findByEdgePrefix("pair_repeat_");
  assert.ok(candidate);
  assert.ok(candidate!.riskLevel === "high" || candidate!.riskLevel === "medium");
  assert.ok(candidate!.networkSignals.some((s) => s.code === "recipientVendorPairRepeated"));
});

test("같은 계약업체가 여러 사업에 반복 등장하는 신호가 점수에 반영된다", () => {
  assert.ok(signalCodes("project_repeat_").includes("vendorRepeatedAcrossProjects"));
});

test("같은 계약업체가 여러 수급단체와 반복 연결되는 신호가 점수에 반영된다", () => {
  assert.ok(signalCodes("recipient_repeat_").includes("vendorRepeatedAcrossRecipients"));
});

test("보조사업명과 계약명 유사 신호가 점수에 반영된다", () => {
  assert.ok(signalCodes("title_amount_").includes("projectContractTitleSimilar"));
});

test("같은 연도 또는 인접 연도 신호가 점수에 반영된다", () => {
  assert.ok(signalCodes("pair_repeat_").includes("sameOrAdjacentFiscalYear"));
});

test("계약금액 유사 신호가 점수에 반영된다", () => {
  assert.ok(calculateContractAmountSimilarity(10_000, 10_300) > 0.9);
  assert.ok(signalCodes("title_amount_").includes("similarContractAmount"));
});

test("같은 발주기관 반복 신호와 evidenceUrl/sourceUrl 신호가 점수에 반영된다", () => {
  assert.ok(signalCodes("agency_repeat_").includes("orderingAgencyRepeated"));
  assert.ok(report.topCandidates.some((c) => c.networkSignals.some((s) => s.code === "evidenceUrlPresent")));
});

test("사업자번호/법인번호는 해시 필드만 사용된다", () => {
  const blob = JSON.stringify(report);
  assert.ok(blob.includes("businessNumberHashMatch") || blob.includes("corporateNumberHashMatch"));
  assert.ok(!/businessRegistrationNumber"\s*:/.test(blob));
  assert.ok(!/corporateRegistrationNumber"\s*:/.test(blob));
});

test("대표자명전화번호상세주소 원문을 단독 기준으로 쓰지 않는다", () => {
  const edge = normalizeContractorNetworkEdge({
    edgeId: "pii_edge",
    subsidyRecordId: "pii_subsidy",
    recipientName: `개인정보 ${PHONE_SAMPLE} ${EMAIL_SAMPLE}`,
    contractorName: `상세주소 계약업체 ${ADDRESS_SAMPLE}`,
    contractTitle: "검증 계약"
  });
  const candidate = createContractorNetworkRiskCandidate([edge], [edge], { minScore: 0 });
  assert.ok(candidate);
  assert.equal(candidate!.riskScore < 40, true);
  const blob = JSON.stringify(candidate);
  for (const raw of PII_RAW) assert.ok(!blob.includes(raw), `PII found: ${raw}`);
});

test("riskScore는 0~100 범위이고 riskLevel 기준에 맞다", () => {
  assert.equal(clampContractorNetworkRiskScore(200), 100);
  assert.equal(clampContractorNetworkRiskScore(-1), 0);
  assert.equal(getContractorNetworkRiskLevel(80), "high");
  assert.equal(getContractorNetworkRiskLevel(60), "medium");
  assert.equal(getContractorNetworkRiskLevel(40), "low");
  assert.equal(getContractorNetworkRiskLevel(39), "minimal");
  for (const candidate of report.topCandidates) {
    assert.ok(candidate.riskScore >= 0 && candidate.riskScore <= 100);
    assert.equal(candidate.riskLevel, getContractorNetworkRiskLevel(candidate.riskScore));
  }
});

test("evidence와 reason에 개인정보 원문이 들어가지 않는다", () => {
  for (const candidate of report.topCandidates) {
    const blob = JSON.stringify(candidate.evidence) + candidate.reason;
    for (const raw of PII_RAW) assert.ok(!blob.includes(raw), `PII found: ${raw}`);
  }
});

test("reason에 단정 표현이 없고 reviewRequired는 항상 true다", () => {
  for (const candidate of report.topCandidates) {
    for (const banned of BANNED_ASSERTIVE) assert.ok(!candidate.reason.includes(banned));
    assert.equal(candidate.reviewRequired, true);
  }
});

test("contractor-network-risk-report.json 및 md가 생성된다", async () => {
  const json = JSON.parse(await readFile(report.reportJsonFile!, "utf8"));
  const md = await readFile(report.reportMdFile!, "utf8");
  assert.equal(json.runId, report.runId);
  assert.ok(md.includes("계약업체 연관성 후보") || md.includes("반복 연결 검토 후보"));
});

test("CLI가 --fixture 1000으로 실행된다", async () => {
  const out = path.join(os.tmpdir(), `contractor-cli-${Date.now()}`);
  cleanupDirs.push(out);
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "scripts", "run-contractor-network-risk-rule.ts"), "--fixture", "1000"],
    { cwd: ROOT, env: { ...process.env, RISK_OUTPUT_DIR: out } }
  );
  assert.ok(stdout.includes("CONTRACTOR_NETWORK_RISK_RUN_OK"));
  assert.ok(stdout.includes("totalEdges"));
  assert.ok(stdout.includes("totalCandidates"));
  assert.ok(stdout.includes("topCandidates"));
  assert.ok(stdout.includes("fixture 기반 검증"));
});

test("결과 제목과 문구가 후보/검토 필요로 되어 있고 반복 연결만으로 단정하지 않는다", () => {
  const mdTitle = report.notes.join(" ");
  assert.ok(mdTitle.includes("계약업체 연관성 후보") || mdTitle.includes("반복 연결 검토 후보"));
  for (const banned of BANNED_ASSERTIVE) assert.ok(!JSON.stringify(report).includes(banned));
});

test("무관한 edge 그룹은 낮은 점수 또는 후보 제외된다", () => {
  const groups = groupEdgesByRecipientVendorPair(edges);
  const baseGroup = groups.get("pair:recipient:base0|name:basevendor0")!;
  const candidate = createContractorNetworkRiskCandidate(baseGroup, edges, { minScore: 0 });
  assert.ok(candidate);
  assert.ok(candidate!.riskScore < 40);
  assert.ok(!report.topCandidates.some((c) => c.evidence.some((e) => e.edgeId === "base_0")));
});

test("networkSignals/evidence/reason/reviewRequired 필드를 포함한다", () => {
  for (const candidate of report.topCandidates) {
    assert.ok(Array.isArray(candidate.networkSignals));
    assert.ok(Array.isArray(candidate.evidence));
    assert.equal(typeof candidate.reason, "string");
    assert.equal(candidate.reviewRequired, true);
  }
});

async function main(): Promise<void> {
  let passed = 0;
  let failed = 0;
  const failures: Array<{ name: string; error: unknown }> = [];
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  OK   ${t.name}`);
    } catch (error) {
      failed++;
      failures.push({ name: t.name, error });
      console.error(`  FAIL ${t.name}`);
      console.error(error);
    }
  }
  for (const d of cleanupDirs) await rm(d, { recursive: true, force: true }).catch(() => {});
  console.log(`\nContractorNetworkRiskRule tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
