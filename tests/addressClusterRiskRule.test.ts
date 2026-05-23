// 동일 주소 다수 단체 탐지 룰 테스트 (체크리스트 18 — 필수 작업 6).
//
// 실행: `npm run test:risk-address-cluster` (tsx). node:assert/strict 만 사용.
// 모든 fixture 는 가짜 데이터다. 결과는 "동일 주소 다수 단체 후보"이며 위법 여부 판단이 아니다.

import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createAddressClusterRiskFixtures } from "./fixtures/createAddressClusterRiskFixtures.js";
import {
  countDistinctRecipients,
  detectPublicFacilityHints,
  generateAddressClusterRiskReport,
  getAddressClusterRiskLevel,
  groupRecordsByAddress,
  writeAddressClusterRiskReport
} from "../src/rules/addressClusterRiskRule.js";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

const PII_RAW = ["010-1234-5678", "010-9876-5432", "900101-1234567", "test@example.com"];
const cleanupDirs: string[] = [];

let report: ReturnType<typeof generateAddressClusterRiskReport>;

function findGroup(key: string) {
  return report.topCandidates.find((c) => c.addressGroupKey === key);
}

// ---------- 단위 ----------

test("getAddressClusterRiskLevel: 점수 구간", () => {
  assert.equal(getAddressClusterRiskLevel(90), "high");
  assert.equal(getAddressClusterRiskLevel(65), "medium");
  assert.equal(getAddressClusterRiskLevel(45), "low");
  assert.equal(getAddressClusterRiskLevel(10), "minimal");
});

test("groupRecordsByAddress / countDistinctRecipients", () => {
  const { records } = createAddressClusterRiskFixtures(1000);
  const g = groupRecordsByAddress(records, "normalizedAddressKey");
  const addrA = g.get("경기도수원시팔달구효원로1");
  assert.ok(addrA && countDistinctRecipients(addrA) >= 4, "addrA 단체 수 부족");
});

test("detectPublicFacilityHints: 복지관/회관/센터 키워드 탐지", () => {
  const { records } = createAddressClusterRiskFixtures(1000);
  const f = groupRecordsByAddress(records, "normalizedAddressKey").get("경기도고양시일산동구중앙로100")!;
  const hints = detectPublicFacilityHints(f);
  assert.ok(hints.length >= 1, "공공시설 힌트 미탐지");
});

// ---------- 리포트 ----------

test("[setup] fixture 1,000건에서 동일 주소 다수 단체 후보 + 리포트 생성", async () => {
  const { records } = createAddressClusterRiskFixtures(1000);
  assert.equal(records.length, 1000);
  report = generateAddressClusterRiskReport(records, { isRealData: false });
  const out = path.join(os.tmpdir(), `ac-test-${Date.now()}`);
  cleanupDirs.push(out);
  await writeAddressClusterRiskReport(out, report);
});

test("1. 동일 주소 다수 단체 후보를 생성한다 / 2. TOP 목록 / 3. <= 50", () => {
  assert.ok(report.totalCandidates >= 1);
  assert.ok(report.topCandidates.length >= 1);
  assert.ok(report.topCandidates.length <= 50);
});

test("4. 동일 normalizedAddressKey 다수 단체 그룹이 high 또는 medium 으로 탐지된다", () => {
  const a = findGroup("addr:경기도수원시팔달구효원로1");
  assert.ok(a, "addrA 후보 없음");
  assert.ok(a!.riskLevel === "high" || a!.riskLevel === "medium", `addrA 등급 낮음: ${a!.riskLevel}`);
  assert.equal(a!.addressKeyType, "normalizedAddressKey");
});

test("5. addressRegionKey 만 같은 그룹은 normalizedAddressKey 그룹보다 낮은 점수", () => {
  const a = findGroup("addr:경기도수원시팔달구효원로1");
  const r = findGroup("region:경기도성남시분당구정자로");
  assert.ok(a && r, "addr/region 후보 누락");
  assert.equal(r!.addressKeyType, "addressRegionKey");
  assert.ok(r!.riskScore < a!.riskScore, `region(${r!.riskScore}) >= addr(${a!.riskScore})`);
});

test("6. distinctRecipientCount 가 점수에 반영된다", () => {
  const a = findGroup("addr:경기도수원시팔달구효원로1")!;
  assert.ok(a.distinctRecipientCount >= 4);
  assert.ok(a.matchedSignals.some((s) => s.code === "DISTINCT_RECIPIENTS"));
});

test("7. repeatedYearCount(여러 연도)가 점수에 반영된다", () => {
  const a = findGroup("addr:경기도수원시팔달구효원로1")!;
  assert.ok(a.fiscalYears.length >= 2);
  assert.ok(a.matchedSignals.some((s) => s.code === "REPEATED_YEARS"));
});

test("8. similarProjectCount(유사 사업명)가 점수에 반영된다", () => {
  // addrA 는 동일 projectNameCompactKey(청년문화활동지원사업)가 반복됨
  const a = findGroup("addr:경기도수원시팔달구효원로1")!;
  assert.ok(a.matchedSignals.some((s) => s.code === "SIMILAR_PROJECTS"));
});

test("9. totalSubsidyAmount 가 점수에 반영된다", () => {
  const a = findGroup("addr:경기도수원시팔달구효원로1")!;
  assert.ok(a.totalSubsidyAmount > 0);
  assert.ok(a.matchedSignals.some((s) => s.code === "TOTAL_AMOUNT"));
});

