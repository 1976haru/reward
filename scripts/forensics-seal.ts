/**
 * forensics:seal — 사람(검토자) 주도 L2 포렌식 봉인 CLI.
 *
 * 이미 캡처된 케이스(data/evidence/<caseId>/manifest.json 존재)에 대해
 * 변조 감지 포렌식 매니페스트 + 11점 진술서를 생성하고, 선택적으로 Bitcoin
 * OpenTimestamps 앵커링을 수행한다.
 *
 * 사용법:
 *   # 1) 진술서 답변 템플릿 생성 (11문항)
 *   npm run forensics:seal -- <caseId> --init
 *
 *   # 2) 템플릿(forensics-attestation.<caseId>.json)을 직접 yes/no/na 로 채운 뒤 봉인
 *   npm run forensics:seal -- <caseId> --answers forensics-attestation.<caseId>.json \
 *     --statement "본인이 2026-05-29 14:00 KST 에 위 URL 을 직접 브라우저로 확인함." --stamp
 *
 *   # (개발용) 11문항 모두 yes 로 채워 빠르게 검증 — 운영 사용 금지
 *   npm run forensics:seal -- <caseId> --all-yes --statement "..."
 *
 * REVIEWER_NAME 환경변수(.env)가 attestation.json 의 reviewerId 로 기록된다.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { EvidenceService, isSafeCaseId } from "../src/services/EvidenceService.js";
import { ELEVEN_POINT_FACT_CHECKS, blankAttestationChecks } from "../src/forensics/index.js";
import { config } from "../src/utils/config.js";

const PLACEHOLDER_REVIEWER = "본인이름_또는_핸들";
type Answer = "yes" | "no" | "na";
interface CheckAnswer {
  question: string;
  answer: Answer;
  note?: string;
}

function parseArgs(argv: readonly string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function fail(msg: string): never {
  console.error(`[seal] ERROR: ${msg}`);
  process.exit(1);
}

async function writeTemplate(caseId: string, outPath: string): Promise<void> {
  const template: CheckAnswer[] = ELEVEN_POINT_FACT_CHECKS.map((q) => ({
    question: q,
    answer: "na", // 검토자가 yes/no/na 로 교체
    note: "",
  }));
  await fs.writeFile(outPath, JSON.stringify(template, null, 2), "utf8");
  console.log(`[seal] 진술서 템플릿 작성: ${outPath}`);
  console.log(`[seal] 11개 항목의 "answer" 를 yes/no/na 로 직접 채운 뒤 --answers ${outPath} 로 다시 실행하세요.`);
}

async function loadAnswers(answersPath: string): Promise<CheckAnswer[]> {
  let raw: string;
  try {
    raw = await fs.readFile(answersPath, "utf8");
  } catch {
    fail(`answers 파일을 읽을 수 없습니다: ${answersPath} (먼저 --init 으로 템플릿을 만드세요)`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    fail(`answers 파일 JSON 파싱 실패: ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) fail("answers 파일은 배열이어야 합니다.");
  if (parsed.length !== ELEVEN_POINT_FACT_CHECKS.length) {
    fail(`answers 항목 수가 ${ELEVEN_POINT_FACT_CHECKS.length} 개여야 합니다 (현재 ${parsed.length}).`);
  }
  const checks: CheckAnswer[] = [];
  for (const item of parsed as CheckAnswer[]) {
    if (!item || typeof item.question !== "string" || !["yes", "no", "na"].includes(item.answer)) {
      fail(`잘못된 항목: ${JSON.stringify(item)} (answer 는 yes/no/na)`);
    }
    checks.push({ question: item.question, answer: item.answer, note: item.note });
  }
  return checks;
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const caseId = positional[0];

  if (!caseId || flags.help) {
    console.log("usage: npm run forensics:seal -- <caseId> [--init] [--answers <file>] [--statement <text>] [--stamp] [--all-yes]");
    process.exit(caseId ? 0 : 1);
  }
  if (!isSafeCaseId(caseId)) fail(`잘못된 caseId: ${caseId}`);

  // --init: 템플릿만 생성하고 종료
  if (flags.init) {
    const outPath = typeof flags.init === "string" ? flags.init : `forensics-attestation.${caseId}.json`;
    await writeTemplate(caseId, outPath);
    return;
  }

  // reviewerId 검증 (.env REVIEWER_NAME)
  const reviewerId = process.env.REVIEWER_NAME?.trim() ?? "";
  if (!reviewerId) fail("REVIEWER_NAME 가 .env 에 설정되어 있지 않습니다.");
  if (reviewerId === PLACEHOLDER_REVIEWER) {
    fail(`REVIEWER_NAME 가 아직 플레이스홀더(${PLACEHOLDER_REVIEWER})입니다. 실제 이름/핸들로 교체하세요.`);
  }

  // statement 검증
  const statement = typeof flags.statement === "string" ? flags.statement : "";
  if (statement.trim().length < 10) {
    fail("--statement 진술문이 필요합니다 (최소 10자). 예: \"본인이 위 URL 을 직접 확인함.\"");
  }

  // checks 확보
  let checks: CheckAnswer[];
  if (flags["all-yes"]) {
    console.warn("[seal] ⚠ --all-yes: 11문항을 모두 'yes' 로 채웁니다. 운영 사용 금지 (검증/개발 전용).");
    checks = blankAttestationChecks().map((c) => ({ ...c }));
  } else if (typeof flags.answers === "string") {
    checks = await loadAnswers(flags.answers);
  } else {
    fail("--answers <file> 또는 --all-yes 중 하나가 필요합니다. (--init 으로 템플릿 생성)");
  }

  const stamp = Boolean(flags.stamp);
  const evidence = new EvidenceService();

  console.log(`[seal] caseId=${caseId} reviewer=${reviewerId} stamp=${stamp}`);
  let result;
  try {
    result = await evidence.sealForensics(caseId, { reviewerId, statement, checks, stamp });
  } catch (e) {
    const msg = (e as NodeJS.ErrnoException).code === "ENOENT"
      ? `케이스 증거를 찾을 수 없습니다 (${path.join(config.evidenceDir, caseId, "manifest.json")}). 먼저 케이스를 수집/분석하세요.`
      : (e as Error).message;
    fail(msg);
  }

  console.log("[seal] ✅ 봉인 완료");
  console.log(`  forensic manifest : ${result.manifestPath}`);
  console.log(`  manifestSha256    : ${result.manifestSha256}`);
  console.log(`  attestation       : ${result.attestation.attestationFile} (${result.attestation.attestationSha256.slice(0, 16)}…)`);
  console.log(`  stamped (OTS)     : ${result.stamped}`);
  if (stamp) {
    console.log("[seal] 24~48시간 뒤 `npm run forensics:ots:verify` 로 confirmed 확인하세요.");
  } else {
    console.log("[seal] OTS 앵커링을 원하면 --stamp 플래그로 다시 실행하세요.");
  }
  console.log("[seal] 제출 번들 생성: `npm run forensics:bundle`");
}

main().catch((e) => fail((e as Error).message));
