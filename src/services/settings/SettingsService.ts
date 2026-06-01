/**
 * SettingsService — 공익레이더 실행 환경 / 설정 상태 조회 전용 서비스.
 *
 * 안전 원칙:
 * - API 키 원문 (OPENAI_API_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET) 은 절대 응답에 포함하지 않는다.
 *   `configured` boolean 만 노출하며, 일부 마스킹조차 제공하지 않는다.
 * - 외부 신고기관 자동 제출 / 자동 로그인 / 포상금 신청을 자동화하는 설정은 노출하지 않는다.
 * - 이 화면은 상태 조회 전용이며, 설정 변경 기능은 제공하지 않는다.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "../../utils/config.js";

export type RuntimeMode = "MOCK" | "MIXED" | "REAL_READY";

export type ReadinessStage =
  | "SETUP_REQUIRED"
  | "MOCK_VALIDATION"
  | "MANUAL_URL_TEST"
  | "API_KEY_REQUIRED"
  | "REAL_DATA_TEST"
  | "HUMAN_REVIEW_READY"
  | "OPERATION_READY";

export interface SettingsAppInfo {
  name: string;
  version: string;
  environment: string;
  port: number;
}

export interface SettingsRuntimeMode {
  runtimeMode: RuntimeMode;
  label: string;
  mockAi: boolean;
  mockScout: boolean;
  useDb: boolean;
  nodeEnv: string;
  scoutMode: "mock" | "real";
}

export interface SettingsApiConnectionEntry {
  configured: boolean;
  mock: boolean;
  label: string;
}

export interface SettingsApiConnections {
  openai: SettingsApiConnectionEntry;
  naver: SettingsApiConnectionEntry;
}

/**
 * 단일 환경변수 상태 항목.
 * - 시크릿(키)은 present(=설정됨/미설정) 만 노출하고 원문/일부 마스킹은 절대 노출하지 않는다.
 * - on/off 형 플래그는 enabled 로 노출한다.
 */
export interface SettingsEnvFlag {
  key: string;
  present?: boolean;
  enabled?: boolean;
  label: string;
  isSecret: boolean;
}

/**
 * 초보자가 ".env 를 직접 열지 않고도" 현재 안전 설정을 확인할 수 있는 점검 목록.
 * 체크리스트 8번에서 요구한 항목을 환경변수 키 기준으로 그대로 노출한다.
 */
export interface SettingsEnvStatus {
  runtimeMode: RuntimeMode;
  openaiApiKey: SettingsEnvFlag;
  naverClientId: SettingsEnvFlag;
  naverClientSecret: SettingsEnvFlag;
  evidenceScreenshot: SettingsEnvFlag;
  evidencePdf: SettingsEnvFlag;
  schedulerEnabled: SettingsEnvFlag;
  privacyDryRun: SettingsEnvFlag;
}

/** 초보자용 안전 안내 한 줄. tone 에 따라 UI 색상이 달라진다. */
export interface SettingsSetupNotice {
  tone: "safe" | "info" | "warn";
  text: string;
}

export interface SettingsScheduler {
  enabled: boolean;
  cron: string;
  timezone: string;
  mode: string;
  topics: string[];
  sources: string[];
  maxCandidates: number;
}

export interface SettingsPrivacy {
  maskingEnabled: boolean;
  dryRun: boolean;
  retentionDays: {
    default: number;
    trace: number;
    evidence: number;
    report: number;
    feedback: number;
    case: number;
  };
}

export interface SettingsStorage {
  dataDir: string;
  evidenceDir: string;
  reportsDir: string;
  traceDir: string;
  feedbackDir: string;
  outcomeDir: string;
  evalDir: string;
}

export interface SettingsSafety {
  autoSubmitAllowed: false;
  humanReviewRequired: true;
  manualSubmissionRecordOnly: true;
  approvalGate: "enabled";
  notes: string[];
}

export interface SettingsReadiness {
  stage: ReadinessStage;
  label: string;
  blockingItems: string[];
  nextActions: string[];
}