test("10. evidenceCoverage 가 점수에 반영된다", () => {
  const a = findGroup("addr:경기도수원시팔달구효원로1")!;
  assert.ok(a.matchedSignals.some((s) => s.code === "EVIDENCE_COVERAGE"));
});

test("11. publicFacilityHint 가 cautionNotes 에 반영된다", () => {
  const f = findGroup("addr:경기도고양시일산동구중앙로100");
  assert.ok(f, "facility 후보 없음");
  assert.ok(f!.cautionNotes.length >= 1, "cautionNotes 없음");
  assert.ok(f!.matchedSignals.some((s) => s.code === "PUBLIC_FACILITY_HINT"));
});

test("12. 공유오피스/복지관 힌트가 있을 때 단정 표현 없이 주의 문구가 생성된다", () => {
  const f = findGroup("addr:경기도고양시일산동구중앙로100")!;
  const joined = f.cautionNotes.join(" ");
  assert.ok(joined.includes("합리적 사유 가능성"), "합리적 사유 문구 없음");
  for (const b of ["부정수급 확정", "위장 단체", "허위 단체", "불법", "사기"]) {
    assert.ok(!joined.includes(b), `cautionNotes 단정 표현: ${b}`);
  }
});

test("13. 대표자명/전화번호 원문을 단독 기준으로 쓰지 않는다 (signal 미존재)", () => {
  // 신호 코드에 대표자/전화 단독 신호가 없으며, 점수는 주소/단체/사업/연도/금액 기반.
  const allCodes = new Set<string>();
  for (const c of report.topCandidates) for (const s of c.matchedSignals) allCodes.add(s.code);
  assert.ok(!Array.from(allCodes).some((c) => /REPRESENTATIVE|PHONE|REP_NAME/i.test(c)));
});

test("14. groupKey 에 상세주소/개인정보 원문이 들어가지 않는다", () => {
  for (const c of report.topCandidates) {
    assert.ok(/^(addr|region):/.test(c.addressGroupKey));
    for (const raw of PII_RAW) assert.ok(!c.addressGroupKey.includes(raw), `groupKey PII: ${raw}`);
  }
});

test("15. riskScore 는 0~100 / 16. riskLevel 이 기준에 맞다", () => {
  for (const c of report.topCandidates) {
    assert.ok(c.riskScore >= 0 && c.riskScore <= 100);
    assert.equal(c.riskLevel, getAddressClusterRiskLevel(c.riskScore));
  }
});

test("17. reason 에 단정 표현이 없다 / 18. reviewRequired 항상 true", () => {
  const banned = ["부정수급 확정", "위장 단체", "허위 단체", "불법", "사기", "동일 주소 확정"];
  for (const c of report.topCandidates) {
    for (const b of banned) assert.ok(!c.reason.includes(b), `reason 단정 표현: ${b}`);
    assert.equal(c.reviewRequired, true);
  }
});

test("19. report.json / 20. report.md 가 생성되고 제목이 '동일 주소 다수 단체'", async () => {
  const j = JSON.parse(await readFile(report.reportJsonFile!, "utf8"));
  assert.equal(j.runId, report.runId);
  const md = await readFile(report.reportMdFile!, "utf8");
  assert.ok(md.includes("동일 주소 다수 단체"));
});

test("개인정보 원문이 리포트(json/md)에 남지 않는다", async () => {
  const j = await readFile(report.reportJsonFile!, "utf8");
  const md = await readFile(report.reportMdFile!, "utf8");
  for (const raw of PII_RAW) {
    assert.ok(!j.includes(raw), `report.json PII: ${raw}`);
    assert.ok(!md.includes(raw), `report.md PII: ${raw}`);
  }
});

test("23. 무관한 주소 그룹(base_*)은 후보에서 제외된다", () => {
  const baseOnly = report.topCandidates.filter((c) =>
    c.involvedRecordIds.every((id) => id.startsWith("base_"))
  );
  assert.equal(baseOnly.length, 0, "무관 base 그룹이 후보로 산출됨");
});

// ---------- 21. CLI ----------

test("21. CLI 가 --fixture 1000 으로 실행되고 ADDRESS_CLUSTER_RISK_RUN_OK 를 출력한다", async () => {
  const cliOut = path.join(os.tmpdir(), `ac-cli-${Date.now()}`);
  cleanupDirs.push(cliOut);
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "scripts", "run-address-cluster-risk-rule.ts"), "--fixture", "1000"],
    { env: { ...process.env, RISK_OUTPUT_DIR: cliOut }, cwd: ROOT }
  );
  assert.ok(stdout.includes("ADDRESS_CLUSTER_RISK_RUN_OK"), "RUN_OK 누락");
  assert.ok(stdout.includes("totalAddressGroups"));
  assert.ok(stdout.includes("topCandidates"));
  assert.ok(stdout.includes("fixture 기반 검증"), "fixture 안내 누락");
  for (const raw of PII_RAW) assert.ok(!stdout.includes(raw), `CLI 출력 PII: ${raw}`);
});

// ---------- 러너 ----------

async function main() {
  let passed = 0;
  let failed = 0;
  const failures: Array<{ name: string; error: unknown }> = [];
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  OK   ${t.name}`);
    } catch (err) {
      failed++;
      failures.push({ name: t.name, error: err });
      console.error(`  FAIL ${t.name}`);
      console.error(err);
    }
  }
  for (const d of cleanupDirs) await rm(d, { recursive: true, force: true }).catch(() => {});
  console.log(`\nAddressClusterRiskRule tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