export interface SettingsPayload {
  schemaVersion: "1.0.0";
  generatedAt: string;
  app: SettingsAppInfo;
  runtime: SettingsRuntimeMode;
  apiConnections: SettingsApiConnections;
  envStatus: SettingsEnvStatus;
  setupNotices: SettingsSetupNotice[];
  scheduler: SettingsScheduler;
  privacy: SettingsPrivacy;
  storage: SettingsStorage;
  safety: SettingsSafety;
  readiness: SettingsReadiness;
  safetyNotice: string;
}

export const SETTINGS_SAFETY_NOTICE =
  "설정 화면은 상태만 표시하며 API 키 원문을 표시하지 않습니다. 외부 신고기관 자동 제출 기능은 제공하지 않습니다.";

const PRODUCT_DISPLAY_NAME = process.env.PRODUCT_DISPLAY_NAME?.trim() || "애드세이프(AdSafe)";
const FALLBACK_APP_VERSION = "0.1.0";

let cachedVersion: string | null = null;
function readPackageVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const raw = readFileSync(path.join(process.cwd(), "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      cachedVersion = parsed.version;
      return cachedVersion;
    }
  } catch {
    /* fallback */
  }
  cachedVersion = FALLBACK_APP_VERSION;
  return cachedVersion;
}

/**
 * maskSecretStatusOnly — 임의의 시크릿 값이 들어오면 절대 원문/일부를 노출하지 않고
 * configured 상태만 반환한다. 일부 마스킹 (예: "sk-***xxx") 표현도 제공하지 않는다.
 */
export function maskSecretStatusOnly(value: string | undefined | null): { configured: boolean } {
  if (typeof value !== "string") return { configured: false };
  return { configured: value.trim().length > 0 };
}

function buildAppInfo(): SettingsAppInfo {
  return {
    name: PRODUCT_DISPLAY_NAME,
    version: readPackageVersion(),
    environment: config.env,
    port: config.port
  };
}

function buildRuntimeMode(): {
  runtime: SettingsRuntimeMode;
  openaiConfigured: boolean;
  naverConfigured: boolean;
} {
  const mockAi = config.mockAi === true;
  const mockScout = config.scout.mock === true;
  const openaiHasKey = maskSecretStatusOnly(config.openaiApiKey).configured;
  const naverHasId = maskSecretStatusOnly(config.scout.naverClientId).configured;
  const naverHasSecret = maskSecretStatusOnly(config.scout.naverClientSecret).configured;

  const openaiConfigured = !mockAi && openaiHasKey;
  const naverConfigured = !mockScout && naverHasId && naverHasSecret;

  let runtimeMode: RuntimeMode;
  if (openaiConfigured && naverConfigured) runtimeMode = "REAL_READY";
  else if (openaiConfigured || naverConfigured) runtimeMode = "MIXED";
  else runtimeMode = "MOCK";

  const label =
    runtimeMode === "REAL_READY"
      ? "실전 키 설정 완료 (사람 검토 후 직접 신고)"
      : runtimeMode === "MIXED"
        ? "일부 실제 키 + Mock 혼합 (사람 검증 필요)"
        : "Mock 검증 단계";

  return {
    runtime: {
      runtimeMode,
      label,
      mockAi,
      mockScout,
      useDb: config.useDb === true,
      nodeEnv: config.env,
      scoutMode: mockScout ? "mock" : "real"
    },
    openaiConfigured,
    naverConfigured
  };
}

function buildApiConnectionStatus(args: {
  openaiConfigured: boolean;
  naverConfigured: boolean;
}): SettingsApiConnections {
  const { openaiConfigured, naverConfigured } = args;
  return {
    openai: {
      configured: openaiConfigured,
      mock: !openaiConfigured,
      label: openaiConfigured ? "연결됨" : "미연결"
    },
    naver: {
      configured: naverConfigured,
      mock: !naverConfigured,
      label: naverConfigured ? "연결됨" : "미연결"
    }
  };
}

/**
 * buildEnvStatus — 초보자 설정 점검 카드용. 환경변수 값을 읽되 undefined 여도 죽지 않게
 * config 의 기본값/parseBool 을 그대로 사용한다. 시크릿은 present 만 노출한다.
 */
function buildEnvStatus(runtimeMode: RuntimeMode): SettingsEnvStatus {
  const openaiPresent = maskSecretStatusOnly(config.openaiApiKey).configured;
  const naverIdPresent = maskSecretStatusOnly(config.scout.naverClientId).configured;
  const naverSecretPresent = maskSecretStatusOnly(config.scout.naverClientSecret).configured;

  const secretFlag = (key: string, present: boolean): SettingsEnvFlag => ({
    key,
    present,
    label: present ? "설정됨" : "미설정",
    isSecret: true
  });
  const boolFlag = (key: string, enabled: boolean): SettingsEnvFlag => ({
    key,
    enabled,
    label: enabled ? "true (켜짐)" : "false (꺼짐)",
    isSecret: false
  });

  return {
    runtimeMode,
    openaiApiKey: secretFlag("OPENAI_API_KEY", openaiPresent),
    naverClientId: secretFlag("NAVER_CLIENT_ID", naverIdPresent),
    naverClientSecret: secretFlag("NAVER_CLIENT_SECRET", naverSecretPresent),
    evidenceScreenshot: boolFlag("EVIDENCE_ENABLE_SCREENSHOT", config.evidence.enableScreenshot === true),
    evidencePdf: boolFlag("EVIDENCE_ENABLE_PDF", config.evidence.enablePdf === true),
    schedulerEnabled: boolFlag("SCHEDULER_ENABLED", config.scheduler.enabled === true),
    privacyDryRun: boolFlag("PRIVACY_DRY_RUN", config.privacy.dryRun === true)
  };
}

/**
 * buildSetupNotices — 초보자가 바로 이해할 수 있는 한국어 안전 안내 문구.
 * 현재 설정값에 따라 동적으로 생성한다.
 */
function buildSetupNotices(runtimeMode: RuntimeMode): SettingsSetupNotice[] {
  const notices: SettingsSetupNotice[] = [];

  if (runtimeMode === "MOCK") {
    notices.push({ tone: "safe", text: "현재는 Mock 모드입니다. 실제 AI 비용이 발생하지 않습니다." });
  } else if (runtimeMode === "MIXED") {
    notices.push({ tone: "info", text: "현재는 일부 실제 키 + Mock 혼합 모드입니다. 실제 API 비용이 일부 발생할 수 있습니다." });
  } else {
    notices.push({ tone: "info", text: "현재는 실제 키가 연결된 모드입니다. 실제 API 비용이 발생할 수 있으니 사람이 먼저 확인하세요." });
  }

  notices.push({ tone: "safe", text: "자동신고 기능은 없습니다. 실제 신고는 사용자가 공식 창구에서 직접 해야 합니다." });
  notices.push({ tone: "safe", text: "모든 신고 후보는 사람 검토가 필수이며, 제출 결과는 수동 기록만 가능합니다." });
  notices.push({ tone: "safe", text: "API 키 원문은 화면에 표시하지 않습니다. (설정됨 / 미설정 만 표시)" });

  const captureOn = config.evidence.enableScreenshot === true || config.evidence.enablePdf === true;
  if (captureOn) {
    notices.push({ tone: "info", text: "증거 캡처(스크린샷/PDF)가 켜져 있습니다. 공개 페이지만 분석하세요." });
  } else {
    notices.push({ tone: "info", text: "증거 캡처는 현재 꺼져 있습니다." });
  }

  if (config.privacy.dryRun === true) {
    notices.push({ tone: "safe", text: "개인정보 처리는 dry-run(미적용 미리보기) 기본값입니다. 실제 삭제 전 사람이 확인합니다." });
  } else {
    notices.push({ tone: "warn", text: "PRIVACY_DRY_RUN 이 꺼져 있습니다. 실데이터 검증 전에는 dry-run 사용을 권장합니다." });
  }

  return notices;
}

function buildSchedulerSettings(): SettingsScheduler {
  return {
    enabled: config.scheduler.enabled === true,
    cron: config.scheduler.cron,
    timezone: config.scheduler.timezone,
    mode: String(config.scheduler.mode ?? "standard"),
    topics: Array.isArray(config.scheduler.topics) ? config.scheduler.topics.slice() : [],
    sources: Array.isArray(config.scheduler.sources) ? config.scheduler.sources.slice() : [],
    maxCandidates: Number(config.scheduler.maxCandidates ?? 0)
  };
}

function buildPrivacySettings(): SettingsPrivacy {
  return {
    maskingEnabled: config.privacy.maskingEnabled === true,
    dryRun: config.privacy.dryRun === true,
    retentionDays: {
      default: config.privacy.retentionDays.default,
      trace: config.privacy.retentionDays.trace,
      evidence: config.privacy.retentionDays.evidence,
      report: config.privacy.retentionDays.report,
      feedback: config.privacy.retentionDays.feedback,
      case: config.privacy.retentionDays.case
    }
  };
}

function buildStorageSettings(): SettingsStorage {
  return {
    dataDir: config.dataDir,
    evidenceDir: config.evidenceDir,
    reportsDir: config.reportsDir,
    traceDir: config.trace.dir,
    feedbackDir: config.feedback.dir,
    outcomeDir: config.outcome.dir,
    evalDir: config.eval.dir
  };
}

function buildSafetySettings(): SettingsSafety {
  return {
    autoSubmitAllowed: false,
    humanReviewRequired: true,
    manualSubmissionRecordOnly: true,
    approvalGate: "enabled",
    notes: [
      "외부 신고기관 자동 제출 기능을 제공하지 않습니다.",
      "자동 로그인 / 자동 민원 / 포상금 신청을 자동화하는 기능을 제공하지 않습니다.",
      "모든 신고는 사람이 공식 창구에서 직접 수행합니다.",
      "제출 결과는 사람이 직접 입력하는 수동 기록만 가능합니다."
    ]
  };
}

function buildReadinessSettings(args: {
  runtimeMode: RuntimeMode;
  openaiConfigured: boolean;
  naverConfigured: boolean;
}): SettingsReadiness {
  const { runtimeMode, openaiConfigured, naverConfigured } = args;
  const openaiKeyPresent = maskSecretStatusOnly(config.openaiApiKey).configured;
  const naverIdPresent = maskSecretStatusOnly(config.scout.naverClientId).configured;
  const naverSecretPresent = maskSecretStatusOnly(config.scout.naverClientSecret).configured;

  let stage: ReadinessStage;
  if (runtimeMode === "REAL_READY") {
    stage = "HUMAN_REVIEW_READY";
  } else if (runtimeMode === "MIXED") {
    stage = "REAL_DATA_TEST";
  } else if (!openaiKeyPresent && !naverIdPresent && !naverSecretPresent) {
    stage = "API_KEY_REQUIRED";
  } else {
    stage = "MOCK_VALIDATION";
  }

  const label = {
    SETUP_REQUIRED: "초기 설정 필요",
    MOCK_VALIDATION: "Mock 검증 단계 — 실제 신고 전 검증 필요",
    MANUAL_URL_TEST: "수동 URL 테스트 단계 — 사람 검토 필요",
    API_KEY_REQUIRED: "API 키 설정 필요 — Mock으로 먼저 검증하세요",
    REAL_DATA_TEST: "실제 데이터 일부 검증 단계 — 사람 검토 필요",
    HUMAN_REVIEW_READY: "사람 검토 단계 — 모든 제출은 사람이 공식 창구에서 직접 수행",
    OPERATION_READY: "운영 단계 — 자동 제출 없음, 사람 검토 필수"
  }[stage];

  const blockingItems: string[] = [];
  if (!openaiConfigured) blockingItems.push("OpenAI API 키 미연결 (MOCK_AI=false + OPENAI_API_KEY 설정 필요)");
  if (!naverConfigured) blockingItems.push("Naver Search API 키 미연결 (MOCK_SCOUT=false + NAVER_CLIENT_ID/SECRET 설정 필요)");
  if (config.privacy.dryRun !== true) {
    blockingItems.push("PRIVACY_DRY_RUN 이 비활성화되어 있습니다. 실데이터 검증 전에는 dry-run 기본값 사용을 권장합니다.");
  }

  const nextActions: string[] = [];
  if (stage === "MOCK_VALIDATION" || stage === "API_KEY_REQUIRED") {
    nextActions.push("Mock 모드에서 후보 발굴 → 분석 → 신고서 초안 흐름을 먼저 검증하세요.");
    nextActions.push("실데이터 수집 전에 .env 의 API 키와 MOCK_AI / MOCK_SCOUT 설정을 확인하세요.");
  } else if (stage === "REAL_DATA_TEST") {
    nextActions.push("일부 실제 키가 연결된 혼합 모드입니다. 누락된 키를 보완하고 실데이터 검증을 진행하세요.");
    nextActions.push("실제 신고 전 Evidence Package 와 Report Draft 를 사람이 확인하세요.");
  } else if (stage === "HUMAN_REVIEW_READY") {
    nextActions.push("자동 신고는 수행되지 않습니다. 사람이 공식 창구에서 직접 제출하세요.");
    nextActions.push("Outcome Tracker 에 사람이 직접 결과를 기록하세요.");
  } else {
    nextActions.push("Home / Notice 카드에서 현재 모드와 안전 공지를 먼저 확인하세요.");
  }
  nextActions.push("공식 기준은 변경될 수 있으므로 실전 신고 전 사람이 직접 재확인하세요.");

  return { stage, label, blockingItems, nextActions };
}

export class SettingsService {
  getSettings(): SettingsPayload {
    const app = buildAppInfo();
    const { runtime, openaiConfigured, naverConfigured } = buildRuntimeMode();
    const apiConnections = buildApiConnectionStatus({ openaiConfigured, naverConfigured });
    const envStatus = buildEnvStatus(runtime.runtimeMode);
    const setupNotices = buildSetupNotices(runtime.runtimeMode);
    const scheduler = buildSchedulerSettings();
    const privacy = buildPrivacySettings();
    const storage = buildStorageSettings();
    const safety = buildSafetySettings();
    const readiness = buildReadinessSettings({
      runtimeMode: runtime.runtimeMode,
      openaiConfigured,
      naverConfigured
    });

    return {
      schemaVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      app,
      runtime,
      apiConnections,
      envStatus,
      setupNotices,
      scheduler,
      privacy,
      storage,
      safety,
      readiness,
      safetyNotice: SETTINGS_SAFETY_NOTICE
    };
  }

  // Public helpers (테스트에서도 개별 호출 가능)
  buildRuntimeMode() { return buildRuntimeMode().runtime; }
  buildApiConnectionStatus() {
    const r = buildRuntimeMode();
    return buildApiConnectionStatus({
      openaiConfigured: r.openaiConfigured,
      naverConfigured: r.naverConfigured
    });
  }
  buildEnvStatus() { return buildEnvStatus(buildRuntimeMode().runtime.runtimeMode); }
  buildSetupNotices() { return buildSetupNotices(buildRuntimeMode().runtime.runtimeMode); }
  buildSchedulerSettings() { return buildSchedulerSettings(); }
  buildPrivacySettings() { return buildPrivacySettings(); }
  buildStorageSettings() { return buildStorageSettings(); }
  buildSafetySettings() { return buildSafetySettings(); }
  buildReadinessSettings() {
    const r = buildRuntimeMode();
    return buildReadinessSettings({
      runtimeMode: r.runtime.runtimeMode,
      openaiConfigured: r.openaiConfigured,
      naverConfigured: r.naverConfigured
    });
  }
}

export const settingsService = new SettingsService();
