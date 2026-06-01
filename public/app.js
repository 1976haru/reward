// 공익레이더 (Public Interest Radar) — Frontend
// Repository / internal project name: reward-agent-mvp
// 이 파일은 백엔드 API(/api/cases, /api/cases/analyze)를 그대로 호출합니다.
// 자동 신고/자동 제출 기능은 포함하지 않습니다. 모든 신고 행위는 사람이 직접 수행합니다.

const MODULES = [
  {
    id: "false_ad",
    name: "건강기능식품 온라인 허위·과대광고",
    available: true,
    agency: "식품의약품안전처, 국민신문고, 관할 보건소",
    target: "건강기능식품 온라인 상품·광고 페이지 (1차 MVP 시작 카테고리)",
    difficulty: "쉬움",
    rewardLikelihood: "공식 기준 확인 필요 (수령 보장 없음)",
    guide: {
      detect: "질병 치료·예방·완치 표현, 의약품 오인 표현, 100% 효과·기적의 등 과장 효능 표현 (건강기능식품 광고 문구 중심)",
      report: "식품의약품안전처, 국민신문고, 관할 보건소",
      evidence: "원본 URL, 광고 문구 원문, 화면 캡처, PDF 저장본, 판매자 공개 정보, 수집일시",
      reward: "사안·처분 결과·공식 기준에 따라 달라지며 수령을 보장하지 않습니다.",
      caution: "AI 판단은 참고용이며, 최종 신고 여부는 사람이 검토한 뒤 직접 제출해야 합니다. 1차 MVP는 건강기능식품 광고에만 적용됩니다."
    }
  },
  {
    id: "general_food_ad",
    name: "일반 식품 허위·과대광고",
    available: false,
    agency: "식품의약품안전처, 국민신문고",
    target: "일반 식품 온라인 광고 (건강기능식품 외)",
    difficulty: "쉬움",
    rewardLikelihood: "공식 기준 확인 필요"
  },
  {
    id: "cosmetic_ad",
    name: "화장품 허위·과대광고",
    available: false,
    agency: "식품의약품안전처",
    target: "화장품 온라인 광고",
    difficulty: "쉬움",
    rewardLikelihood: "공식 기준 확인 필요"
  },
  {
    id: "medical_device_ad",
    name: "의료기기 허위·과대광고",
    available: false,
    agency: "식품의약품안전처",
    target: "의료기기 온라인 광고",
    difficulty: "보통",
    rewardLikelihood: "공식 기준 확인 필요"
  },
  {
    id: "fake_goods",
    name: "위조상품 온라인 판매",
    available: false,
    agency: "특허청, 관세청",
    target: "오픈마켓·SNS·해외직구 위조 브랜드 상품",
    difficulty: "보통",
    rewardLikelihood: "공식 기준 확인 필요"
  },
  {
    id: "origin_label",
    name: "원산지 표시 위반",
    available: false,
    agency: "국립농산물품질관리원, 관세청",
    target: "식품·농수산물·가공식품 원산지 표기",
    difficulty: "보통",
    rewardLikelihood: "공식 기준 확인 필요"
  },
  {
    id: "subsidy_fraud",
    name: "보조금 부정수급",
    available: false,
    agency: "국민권익위원회, 소관 부처",
    target: "정부·지자체 보조금 공시·실집행 자료",
    difficulty: "어려움",
    rewardLikelihood: "공식 기준 확인 필요"
  },
  {
    id: "bid_rigging",
    name: "입찰담합 의심",
    available: false,
    agency: "공정거래위원회",
    target: "공공조달 입찰 공고·낙찰 결과 공시",
    difficulty: "어려움",
    rewardLikelihood: "공식 기준 확인 필요"
  }
];

const MODULE_DISPLAY_ORDER = [
  "false_ad",
  "general_food_ad",
  "cosmetic_ad",
  "medical_device_ad",
  "counterfeit_goods",
  "fake_goods",
  "origin_labeling",
  "origin_label",
  "subsidy_fraud",
  "bid_collusion",
  "bid_rigging"
];

const PROCESS_STEPS = [
  { key: "collect", label: "자료수집" },
  { key: "rule", label: "규칙탐지" },
  { key: "ai", label: "AI분석" },
  { key: "score", label: "위험평가" },
  { key: "evidence", label: "증거저장" },
  { key: "report", label: "신고서초안" },
  { key: "review", label: "사람검토" }
];

// 신 enum (8개) + 레거시 lowercase 호환 + 한국어 표시명
const STATUS_LABEL = {
  DRAFT: "신규",
  REVIEW: "검토중",
  HOLD: "보류",
  APPROVED: "승인",
  REPORT_DRAFT: "신고초안",
  SUBMITTED: "제출(내부 기록)",
  OUTCOME_CHECK: "결과확인",
  REJECTED: "폐기",
  // 레거시
  draft: "신규",
  needs_review: "검토중",
  ready_to_report: "승인",
  reported: "제출(내부 기록)",
  rejected: "폐기",
  archived: "폐기"
};

const STATUS_BADGE = {
  DRAFT: "muted",
  REVIEW: "warn",
  HOLD: "warn",
  APPROVED: "ok",
  REPORT_DRAFT: "ok",
  SUBMITTED: "ok",
  OUTCOME_CHECK: "ok",
  REJECTED: "danger",
  // 레거시
  draft: "muted",
  needs_review: "warn",
  ready_to_report: "ok",
  reported: "ok",
  rejected: "danger",
  archived: "muted"
};

const QUEUE_STATUSES = ["DRAFT", "REVIEW", "HOLD", "APPROVED", "REPORT_DRAFT", "SUBMITTED", "OUTCOME_CHECK", "REJECTED"];

const state = {
  selectedModuleId: "false_ad",
  cases: [],
  topics: [],
  selectedTopicIds: new Set(),
  candidates: [],
  queue: { items: [], summary: null, statusFilter: "ALL", sort: "priority" },
  queueDetail: null,
  feedback: {
    meta: null,
    selectedReasons: new Set(),
    selectedDecision: "REJECT",
    caseFeedbacks: [],
    stats: null
  },
  eval: {
    sets: [],
    selectedSetId: null,
    threshold: 60,
    latest: null,
    lastRunId: null
  },
  dashboard: {
    summary: null,
    lastError: null
  },
  subsidy: {
    result: null,
    selectedRecordId: null,
    report: null
  },
  bids: {
    result: null,
    selectedGroupId: null,
    report: null,
    category: ""
  },
  trace: {
    events: [],
    summary: null,
    filters: { agentName: "", severity: "", eventType: "", caseId: "" }
  },
  privacy: {
    scan: null,
    policy: null,
    retention: null,
    lastMask: null
  },
  outcome: {
    meta: null,
    items: [],
    stats: null,
    followUp: []
  }
};

const LS_KEYS = { queueTab: "rewardAgent.queueTab", queueSort: "rewardAgent.queueSort" };
function readLS(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writeLS(key, val) { try { localStorage.setItem(key, val); } catch { /* ignore */ } }

// ---------- View navigation (실전 재점검 10·11) ----------
const APP_VIEWS = ["field", "home", "discover", "analyze", "review", "report", "outcome", "guide", "ops", "settings"];
const APP_VIEW_LS_KEY = "rewardAgent.activeView";

function initialView() {
  // URL hash 우선, 다음 localStorage, 기본 field (신고분야 선택 화면).
  try {
    const hash = (location.hash || "").replace(/^#/, "").trim();
    if (APP_VIEWS.includes(hash)) return hash;
  } catch { /* ignore */ }
  try {
    const saved = localStorage.getItem(APP_VIEW_LS_KEY);
    if (saved && APP_VIEWS.includes(saved)) return saved;
  } catch { /* ignore */ }
  return "field";
}

function switchView(view) {
  if (!APP_VIEWS.includes(view)) view = "home";
  document.querySelectorAll(".view-section[data-view]").forEach((el) => {
    if (el.getAttribute("data-view") === view) el.classList.add("is-active");
    else el.classList.remove("is-active");
  });
  document.querySelectorAll(".nav-button[data-view-target]").forEach((btn) => {
    if (btn.getAttribute("data-view-target") === view) btn.classList.add("is-active");
    else btn.classList.remove("is-active");
  });
  try { localStorage.setItem(APP_VIEW_LS_KEY, view); } catch { /* ignore */ }
  try { history.replaceState(null, "", "#" + view); } catch { /* ignore */ }
  const main = document.getElementById("appMain");
  if (main && typeof main.scrollTo === "function") main.scrollTo({ top: 0, behavior: "auto" });
  else window.scrollTo({ top: 0, behavior: "auto" });
}

function bindViewNav() {
  // 좌측 nav + quick action + header settings 버튼 + 어디서든 data-view-target 버튼.
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const btn = t.closest("[data-view-target]");
    if (!btn) return;
    const view = btn.getAttribute("data-view-target");
    if (!view) return;
    e.preventDefault();
    switchView(view);
  });
  window.addEventListener("hashchange", () => {
    const v = (location.hash || "").replace(/^#/, "").trim();
    if (APP_VIEWS.includes(v)) switchView(v);
  });
}

// ---------- Home overview (실전 재점검 10) ----------
function renderAppHeaderMeta(data) {
  if (!data) return;
  const modeBadge = document.getElementById("headerModeBadge");
  const openaiBadge = document.getElementById("headerOpenAiBadge");
  const naverBadge = document.getElementById("headerNaverBadge");
  const dateEl = document.getElementById("headerDate");
  const mode = data.mode || {};
  const api = data.apiConnections || {};
  if (modeBadge) {
    const rm = mode.runtimeMode || "MOCK";
    modeBadge.textContent = "MODE: " + rm;
    modeBadge.classList.toggle("status-chip-ok", rm === "REAL_READY");
    modeBadge.classList.toggle("status-chip-warn", rm === "MIXED");
    modeBadge.classList.toggle("status-chip-off", rm === "MOCK");
  }
  if (openaiBadge) {
    const ok = Boolean(api.openai && api.openai.configured);
    openaiBadge.textContent = "OpenAI: " + (ok ? "연결됨" : "미연결");
    openaiBadge.classList.toggle("status-chip-ok", ok);
    openaiBadge.classList.toggle("status-chip-off", !ok);
  }
  if (naverBadge) {
    const ok = Boolean(api.naver && api.naver.configured);
    naverBadge.textContent = "Naver: " + (ok ? "연결됨" : "미연결");
    naverBadge.classList.toggle("status-chip-ok", ok);
    naverBadge.classList.toggle("status-chip-off", !ok);
  }
  // 후보 발굴 화면의 Naver 키 상태 — 키 원문 없이 "설정됨/미설정"만 표시
  const discoverNaverStatus = document.getElementById("discoverNaverStatus");
  if (discoverNaverStatus) {
    const ok = Boolean(api.naver && api.naver.configured);
    discoverNaverStatus.textContent = "Naver 키: " + (ok ? "설정됨" : "미설정");
    discoverNaverStatus.classList.toggle("ok", ok);
    discoverNaverStatus.classList.toggle("muted", !ok);
  }
  if (dateEl && data.todayDate) dateEl.textContent = data.todayDate;
}

function renderHomeOverview(data) {
  const kpiRoot = document.getElementById("homeOverviewKpi");
  const actionsRoot = document.getElementById("homeOverviewActions");
  if (!kpiRoot && !actionsRoot) return;
  if (!data) {
    if (kpiRoot) kpiRoot.innerHTML = '<p class="muted">대시보드 데이터를 불러오는 중입니다. 잠시 후 다시 확인하세요.</p>';
    if (actionsRoot) actionsRoot.innerHTML = "";
    return;
  }
  const kpis = Array.isArray(data.kpis) ? data.kpis : [];
  const homeKpis = kpis
    .filter((k) => ["candidates_today", "in_review", "report_drafts", "submitted_records", "eval_f1", "dedupe_rate"].includes(k.key))
    .slice(0, 6);
  if (kpiRoot) {
    if (homeKpis.length === 0) {
      kpiRoot.innerHTML = '<p class="muted">표시할 KPI 가 없습니다.</p>';
    } else {
      kpiRoot.innerHTML = homeKpis.map((k) => `
        <div class="home-kpi-cell kpi-${escapeAttr(k.cls || "muted")}">
          <div class="home-kpi-label">${escapeHtml(k.label || "")}</div>
          <div class="home-kpi-value">${escapeHtml(String(k.value))}</div>
          ${k.hint ? `<div class="home-kpi-hint muted">${escapeHtml(k.hint)}</div>` : ""}
        </div>
      `).join("");
    }
  }
  if (actionsRoot) {
    actionsRoot.innerHTML = buildHomeActionsHtml(data);
  }
}

function buildHomeActionsHtml(data) {
  const actions = [];
  const mode = (data.mode && data.mode.runtimeMode) || "MOCK";
  const api = data.apiConnections || {};
  const today = data.today || {};
  const stage = (data.readiness && data.readiness.stage) || "";
  const dryRun = data?.notices?.find?.(() => false); // placeholder; no-op
  void dryRun;

  if (mode === "MOCK") {
    actions.push({
      view: "discover",
      label: "Mock 후보 발굴 실행",
      desc: "현재 MOCK 모드입니다. 후보 찾기 화면에서 Mock 후보 발굴을 먼저 검증하세요."
    });
  }
  if ((today.newCases ?? 0) > 0 || (today.collectedCandidates ?? 0) > 0) {
    actions.push({
      view: "analyze",
      label: "후보 1건 분석하기",
      desc: "오늘 수집된 후보가 있습니다. 분석/증거 화면에서 본문 분석을 진행하세요."
    });
  }
  if ((today.inReview ?? 0) > 0) {
    actions.push({
      view: "review",
      label: "검토 대기열 점검",
      desc: `${today.inReview}건이 검토 대기 중입니다.`
    });
  }
  if ((today.reportDrafts ?? 0) > 0) {
    actions.push({
      view: "report",
      label: "신고서 초안 확인하기",
      desc: `${today.reportDrafts}건의 신고서 초안이 준비되어 있습니다.`
    });
  }
  if (api.openai && api.openai.configured === false) {
    actions.push({
      view: "settings",
      label: "API 키 연결 상태 확인",
      desc: "OpenAI / Naver API 키가 미연결입니다. 설정 화면에서 상태를 확인하세요."
    });
  }
  actions.push({
    view: "settings",
    label: "개인정보 스캔 확인",
    desc: "설정 화면 아래 개인정보 보호 카드에서 스캔/마스킹을 점검할 수 있습니다."
  });
  // 가장 위 3개만 사용
  const top = actions.slice(0, 3);
  if (top.length === 0) {
    return '<p class="muted">현재 추천할 다음 행동이 없습니다. 좌측 메뉴에서 원하는 단계로 이동하세요.</p>';
  }
  const cards = top.map((a) => `
    <button type="button" class="home-action-card" data-view-target="${escapeAttr(a.view)}">
      <div class="home-action-label">${escapeHtml(a.label)} →</div>
      <div class="home-action-desc muted">${escapeHtml(a.desc)}</div>
    </button>
  `).join("");
  return `
    <h4 class="home-overview-subtitle">다음 행동 추천 (현재 상태 기준)</h4>
    <div class="home-action-grid">${cards}</div>
    <p class="muted home-overview-stage" style="margin-top:8px;font-size:12px;">실전 가능 단계: <code>${escapeHtml(stage || "—")}</code> · 자동 신고는 수행하지 않으며, 사람 검토가 필수입니다.</p>
  `;
}

// ---------- Field-first workflow (실전 재점검 11) ----------
const FIELD_DEFINITIONS = [
  {
    id: "false_ad",
    label: "건강기능식품 허위·과대광고",
    short: "허위·과대광고 검토 후보",
    statusLabel: "1차 MVP · 사용 가능",
    statusKind: "available",
    agency: "식품의약품안전처",
    description: "건강기능식품 광고에서 질병 치료·완치·예방 표현을 검토 후보로 탐지합니다. 법 위반 확정이 아니며, 신고 전 사람이 공식 기준을 확인해야 합니다.",
    reward: "공식 기준 확인 필요 · 포상금 수령 보장 없음",
    guideViewTarget: "guide",
    guideApi: "/api/modules/false-ad/guide",
    enabledStepsCount: 9,
    evidence: ["원본 URL", "광고 문구 원문", "상품명·광고 제목", "의심 문구 위치", "화면 캡처", "PDF 저장본", "수집일시", "판매자 공개 정보"],
    reportingChannels: ["식품의약품안전처 — 온라인 불법유통 신고", "국민신문고", "관할 보건소 / 지자체"],
    cautions: [
      "질병 치료·완치·예방 표현은 검토 후보이며 위반 확정이 아닙니다.",
      "식약처 공식 신고 안내를 사람이 직접 확인해야 합니다.",
      "포상금 수령을 보장하지 않습니다."
    ],
    officialUrl: "https://www.mfds.go.kr/wpge/m_660/de010410l001.do",
    workflowNote: "건강기능식품 광고에서 질병 치료·완치·예방 표현을 검토 후보로 탐지합니다. 법 위반 확정이 아니며, 신고 전 사람이 공식 기준을 확인해야 합니다."
  },
  {
    id: "general_food_ad",
    label: "일반식품 허위·과대광고",
    short: "건강기능식품 다음 쉬운 모듈",
    statusLabel: "후속 준비 중",
    statusKind: "upcoming",
    agency: "식품의약품안전처",
    description: "일반식품 온라인 광고 탐지 모듈은 건강기능식품 MVP 안정화 후 진행합니다.",
    reward: "공식 기준 확인 필요 · 포상금 수령 보장 없음",
    enabledStepsCount: 1,
    evidence: ["공개 URL", "광고 문구 원문", "수집일시"],
    reportingChannels: ["식품의약품안전처"],
    cautions: ["현재 준비 중입니다.", "실제 신고는 사용자가 공식 창구에서 직접 진행합니다."],
    officialUrl: "",
    workflowNote: "일반식품 모듈은 건강기능식품 MVP 다음 순서로 준비합니다."
  },
  {
    id: "cosmetic_ad",
    label: "화장품 허위·과대광고",
    short: "쉬운 확장 모듈 준비 중",
    statusLabel: "후속 준비 중",
    statusKind: "upcoming",
    agency: "식품의약품안전처",
    description: "화장품 온라인 광고 탐지 모듈은 일반식품 다음 순서로 진행합니다.",
    reward: "공식 기준 확인 필요 · 포상금 수령 보장 없음",
    enabledStepsCount: 1,
    evidence: ["공개 URL", "광고 문구 원문", "수집일시"],
    reportingChannels: ["식품의약품안전처"],
    cautions: ["현재 준비 중입니다.", "실제 신고는 사용자가 공식 창구에서 직접 진행합니다."],
    officialUrl: "",
    workflowNote: "화장품 모듈은 일반식품 다음 순서로 준비합니다."
  },
  {
    id: "medical_device_ad",
    label: "의료기기 허위·과대광고",
    short: "후속 모듈 준비 중",
    statusLabel: "후속 준비 중",
    statusKind: "upcoming",
    agency: "식품의약품안전처",
    description: "의료기기 온라인 광고 탐지 모듈은 화장품 다음 순서로 진행합니다.",
    reward: "공식 기준 확인 필요 · 포상금 수령 보장 없음",
    enabledStepsCount: 1,
    evidence: ["공개 URL", "광고 문구 원문", "수집일시"],
    reportingChannels: ["식품의약품안전처"],
    cautions: ["현재 준비 중입니다.", "실제 신고는 사용자가 공식 창구에서 직접 진행합니다."],
    officialUrl: "",
    workflowNote: "의료기기 모듈은 화장품 다음 순서로 준비합니다."
  },
  {
    id: "counterfeit_goods",
    label: "위조상품 온라인 판매",
    short: "위조상품 의심 판매글 검토",
    statusLabel: "확장 모듈 · 구현 보존",
    statusKind: "available",
    agency: "특허청 / 지식재산침해 원스톱 신고상담센터",
    description: "위조상품 의심 판매글을 검토 후보로 정리합니다. 위조 여부는 확정하지 않습니다.",
    reward: "공식 기준 확인 필요 · 포상금 수령 보장 없음",
    guideViewTarget: "guide",
    guideApi: "/api/modules/counterfeit-goods/guide",
    enabledStepsCount: 9,
    evidence: ["판매게시글 URL", "상품명", "브랜드/상표 표시", "상품 이미지", "로고/상표 표시 캡처", "가격", "판매자 공개 정보", "동일 판매자 추정 증거", "2개 이상 채널 판매 증거"],
    reportingChannels: ["특허청 — 위조상품 신고포상금제도", "지식재산침해 원스톱 신고상담센터", "상표(위조상품) 침해신고"],
    cautions: [
      "위조 여부 확정 판단은 권리자/관계기관 판단이 필요합니다.",
      "특정 판매자를 형사적 표현으로 단정하지 않습니다.",
      "포상금 수령을 보장하지 않습니다."
    ],
    officialUrl: "https://www.kipo.go.kr/ko/kpoContentView.do?menuCd=SCD0200346",
    workflowNote: "위조상품 의심 판매글을 검토 후보로 정리합니다. 위조 여부는 확정하지 않습니다."
  },
  {
    id: "subsidy_fraud",
    label: "보조금 부정수급",
    short: "공개 보조금 자료 검토 후보",
    statusLabel: "후순위 고급 모듈 · 프로토타입",
    statusKind: "prototype",
    agency: "국민권익위원회 / 청렴포털 · 보조금 관리기관 · 관할 지자체",
    description: "실데이터 준비 후 진행할 후순위 프로토타입입니다. 공개 보조금 자료에서 반복 수급, 동일 주소, 결과물 부족 등 검토 신호를 찾으며, 부정수급 확정이 아닙니다.",
    reward: "공식 기준 확인 필요 · 보상금/포상금 수령 보장 없음",
    guideViewTarget: "guide",
    guideApi: "/api/modules/subsidy-fraud/guide",
    enabledStepsCount: 2,
    evidence: ["보조사업명", "교부기관", "교부금액", "사업 공고 URL", "정산/결과 보고 자료", "반복 수급 근거", "공개자료 원본 URL"],
    reportingChannels: ["국민권익위원회 / 청렴포털", "국민신문고", "보조금 관리기관 / 관할 지자체 감사부서"],
    cautions: [
      "보조금 부정수급 모듈은 고급 모듈입니다.",
      "실데이터 기준선과 신고 전 사실점검이 준비된 뒤 사용합니다.",
      "현재는 준비/프로토타입 단계입니다.",
      "공공자료만 사용합니다. 비공개·로그인 자료는 다루지 않습니다.",
      "부정수급 확정 표현 없이 공개자료 기반 검토 후보로 분류합니다.",
      "보상금/포상금 수령을 보장하지 않습니다."
    ],
    locked: true,
    actionLabel: "실전 분석 시작 (준비중 · 잠금)",
    officialUrl: "https://www.clean.go.kr/menu.es?mid=a10613010000",
    workflowNote: "공개 보조금 자료에서 반복 수급, 동일 주소, 결과물 부족 등 검토 신호를 찾습니다. 부정수급 확정이 아닙니다."
  },
  {
    id: "bid_collusion",
    label: "입찰담합",
    short: "정형 입찰 데이터 검토 패턴",
    statusLabel: "후순위 고급 모듈 · 프로토타입",
    statusKind: "prototype",
    agency: "공정거래위원회 / 국민신문고",
    description: "실데이터 준비 후 진행할 후순위 프로토타입입니다. 정형 입찰 데이터에서 반복 업체군, 순환 낙찰, 좁은 투찰 간격 등 검토 패턴을 분석하며, 담합 확정이 아닙니다.",
    reward: "공식 기준 확인 필요 · 포상금 수령 보장 없음",
    guideViewTarget: "guide",
    guideApi: "/api/modules/bid-collusion/guide",
    enabledStepsCount: 2,
    evidence: ["입찰공고번호", "발주기관", "참여업체 목록", "업체별 투찰금액·률", "낙찰자/낙찰률", "반복 참여 업체군 근거", "원본 공개자료 URL"],
    reportingChannels: ["공정거래위원회 — 신고포상금 안내", "공정거래위원회 — 담합 신고 안내", "국민신문고"],
    cautions: [
      "정형 입찰 데이터 기반 검토 패턴이며, 담합 확정 판단이 아닙니다.",
      "특정 업체를 형사적 표현으로 단정하지 않습니다.",
      "포상금 수령을 보장하지 않습니다."
    ],
    officialUrl: "https://www.ftc.go.kr/www/contents.do?key=402",
    workflowNote: "정형 입찰 데이터에서 반복 업체군, 순환 낙찰, 좁은 투찰 간격 등 검토 패턴을 분석합니다. 담합 확정이 아닙니다."
  },
  {
    id: "origin_labeling",
    label: "원산지 표시 위반",
    short: "온라인 원산지 표시 검토 (준비 중)",
    statusLabel: "준비 중",
    statusKind: "upcoming",
    agency: "국립농산물품질관리원 / 관세청 / 지자체",
    description: "온라인 판매글의 원산지 표시 누락·오기 의심 신호 모듈은 준비 중입니다. 현재 분석 파이프라인은 연결되어 있지 않습니다.",
    reward: "공식 기준 확인 필요 · 포상금 수령 보장 없음",
    guideViewTarget: "guide",
    guideApi: null,
    enabledStepsCount: 1,
    evidence: ["판매게시글 URL", "상품명", "원산지 표기 위치", "표기 변경 이력(있을 경우)", "수집일시"],
    reportingChannels: ["국립농산물품질관리원", "관세청", "관할 지자체"],
    cautions: [
      "이 모듈은 준비 중입니다. 분석 결과를 생성하지 않습니다.",
      "원산지 표시 위반 여부는 관계기관 공식 판단이 필요합니다.",
      "포상금 수령을 보장하지 않습니다."
    ],
    officialUrl: "",
    workflowNote: "원산지 표시 위반 모듈은 준비 중입니다. 사용 가능해지면 본 화면에서 단계별 워크플로우가 활성화됩니다."
  }
];

const FIELD_LS_KEY = "rewardAgent.selectedFieldId";
const FIELD_STEP_LS_KEY = "rewardAgent.fieldCurrentStep";

const FIELD_WORKFLOW_STEPS = [
  { id: 1, label: "제도 확인", desc: "분야별 신고처·필요 증거·주의사항을 사람이 직접 확인합니다.", action: { view: "guide", label: "가이드 화면 열기" } },
  { id: 2, label: "후보 찾기", desc: "Scout/Mock 후보 발굴 또는 수동 URL 분석으로 검토 후보를 찾습니다.", action: { view: "discover", label: "후보 찾기 화면 열기" } },
  { id: 3, label: "수집/추출", desc: "본문 수집과 텍스트 추출로 분석 입력을 준비합니다.", action: { view: "analyze", label: "분석/증거 화면 열기" } },
  { id: 4, label: "룰 탐지", desc: "RuleAgent 가 모듈별 키워드/조합 규칙을 적용해 의심 문구를 표시합니다.", action: { view: "analyze", label: "분석/증거 화면 열기" } },
  { id: 5, label: "AI 분석/점수화", desc: "AnalyzerAgent + ScoringAgent 가 문맥 검토 의견과 우선순위 점수를 만듭니다.", action: { view: "analyze", label: "분석/증거 화면 열기" } },
  { id: 6, label: "증거 패키지", desc: "HTML/TEXT/Screenshot/PDF/Manifest 등 증거 패키지를 저장합니다.", action: { view: "analyze", label: "분석/증거 화면 열기" } },
  { id: 7, label: "신고서 초안", desc: "Markdown/Text/DOCX 신고서 초안을 다운로드해 사람이 검토합니다.", action: { view: "report", label: "신고서 초안 화면 열기" } },
  { id: 8, label: "사람 검토", desc: "Review Queue 에서 사람이 검토·승인·보류·폐기와 메모를 남깁니다.", action: { view: "review", label: "검토 대기열 열기" } },
  { id: 9, label: "결과 기록", desc: "사용자가 공식 창구에서 직접 제출한 결과를 Outcome Tracker 에 기록합니다.", action: { view: "outcome", label: "결과 기록 화면 열기" } }
];

const fieldState = {
  selectedFieldId: null,
  stepByField: {}
};

function getFieldDef(fieldId) {
  return FIELD_DEFINITIONS.find((f) => f.id === fieldId) || null;
}

function loadFieldState() {
  try {
    const saved = localStorage.getItem(FIELD_LS_KEY);
    if (saved && FIELD_DEFINITIONS.some((f) => f.id === saved)) {
      fieldState.selectedFieldId = saved;
    }
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(FIELD_STEP_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") fieldState.stepByField = parsed;
    }
  } catch { /* ignore */ }
}

function persistFieldState() {
  try {
    if (fieldState.selectedFieldId) localStorage.setItem(FIELD_LS_KEY, fieldState.selectedFieldId);
    localStorage.setItem(FIELD_STEP_LS_KEY, JSON.stringify(fieldState.stepByField));
  } catch { /* ignore */ }
}

function bindFieldFirst() {
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const fieldCard = t.closest("[data-field-id]");
    if (fieldCard) {
      const fid = fieldCard.getAttribute("data-field-id");
      const def = getFieldDef(fid);
      if (!def) return;
      e.preventDefault();
      selectField(fid);
      return;
    }
    const stepEl = t.closest("[data-field-step]");
    if (stepEl && !stepEl.classList.contains("is-disabled")) {
      const stepNum = Number(stepEl.getAttribute("data-field-step"));
      if (Number.isInteger(stepNum) && fieldState.selectedFieldId) {
        e.preventDefault();
        setFieldStep(fieldState.selectedFieldId, stepNum);
      }
      return;
    }
    if (t.matches("[data-field-advance]")) {
      e.preventDefault();
      const fid = fieldState.selectedFieldId;
      if (!fid) return;
      const def = getFieldDef(fid);
      if (!def) return;
      const cur = fieldState.stepByField[fid] || 1;
      const max = Math.min(def.enabledStepsCount || 1, FIELD_WORKFLOW_STEPS.length);
      const next = Math.min(cur + 1, max);
      setFieldStep(fid, next);
      return;
    }
    if (t.matches("[data-field-back]")) {
      e.preventDefault();
      const fid = fieldState.selectedFieldId;
      if (!fid) return;
      const cur = fieldState.stepByField[fid] || 1;
      const prev = Math.max(cur - 1, 1);
      setFieldStep(fid, prev);
      return;
    }
  });
}

function selectField(fieldId) {
  const def = getFieldDef(fieldId);
  if (!def) return;
  fieldState.selectedFieldId = fieldId;
  if (!fieldState.stepByField[fieldId]) fieldState.stepByField[fieldId] = 1;
  persistFieldState();
  renderFieldSidebar();
  renderFieldWorkspace(fieldId);
  renderFieldContext(fieldId);
}

function setFieldStep(fieldId, stepNum) {
  const def = getFieldDef(fieldId);
  if (!def) return;
  const max = Math.min(def.enabledStepsCount || 1, FIELD_WORKFLOW_STEPS.length);
  const clamped = Math.max(1, Math.min(stepNum, max));
  fieldState.stepByField[fieldId] = clamped;
  persistFieldState();
  renderFieldWorkspace(fieldId);
  renderFieldContext(fieldId);
}

function fieldStatusBadgeHtml(def) {
  if (!def) return "";
  let cls = "field-status";
  if (def.statusKind === "available") cls += " field-status-available";
  else if (def.statusKind === "prototype") cls += " field-status-prototype";
  else cls += " field-status-upcoming";
  return `<span class="${cls}">${escapeHtml(def.statusLabel || "")}</span>`;
}

function renderFieldSidebar() {
  const root = document.getElementById("fieldSidebar");
  if (!root) return;
  const orderIndex = (id) => {
    const index = MODULE_DISPLAY_ORDER.indexOf(id);
    return index === -1 ? MODULE_DISPLAY_ORDER.length : index;
  };
  const cards = [...FIELD_DEFINITIONS].sort((a, b) => orderIndex(a.id) - orderIndex(b.id)).map((def) => {
    const isActive = def.id === fieldState.selectedFieldId;
    return `
      <button type="button" class="field-card ${isActive ? "is-active" : ""} field-card-${escapeAttr(def.statusKind || "upcoming")}" data-field-id="${escapeAttr(def.id)}">
        <div class="field-card-row">
          <span class="field-card-label">${escapeHtml(def.label)}</span>
          ${fieldStatusBadgeHtml(def)}
        </div>
        <p class="field-card-desc">${escapeHtml(def.short || "")}</p>
        <p class="field-card-agency"><strong>신고처:</strong> ${escapeHtml(def.agency || "")}</p>
        <p class="field-card-reward muted">${escapeHtml(def.reward || "")}</p>
      </button>
    `;
  }).join("");
  root.innerHTML = `
    <div class="field-sidebar-header">
      <h3 class="field-sidebar-title">신고 분야</h3>
      <p class="muted" style="font-size:12px;margin:2px 0 0;">분야를 클릭하면 해당 분야 전용 워크플로우가 나타납니다.</p>
    </div>
    <div class="field-card-list">${cards}</div>
  `;
}

function renderWorkflowStepperHtml(def, currentStep) {
  const maxEnabled = Math.min(def.enabledStepsCount || 1, FIELD_WORKFLOW_STEPS.length);
  return `
    <ol class="workflow-stepper">
      ${FIELD_WORKFLOW_STEPS.map((s) => {
        const enabled = s.id <= maxEnabled;
        let cls = "workflow-step";
        if (!enabled) cls += " is-disabled";
        else if (s.id < currentStep) cls += " is-done";
        else if (s.id === currentStep) cls += " is-active";
        return `
          <li class="${cls}" data-field-step="${s.id}" ${enabled ? "" : "aria-disabled=\"true\""}>
            <span class="step-num">${s.id < currentStep ? "✓" : s.id}</span>
            <span class="step-label">${escapeHtml(s.label)}</span>
          </li>
        `;
      }).join("")}
    </ol>
  `;
}

function renderStepPanelHtml(def, currentStep) {
  const step = FIELD_WORKFLOW_STEPS.find((s) => s.id === currentStep) || FIELD_WORKFLOW_STEPS[0];
  const maxEnabled = Math.min(def.enabledStepsCount || 1, FIELD_WORKFLOW_STEPS.length);
  const enabled = step.id <= maxEnabled;
  const action = step.action;
  const canAdvance = enabled && currentStep < maxEnabled;
  const canBack = currentStep > 1;

  const stepExtra = stepPanelExtraHtml(def, step);

  return `
    <article class="step-panel ${enabled ? "" : "is-disabled"}">
      <div class="step-panel-header">
        <div>
          <span class="step-panel-num">단계 ${step.id}/9</span>
          <h4 class="step-panel-title">${escapeHtml(step.label)}</h4>
        </div>
        <span class="step-panel-status ${enabled ? (currentStep === step.id ? "is-active" : "") : "is-disabled"}">
          ${enabled ? (currentStep === step.id ? "진행 중" : "진행 가능") : "현재 분야에서는 비활성"}
        </span>
      </div>
      <p class="step-panel-desc">${escapeHtml(step.desc)}</p>
      ${stepExtra}
      <div class="step-panel-actions">
        ${action && enabled ? `<button type="button" class="primary" data-view-target="${escapeAttr(action.view)}">${escapeHtml(action.label)} →</button>` : ""}
        ${canBack ? `<button type="button" class="ghost" data-field-back>이전 단계</button>` : ""}
        ${canAdvance ? `<button type="button" class="ghost" data-field-advance>다음 단계로 이동</button>` : ""}
      </div>
      <p class="step-panel-safety muted">자동신고 없음 · 사람 검토 필수 · 수동 제출 기록만 가능. 모든 제출은 사람이 공식 창구에서 직접 진행합니다.</p>
    </article>
  `;
}

function stepPanelExtraHtml(def, step) {
  if (step.id === 1) {
    return `
      <div class="step-panel-extra">
        <p><strong>신고처 후보:</strong> ${escapeHtml(def.agency || "")}</p>
        ${def.officialUrl ? `<p><a class="report-official-link" href="${escapeAttr(def.officialUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(def.officialUrl)} ↗</a></p>` : ""}
        <ul class="step-panel-list">
          ${(def.cautions || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("")}
        </ul>
      </div>
    `;
  }
  if (step.id === 7) {
    return `
      <p class="step-panel-extra muted">신고서 초안은 사용자가 검토·수정한 뒤 외부 공식 신고기관에 <strong>직접 제출</strong>합니다. 자동 제출 기능은 제공되지 않습니다.</p>
    `;
  }
  if (step.id === 9) {
    return `
      <p class="step-panel-extra muted">결과 기록은 사용자가 공식 창구에서 직접 확인한 처리 결과를 내부 기록으로 저장합니다. 시스템이 자동 조회·제출하지 않습니다.</p>
    `;
  }
  return "";
}

function renderFieldWorkspace(fieldId) {
  const empty = document.getElementById("fieldWorkspaceEmpty");
  const body = document.getElementById("fieldWorkspaceBody");
  if (!empty || !body) return;
  const def = getFieldDef(fieldId);
  if (!def) {
    empty.removeAttribute("hidden");
    body.setAttribute("hidden", "");
    body.innerHTML = "";
    return;
  }
  empty.setAttribute("hidden", "");
  body.removeAttribute("hidden");
  const currentStep = fieldState.stepByField[fieldId] || 1;

  body.innerHTML = `
    <div class="card field-header">
      <div class="field-header-row">
        <div>
          <h3 class="field-header-title">${escapeHtml(def.label)}</h3>
          <p class="field-header-desc muted">${escapeHtml(def.workflowNote || def.description || "")}</p>
        </div>
        ${fieldStatusBadgeHtml(def)}
      </div>
      <div class="field-header-meta">
        <span class="quick-status-bar-item"><strong>신고처:</strong> ${escapeHtml(def.agency || "")}</span>
        <span class="quick-status-bar-item"><strong>포상/보상:</strong> ${escapeHtml(def.reward || "공식 기준 확인 필요")}</span>
        <span class="quick-status-bar-item"><strong>자동 신고:</strong> 없음</span>
        <span class="quick-status-bar-item"><strong>현재 단계:</strong> ${currentStep}/${FIELD_WORKFLOW_STEPS.length}</span>
      </div>
    </div>

    <div class="card workflow-stepper-card">
      <h4 class="step-panel-title" style="margin:0 0 6px;">워크플로우</h4>
      <p class="muted" style="margin:0 0 8px;font-size:12px;">단계는 사용자가 직접 클릭해 이동할 수 있습니다. 비활성 단계는 현재 분야에서 진행되지 않습니다.</p>
      ${renderWorkflowStepperHtml(def, currentStep)}
    </div>

    ${renderStepPanelHtml(def, currentStep)}
  `;
}

function renderFieldContext(fieldId) {
  const root = document.getElementById("fieldContextPanel");
  if (!root) return;
  const def = getFieldDef(fieldId);
  if (!def) {
    root.innerHTML = `
      <div class="context-card context-card-empty">
        <h4>컨텍스트 패널</h4>
        <p class="muted">신고분야를 선택하면 해당 분야의 신고처·수집해야 할 자료·주의사항과 현재 단계에서 해야 할 일을 여기에 표시합니다.</p>
      </div>
    `;
    return;
  }
  const currentStep = fieldState.stepByField[fieldId] || 1;
  const currentStepDef = FIELD_WORKFLOW_STEPS.find((s) => s.id === currentStep) || FIELD_WORKFLOW_STEPS[0];
  const channels = (def.reportingChannels || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("");
  const evidence = (def.evidence || []).map((e) => `<li>${escapeHtml(e)}</li>`).join("");
  const cautions = (def.cautions || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("");

  root.innerHTML = `
    <div class="context-card">
      <h4>신고처</h4>
      <ul class="context-list">${channels || '<li class="muted">—</li>'}</ul>
      ${def.officialUrl ? `<a class="context-link" href="${escapeAttr(def.officialUrl)}" target="_blank" rel="noopener noreferrer">공식 페이지 ↗</a>` : ""}
    </div>
    <div class="context-card">
      <h4>수집해야 할 자료</h4>
      <ul class="context-list">${evidence || '<li class="muted">—</li>'}</ul>
    </div>
    <div class="context-card">
      <h4>주의사항</h4>
      <ul class="context-list">${cautions || '<li class="muted">—</li>'}</ul>
    </div>
    <div class="context-card context-current-step">
      <h4>현재 단계에서 해야 할 일</h4>
      <p><strong>${escapeHtml(currentStepDef.label)}</strong></p>
      <p class="muted">${escapeHtml(currentStepDef.desc)}</p>
    </div>
    <div class="context-card context-card-safety">
      <h4>안전 안내</h4>
      <p class="muted">공익레이더는 외부 신고기관에 자동으로 제출하지 않으며, 포상금 수령을 보장하지 않습니다. 최종 신고 제출은 사용자가 공식 창구에서 직접 진행합니다.</p>
      ${def.guideViewTarget && def.guideApi ? `<button type="button" class="ghost" data-view-target="${escapeAttr(def.guideViewTarget)}">${escapeHtml(def.label)} 가이드 자세히 보기 →</button>` : ""}
    </div>
  `;
}

function initFieldFirst() {
  loadFieldState();
  // 기본 선택: 저장된 분야 또는 첫 사용 가능 분야.
  if (!fieldState.selectedFieldId) {
    const firstAvailable = FIELD_DEFINITIONS.find((f) => f.statusKind === "available");
    fieldState.selectedFieldId = firstAvailable ? firstAvailable.id : FIELD_DEFINITIONS[0].id;
  }
  if (!fieldState.stepByField[fieldState.selectedFieldId]) {
    fieldState.stepByField[fieldState.selectedFieldId] = 1;
  }
  renderFieldSidebar();
  renderFieldWorkspace(fieldState.selectedFieldId);
  renderFieldContext(fieldState.selectedFieldId);
}

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", async () => {
  bindViewNav();
  bindFieldFirst();
  initFieldFirst();
  switchView(initialView());
  renderHomeOverview(null);
  await loadModuleRegistry();
  renderModules();
  renderAutoPipelineModules();
  bindAutoPipeline();
  renderGuide();
  renderProcess("pending");
  bindForm();
  bindModal();
  bindDiscovery();
  bindQueue();
  state.queue.statusFilter = readLS(LS_KEYS.queueTab, "ALL") || "ALL";
  state.queue.sort = readLS(LS_KEYS.queueSort, "priority") || "priority";
  bindScheduler();
  bindFeedback();
  bindEval();
  bindHomeNotice();
  bindDashboard();
  bindGuideQa();
  // 공지 카드는 항상 보여야 하므로 boot 시 fallback 으로 먼저 그려둔다.
  renderNotices(null);
  // 가이드도 fetch 실패 대비해 boot 시 fallback 카드를 먼저 그려둔다.
  renderGuideQa(null);
  bindSubsidy();
  mountSubsidyEngineDemo();
  bindBids();
  bindTrace();
  bindPrivacy();
  bindOutcome();
  bindSettings();
  renderSettings(null);
  await loadSettings();
  bindRewardRegistry();
  renderRewardPrograms(null);
  await loadRewardPrograms();
  bindFalseAdGuide();
  renderFalseAdGuide(null);
  await loadFalseAdGuide();
  bindCounterfeitGuide();
  renderCounterfeitGuide(null);
  await loadCounterfeitGuide();
  bindBidCollusionGuide();
  renderBidCollusionGuide(null);
  await loadBidCollusionGuide();
  bindSubsidyGuide();
  renderSubsidyGuide(null);
  await loadSubsidyGuide();
  await loadTopics();
  await loadCandidates();
  await loadQueue();
  await loadSchedulerStatus();
  await loadFeedbackMeta();
  await loadFeedbackStats();
  await loadEvalSets();
  await loadEvalLatest();
  await loadDashboardSummary();
  await loadGuideQa();
  await loadTraceData();
  await loadOutcomeMeta();
  await loadOutcomeData();
});

function bindScheduler() {
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.id === "schedulerRunBtn") { e.preventDefault(); runSchedulerOnce(); }
    if (t.id === "schedulerRefreshBtn") { e.preventDefault(); loadSchedulerStatus(); }
  });
}

async function loadSchedulerStatus() {
  const panel = document.getElementById("schedulerPanel");
  if (!panel) return;
  try {
    const res = await fetch("/api/scheduler/status");
    const data = await res.json();
    if (!data.ok) throw new Error("scheduler status fetch failed");
    const lr = data.latestRun;
    panel.innerHTML = `
      <div class="evidence-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));">
        <div class="evi-item">
          <div class="label">활성 여부</div>
          <div class="value">${data.enabled ? '<span class="badge ok">enabled</span>' : '<span class="badge muted">disabled</span>'} ${data.running ? '<span class="badge warn">running</span>' : ''}</div>
        </div>
        <div class="evi-item">
          <div class="label">cron / timezone</div>
          <div class="value">${escapeHtml(data.cron)} · ${escapeHtml(data.timezone)}</div>
        </div>
        <div class="evi-item">
          <div class="label">topics / sources</div>
          <div class="value">${escapeHtml((data.topics || []).join(", "))}<br/><span class="muted">${escapeHtml((data.sources || []).join(", "))}</span></div>
        </div>
        <div class="evi-item">
          <div class="label">mode · 최대 후보</div>
          <div class="value">${escapeHtml(data.mode)} · ${data.maxCandidates}</div>
        </div>
      </div>
      <p class="muted" style="margin-top:6px;">${escapeHtml(data.nextRunNote || "")}</p>
      <p class="muted" style="margin-top:4px;font-size:12px;">${escapeHtml(data.safetyNotice)}</p>
      ${lr ? `
        <h4 style="margin:10px 0 6px;">최근 실행</h4>
        <div class="evi-item">
          <div class="label">
            <span class="badge ${lr.status === 'SUCCESS' ? 'ok' : lr.status === 'FAILED' ? 'danger' : 'muted'}">${escapeHtml(lr.status)}</span>
            <span style="margin-left:6px;">${escapeHtml(lr.reason)}</span>
          </div>
          <div class="value">시작 ${escapeHtml(lr.startedAt)}${lr.finishedAt ? ` · 종료 ${escapeHtml(lr.finishedAt)}` : ""}</div>
          ${lr.result ? `<div class="muted" style="font-size:12px;margin-top:4px;">발굴 ${lr.result.totalFound} · 저장 ${lr.result.totalSaved} · 중복 제거 ${lr.result.duplicatesRemoved} · usedSources=[${(lr.result.usedSources||[]).map(escapeHtml).join(",")}] · fallbacks=[${(lr.result.sourceFallbacks||[]).map(escapeHtml).join(",")}]</div>` : ""}
          ${lr.error ? `<div class="muted" style="color:#b91c1c;font-size:12px;margin-top:4px;">오류: ${escapeHtml(lr.error)}</div>` : ""}
          ${(lr.result?.warnings || []).length ? `<div class="muted" style="font-size:12px;margin-top:4px;">경고: ${(lr.result.warnings || []).map(escapeHtml).join(" · ")}</div>` : ""}
        </div>
      ` : '<p class="muted" style="margin-top:8px;">아직 실행 기록이 없습니다. "지금 한 번 후보 수집"을 눌러보세요.</p>'}
    `;
  } catch (err) {
    panel.innerHTML = `<div class="code">${escapeHtml(err.message)}</div>`;
  }
}

async function runSchedulerOnce() {
  const btn = document.getElementById("schedulerRunBtn");
  if (btn) btn.disabled = true;
  try {
    const res = await fetch("/api/scheduler/run-once", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "ui_manual" })
    });
    const data = await res.json();
    alert((data.message || `HTTP ${res.status}`) + (data.run?.result ? ` · 발굴 ${data.run.result.totalFound} · 저장 ${data.run.result.totalSaved}` : ""));
    await loadSchedulerStatus();
    await loadCandidates();
    await loadQueue();
  } catch (err) {
    alert("실행 실패: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------- 자동 실행 (하이브리드) — 단계 범위 선택 + 시작 ----------
const AUTO_PIPELINE_STOP_LABELS = {
  collect: "수집까지",
  analyze: "분석까지 (미리보기 · 저장 안 됨)",
  queue: "검수 대기까지 (사람 검수 대기 적재)"
};

function bindAutoPipeline() {
  const btn = document.getElementById("autoPipelineStartBtn");
  if (!btn) return;
  btn.addEventListener("click", (e) => { e.preventDefault(); runAutoPipeline(); });
}

// 모듈 드롭다운을 현재 MODULES(사용 가능)로 채운다. 기본 false_ad(건강기능식품).
function renderAutoPipelineModules() {
  const sel = document.getElementById("autoPipelineModule");
  if (!sel) return;
  const available = MODULES.filter((m) => m.available);
  const list = available.length ? available : MODULES;
  const prev = sel.value;
  sel.innerHTML = list.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join("");
  const desired = prev || (list.find((m) => m.id === "false_ad") ? "false_ad" : (list[0] && list[0].id));
  if (desired) sel.value = desired;
}

function selectedStopAfter() {
  const checked = document.querySelector('input[name="autoPipelineStopAfter"]:checked');
  return checked ? checked.value : "queue";
}

async function runAutoPipeline() {
  const btn = document.getElementById("autoPipelineStartBtn");
  const statusEl = document.getElementById("autoPipelineStatus");
  const resultEl = document.getElementById("autoPipelineResult");
  const stopAfter = selectedStopAfter();
  const moduleId = (document.getElementById("autoPipelineModule") || {}).value || "false_ad";
  const limit = parseInt((document.getElementById("autoPipelineLimit") || {}).value, 10);
  const maxAnalyses = parseInt((document.getElementById("autoPipelineMaxAnalyses") || {}).value, 10);

  // 중복 클릭 방지 + 진행 표시.
  if (btn) btn.disabled = true;
  const stages = stopAfter === "collect"
    ? "수집 중…"
    : stopAfter === "analyze"
      ? "수집 중… → 분석 중…"
      : "수집 중… → 분석 중… → 적재 중…";
  if (statusEl) statusEl.innerHTML = `<span class="badge warn">실행 중</span> ${escapeHtml(stages)}`;
  if (resultEl) resultEl.innerHTML = "";

  const body = { stopAfter, moduleId };
  if (Number.isFinite(limit) && limit > 0) body.limit = limit;
  if (Number.isFinite(maxAnalyses) && maxAnalyses > 0) body.maxAnalyses = maxAnalyses;

  try {
    const res = await fetch("/api/pipeline/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      const msg = data && data.message ? data.message : `HTTP ${res.status}`;
      if (statusEl) statusEl.innerHTML = `<span class="badge danger">실패</span> ${escapeHtml(msg)}`;
      return;
    }
    if (statusEl) statusEl.innerHTML = `<span class="badge ok">완료</span> ${escapeHtml(data.message || "")}`;
    renderAutoPipelineResult(data);
  } catch (err) {
    if (statusEl) statusEl.innerHTML = `<span class="badge danger">실패</span> ${escapeHtml(err.message)}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderAutoPipelineResult(data) {
  const root = document.getElementById("autoPipelineResult");
  if (!root) return;
  const ex = data.execSummary || {};
  const stopAfter = data.stopAfter || "queue";
  const applied = data.applied || {};
  const items = Array.isArray(ex.items) ? ex.items : [];

  const clampNote = (applied.limitClamped || applied.maxAnalysesClamped)
    ? `<p class="muted" style="font-size:12px;">※ 서버 상한으로 조정됨: ${applied.limitClamped ? `수집 건수 → ${applied.limitMax}` : ""}${applied.limitClamped && applied.maxAnalysesClamped ? " · " : ""}${applied.maxAnalysesClamped ? `분석 상한 → ${applied.analysesMax}` : ""}.</p>`
    : "";

  const kpi = `
    <div class="evidence-grid" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr));">
      <div class="evi-item"><div class="label">수집(discovered)</div><div class="value">${ex.discovered ?? 0}</div></div>
      <div class="evi-item"><div class="label">분석(analyzed)</div><div class="value">${ex.analyzed ?? 0}</div></div>
      <div class="evi-item"><div class="label">적재(queued)</div><div class="value">${ex.queued ?? 0}</div></div>
      <div class="evi-item"><div class="label">스킵(skipped)</div><div class="value">${ex.skipped ?? 0}</div></div>
      <div class="evi-item"><div class="label">오류(errors)</div><div class="value">${ex.errors ?? 0}</div></div>
    </div>`;

  const previewBanner = stopAfter === "analyze"
    ? `<div class="input-notice" style="margin:8px 0;"><strong>미리보기 (저장 안 됨)</strong> — 아래 결과는 점수/판단 미리보기이며 케이스로 저장되거나 검수 대기열에 적재되지 않았습니다. 적재하려면 "③ 검수 대기까지"로 다시 실행하세요.</div>`
    : "";

  const queueLink = (stopAfter === "queue" && (ex.queued ?? 0) > 0)
    ? `<p style="margin:8px 0;"><button class="ghost" type="button" data-view-target="review">검수 대기열로 이동 →</button> <span class="muted" style="font-size:12px;">적재된 ${ex.queued}건은 사람 검토 대기 상태입니다. 제출은 검토 후 직접 수행합니다.</span></p>`
    : "";

  let listHtml = "";
  if (items.length) {
    const rows = items.slice(0, 50).map((it) => {
      let badge;
      if (it.outcome === "collected") badge = '<span class="badge muted">수집됨</span>';
      else if (it.outcome === "preview") badge = '<span class="badge warn">미리보기</span>';
      else if (it.outcome === "auto_review") badge = '<span class="badge ok">검수 적재</span>';
      else if (it.outcome === "needs_human_triage") badge = '<span class="badge warn">검토 분류</span>';
      else if (it.outcome === "noise") badge = '<span class="badge muted">노이즈</span>';
      else if (it.outcome === "duplicate_skipped") badge = '<span class="badge muted">중복</span>';
      else if (it.outcome === "skipped_not_new") badge = '<span class="badge muted">처리됨</span>';
      else if (it.outcome === "limit_skipped") badge = '<span class="badge muted">상한초과</span>';
      else if (it.outcome === "failed") badge = '<span class="badge danger">실패</span>';
      else badge = `<span class="badge muted">${escapeHtml(it.outcome)}</span>`;
      const score = typeof it.score === "number"
        ? ` · 점수 ${it.score}${typeof it.confidence === "number" ? ` / 신뢰도 ${Math.round(it.confidence * 100)}%` : ""}`
        : "";
      const route = it.route ? ` · 라우팅 ${escapeHtml(it.route)}` : "";
      const persisted = it.persisted ? '저장됨' : '저장 안 됨';
      const reason = it.reason ? `<div class="muted" style="font-size:12px;">${escapeHtml(it.reason)}</div>` : "";
      const caseInfo = it.caseId ? `<div class="muted" style="font-size:12px;">case=${escapeHtml(it.caseId)} · 상태 ${escapeHtml(it.caseStatus || "-")}${it.reviewRequestStatus ? ` · 검수요청 ${escapeHtml(it.reviewRequestStatus)}` : ""}</div>` : "";
      return `<div class="evi-item" style="margin-bottom:6px;">
        <div class="label">${badge} <span class="muted" style="font-size:11px;">(${persisted})</span>${score}${route}</div>
        <div class="value" style="word-break:break-all;font-size:12px;">${escapeHtml(it.title || it.url || it.candidateId || "")}</div>
        ${reason}${caseInfo}
      </div>`;
    }).join("");
    listHtml = `<div style="margin-top:8px;">${rows}</div>`;
    if (items.length > 50) listHtml += `<p class="muted" style="font-size:12px;">…외 ${items.length - 50}건</p>`;
  } else {
    listHtml = '<p class="muted">표시할 결과가 없습니다.</p>';
  }

  root.innerHTML = `
    <h4 style="margin:6px 0;">실행 요약 · ${escapeHtml(AUTO_PIPELINE_STOP_LABELS[stopAfter] || stopAfter)}</h4>
    ${kpi}
    ${clampNote}
    ${previewBanner}
    ${queueLink}
    ${listHtml}
    <p class="muted" style="font-size:11px;margin-top:8px;">${escapeHtml(data.safetyNotice || "")}</p>
  `;
}

// /api/modules에서 받은 ModuleDefinition을 UI MODULES 형태로 변환
function toUiModule(m) {
  // "active" = 풀 파이프라인 / "ready" = 최소 룰·스카웃·리포트 연결 (counterfeit_goods)
  // "prototype" = sample 기반 프로토타입 (subsidy_fraud)
  // 셋 다 UI에서 선택 가능으로 처리한다.
  return {
    id: m.id,
    name: m.name,
    available: m.status === "active" || m.status === "ready" || m.status === "prototype",
    status: m.status,
    agency: (m.ui && m.ui.agency) || "—",
    target: (m.ui && m.ui.target) || "—",
    difficulty: (m.ui && m.ui.difficulty) || "—",
    rewardLikelihood: (m.ui && m.ui.rewardLikelihood) || "공식 기준 확인 필요",
    guide: m.ui && m.ui.guide ? m.ui.guide : undefined
  };
}

async function loadModuleRegistry() {
  try {
    const res = await fetch("/api/modules");
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.ok || !Array.isArray(data.modules) || data.modules.length === 0) return;
    const mapped = data.modules.map(toUiModule);
    const mappedIds = new Set(mapped.map((m) => m.id));
    const plannedDisplayOnly = MODULES.filter((m) =>
      ["general_food_ad", "cosmetic_ad", "medical_device_ad"].includes(m.id) && !mappedIds.has(m.id)
    );
    const orderIndex = (id) => {
      const index = MODULE_DISPLAY_ORDER.indexOf(id);
      return index === -1 ? MODULE_DISPLAY_ORDER.length : index;
    };
    const sorted = [...mapped, ...plannedDisplayOnly].sort((a, b) => orderIndex(a.id) - orderIndex(b.id));
    MODULES.splice(0, MODULES.length, ...sorted);
    const defaultId = data.defaultModuleId;
    const defaultMod = MODULES.find((m) => m.id === defaultId);
    if (defaultMod && defaultMod.available) {
      state.selectedModuleId = defaultId;
    }
  } catch (err) {
    console.warn("Module registry fetch failed; using local fallback.", err);
  }
}

// ---------- Modules ----------
function renderModules() {
  const root = document.getElementById("moduleList");
  root.innerHTML = MODULES.map((m) => {
    const isActive = state.selectedModuleId === m.id && m.available;
    let statusBadge;
    if (m.status === "active") statusBadge = '<span class="badge ok">사용 가능</span>';
    else if (m.status === "ready") statusBadge = '<span class="badge ok">사용 가능 (룰 기반)</span>';
    else if (m.status === "prototype") statusBadge = '<span class="badge warn">프로토타입</span>';
    else statusBadge = '<span class="badge muted">준비 중</span>';
    return `
      <div class="module-card ${isActive ? "active" : ""} ${m.available ? "" : "disabled"}" data-id="${m.id}">
        <div class="mc-title">
          <span>${escapeHtml(m.name)}</span>
          ${statusBadge}
        </div>
        <dl class="mc-meta">
          <dt>신고처</dt><dd>${escapeHtml(m.agency)}</dd>
          <dt>대상</dt><dd>${escapeHtml(m.target)}</dd>
          <dt>난이도</dt><dd>${escapeHtml(m.difficulty)}</dd>
          <dt>포상금</dt><dd>${escapeHtml(m.rewardLikelihood)}</dd>
        </dl>
      </div>
    `;
  }).join("");

  root.querySelectorAll(".module-card").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      const mod = MODULES.find((m) => m.id === id);
      if (!mod) return;
      if (!mod.available) {
        openModal(
          "아직 분석 기능은 준비 중입니다",
          `“${mod.name}” 모듈은 현재 설계·준비 중입니다. 다음 단계에서 sources, keywords, detection rules, report template 등을 추가할 예정입니다.`
        );
        return;
      }
      state.selectedModuleId = id;
      renderModules();
      renderGuide();
    });
  });
}

// ---------- Guide ----------
function renderGuide() {
  const root = document.getElementById("guidePanel");
  const mod = MODULES.find((m) => m.id === state.selectedModuleId);
  if (!mod || !mod.guide) {
    root.innerHTML = '<p class="muted">모듈을 선택하면 가이드가 표시됩니다.</p>';
    return;
  }
  const g = mod.guide;
  root.innerHTML = `
    <h2>${escapeHtml(mod.name)} 가이드</h2>
    <dl>
      <dt>탐지 예시</dt><dd>${escapeHtml(g.detect)}</dd>
      <dt>신고처</dt><dd>${escapeHtml(g.report)}</dd>
      <dt>필요 증거</dt><dd>${escapeHtml(g.evidence)}</dd>
      <dt>포상금</dt><dd>${escapeHtml(g.reward)}</dd>
    </dl>
    <p class="small">⚠ ${escapeHtml(g.caution)}</p>
  `;
}

// ---------- Process bar ----------
function renderProcess(mode, currentStepIndex = -1) {
  // mode: 'pending' | 'running' | 'done'
  const root = document.getElementById("processBar");
  root.innerHTML = PROCESS_STEPS.map((s, i) => {
    let cls = "pending";
    if (mode === "done") cls = "done";
    else if (mode === "running") {
      if (i < currentStepIndex) cls = "done";
      else if (i === currentStepIndex) cls = "running";
    }
    return `
      <div class="step ${cls}">
        <span class="num">${i + 1}</span>
        <span class="label">${escapeHtml(s.label)}</span>
      </div>
    `;
  }).join("");
}

// ---------- Form ----------
function bindForm() {
  const form = document.getElementById("analyzeForm");
  const btn = document.getElementById("submitBtn");
  const result = document.getElementById("result");
  const evidenceBox = document.getElementById("evidence");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = document.getElementById("url").value.trim();
    const memo = document.getElementById("memo").value.trim();
    const mod = MODULES.find((m) => m.id === state.selectedModuleId);
    if (!mod || !mod.available) {
      openModal("사용 가능한 모듈을 먼저 선택하세요", "현재는 '온라인 허위·과대광고' 모듈만 분석할 수 있습니다.");
      return;
    }

    btn.disabled = true;
    result.innerHTML = '<p class="muted">분석 중입니다. 페이지 수집과 캡처가 포함되어 약간의 시간이 걸릴 수 있습니다.</p>';
    evidenceBox.innerHTML = '<p class="muted">분석이 끝나면 증거 패키지가 표시됩니다.</p>';
    renderProcess("running", 0);

    // 시뮬레이션: 단계 진행 표시 (실제 단계 hook은 백엔드에 없음)
    const stepTimers = [];
    for (let i = 1; i < PROCESS_STEPS.length - 1; i++) {
      stepTimers.push(setTimeout(() => renderProcess("running", i), i * 700));
    }

    try {
      const res = await fetch("/api/cases/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, memo, moduleId: state.selectedModuleId || "false_ad" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "분석 실패");

      stepTimers.forEach(clearTimeout);
      renderProcess("done");
      renderResult(data);
      renderEvidence(data);
      await loadQueue();
    } catch (err) {
      stepTimers.forEach(clearTimeout);
      renderProcess("pending");
      result.innerHTML = `<div class="code">${escapeHtml(err.message)}</div>`;
      evidenceBox.innerHTML = '<p class="muted">분석이 실패해 증거 패키지를 만들지 못했습니다.</p>';
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- Result ----------
function gradeFromScore(score) {
  if (score >= 80) return { label: "검토필요", cls: "grade-review" };
  if (score >= 50) return { label: "높음", cls: "grade-high" };
  if (score >= 25) return { label: "보통", cls: "grade-mid" };
  return { label: "낮음", cls: "grade-low" };
}

function renderResult(c) {
  const result = document.getElementById("result");
  const score = c.riskScore ?? c.score ?? 0;
  const grade = gradeFromScore(score);
  const ai = c.aiFinding || {};
  const hits = c.ruleHits || [];
  const statusKey = c.status || "DRAFT";
  const statusBadge = STATUS_BADGE[statusKey] || "muted";

  const reasonsHtml = (ai.reasons || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("") || "<li>제시된 근거가 없습니다.</li>";
  const hitsHtml = hits.length
    ? hits.map((h) => `<li><strong>${escapeHtml(h.keyword)}</strong> — ${escapeHtml(h.category)} <span class="badge ${severityBadge(h.severity)}">${escapeHtml(h.severity)}</span><br/><span class="muted">${escapeHtml(h.excerpt)}</span></li>`).join("")
    : "<li>키워드 규칙 매치가 없습니다.</li>";
  const checksHtml = (ai.requiredHumanChecks || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("") || "<li>특별한 추가 확인 사항이 제시되지 않았습니다.</li>";

  const reportUrl = c.reportPath ? `/api/cases/${encodeURIComponent(c.id)}/report/report.md` : "#";

  const col = c.collection || {};
  const collectionNoticeHtml = col.status === "fallback"
    ? `<div class="input-notice" style="border-color:#fde68a;background:#fffbeb;margin-bottom:10px;">⚠ 이 공개 URL의 본문을 자동으로 가져오지 못했습니다(${escapeHtml(col.note || "수집 실패")}). 빈 본문 기준으로 분석되었으므로 점수·문구는 참고용입니다. 사람이 페이지를 직접 열어 확인하세요.</div>`
    : "";

  result.innerHTML = `
    ${collectionNoticeHtml}
    <div class="safety-banner" style="margin-bottom:10px;">법 위반 확정이 아닙니다 · 검토가 필요한 의심 후보입니다 · 자동신고 없음 · 사람 검토 필수</div>
    <div class="score-row">
      <span class="score-pill ${grade.cls}"><span class="num">${score}</span>/100</span>
      <span class="badge ${grade.cls.replace("grade-", "")}">${escapeHtml(grade.label)}</span>
      <span class="badge ${statusBadge}">상태: ${escapeHtml(STATUS_LABEL[statusKey] || statusKey)}</span>
    </div>
    <h3>${escapeHtml(c.title || c.url)}</h3>
    <p class="muted">${escapeHtml(c.url)}</p>

    <div class="result-section">
      <h4>AI 분석 요약</h4>
      <p>${escapeHtml(ai.summary || "요약이 제공되지 않았습니다.")}</p>
    </div>

    <div class="result-section">
      <h4>판단 근거</h4>
      <ul>${reasonsHtml}</ul>
    </div>

    ${renderScoringPanel(c.scoringResult, c.ruleDetection)}

    ${renderLlmAnalysisPanel(c.llmAnalysis)}

    ${renderRuleDetectionPanel(c.ruleDetection)}

    <div class="result-section">
      <h4>레거시 룰 히트</h4>
      <ul>${hitsHtml}</ul>
    </div>

    ${renderExtractionPanel(c.extraction)}

    <div class="result-section">
      <h4>신고기관 후보</h4>
      <p>${escapeHtml(ai.recommendedAgency || "별도 추천 기관이 제시되지 않았습니다.")}</p>
    </div>

    <div class="result-section">
      <h4>포상금 가능성 확인 필요</h4>
      <p class="muted">포상금은 사안, 처분 결과, 공식 규정, 기관 판단에 따라 달라지며 이 프로그램은 수령을 보장하지 않습니다. "예상 포상금" 같은 확정 표현은 사용하지 않습니다. 공식 자료(법령·기관 안내)는 사람이 직접 재확인해야 합니다. 자세한 근거는 <code>src/modules/false-ad/agency_config.json</code> 참고.</p>
    </div>

    <div class="result-section">
      <h4>사람 검토 필요 항목</h4>
      <ul>${checksHtml}</ul>
    </div>

    <div class="next-actions">
      <h4>다음 행동 추천</h4>
      <ol>
        <li>증거 패키지를 직접 열어 사실관계를 확인합니다.</li>
        <li>AI 요약과 탐지 문구가 실제 광고 문맥에 부합하는지 사람이 판단합니다.</li>
        <li>신고가 적절하다고 판단되면 신고서 초안을 다듬어 <strong>사람이 직접</strong> 관할 기관에 제출합니다.</li>
        <li>제출이 끝나면 케이스 상태를 수동으로 'reported'로 갱신합니다.</li>
      </ol>
      <p class="muted" style="margin:8px 0 0;">⚠ 이 도구는 자동 신고를 수행하지 않습니다. 외부 기관에 대한 자동 제출·자동 로그인 기능도 제공하지 않습니다.</p>
    </div>

    <div class="result-section">
      <a href="${reportUrl}" target="_blank" rel="noreferrer">신고서 초안 열기 (Markdown) →</a>
    </div>

    ${renderReportDraftPanel(c)}
  `;
}

function renderReportDraftPanel(c) {
  if (!c || !c.id) return "";
  return `
    <div class="result-section" id="reportDraftSection" data-case-id="${escapeAttr(c.id)}">
      <h4>신고서 초안 (Report Draft)</h4>
      <p class="muted">이 문서는 자동 신고서가 아닙니다. 사람이 공식 기준과 증거를 검토한 뒤 직접 제출해야 합니다.</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0;">
        <button class="primary" type="button" id="generateReportBtn">신고서 초안 생성</button>
        <a id="reportMdLink" class="ghost" href="/api/cases/${escapeAttr(c.id)}/report/report.md" target="_blank" rel="noreferrer" style="text-decoration:none;padding:8px 12px;border:1px solid #e5e7eb;border-radius:10px;font-weight:600;">MD 열기</a>
        <a id="reportTxtLink" class="ghost" href="/api/cases/${escapeAttr(c.id)}/report/report.txt" target="_blank" rel="noreferrer" style="text-decoration:none;padding:8px 12px;border:1px solid #e5e7eb;border-radius:10px;font-weight:600;">TXT 열기</a>
        <a id="reportDocxLink" class="ghost" href="/api/cases/${escapeAttr(c.id)}/report/report.docx" target="_blank" rel="noreferrer" style="text-decoration:none;padding:8px 12px;border:1px solid #e5e7eb;border-radius:10px;font-weight:600;">DOCX 다운로드</a>
        <button class="ghost" type="button" id="copyReportTextBtn">Text 복사</button>
      </div>
      <div id="reportDraftStatus" class="muted" style="font-size:13px;"></div>
      <pre id="reportDraftPreview" class="code" style="max-height:280px;overflow:auto;display:none;"></pre>
    </div>
  `;
}

async function generateReportDraft() {
  const section = document.getElementById("reportDraftSection");
  if (!section) return;
  const caseId = section.getAttribute("data-case-id");
  const status = document.getElementById("reportDraftStatus");
  const preview = document.getElementById("reportDraftPreview");
  const btn = document.getElementById("generateReportBtn");
  if (!caseId) return;
  btn.disabled = true;
  status.textContent = "초안 생성 중...";
  try {
    const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/report/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    status.textContent = `생성 완료 · ${data.report.generatedAt}${data.warnings && data.warnings.length ? ` · 경고 ${data.warnings.length}` : ""}`;
    if (preview && typeof data.report.markdown === "string") {
      preview.style.display = "block";
      preview.textContent = data.report.markdown;
    }
    window.__lastReportText = String(data.report.text || "");
  } catch (err) {
    status.textContent = "초안 생성 실패: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

async function copyReportText() {
  const status = document.getElementById("reportDraftStatus");
  const text = window.__lastReportText;
  if (!text) {
    if (status) status.textContent = "먼저 '신고서 초안 생성'을 실행하세요.";
    return;
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    if (status) status.textContent = "Text 본문이 클립보드에 복사되었습니다.";
  } catch (err) {
    if (status) status.textContent = "복사 실패: " + err.message;
  }
}

// renderResult 이후 버튼 바인딩 (이벤트 위임)
document.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;
  if (t.id === "generateReportBtn") { e.preventDefault(); generateReportDraft(); }
  if (t.id === "copyReportTextBtn") { e.preventDefault(); copyReportText(); }
});

function renderScoreExplanationBlock(rd) {
  if (!rd) return "";
  const counts = rd.counts || { HIGH: 0, MEDIUM: 0, LOW: 0, combo: 0, total: 0 };
  const repeated = Array.isArray(rd.repeatedPhrases) ? rd.repeatedPhrases : [];
  const cooc = rd.cooccurrence || {};
  const factors = [];
  if (counts.HIGH > 0) factors.push(`High 키워드 ${counts.HIGH}개 (개당 +25점)`);
  if (counts.MEDIUM > 0) factors.push(`Medium 키워드 ${counts.MEDIUM}개 (개당 +12점)`);
  if (counts.LOW > 0) factors.push(`Low 키워드 ${counts.LOW}개 (개당 +5점)`);
  if (repeated.length > 0) factors.push(`동일 문구 반복 (+10점): ${repeated.map((r) => `${r.keyword}×${r.count}`).join(", ")}`);
  if (cooc.productAndDisease) factors.push("상품(군) 표현과 질병명 동시 등장 (+15점)");
  if (cooc.treatmentAndDisease) factors.push("치료/완치/예방 표현과 질병명 동시 등장 (+25점)");
  if (factors.length === 0) factors.push("점수에 크게 영향을 준 의심 신호가 없습니다. 그래도 최종 판단은 사람이 합니다.");
  return `
    <h4 style="margin:10px 0 6px;">점수에 영향을 준 요소 (위험도 기준)</h4>
    <p class="muted" style="font-size:12.5px;margin:0 0 6px;">RuleAgent 위험도 ${rd.riskScore || 0}/100 · 등급 ${escapeHtml(rd.riskLevel || "")} · 키워드 HIGH ${counts.HIGH} / MEDIUM ${counts.MEDIUM} / LOW ${counts.LOW} / 조합 ${counts.combo}</p>
    <ul class="score-factor-list">${factors.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
  `;
}

function renderScoringPanel(s, rd) {
  if (!s) return "";
  const levelBadge =
    s.priorityLevel === "VERY_HIGH_PRIORITY" ? "danger" :
    s.priorityLevel === "HIGH_PRIORITY" ? "warn" :
    s.priorityLevel === "REVIEW_NEEDED" ? "warn" : "ok";
  const components = Array.isArray(s.components) ? s.components : [];
  const compsHtml = components.map((c) => {
    const pct = c.maxPoints > 0 ? Math.round((c.score / c.maxPoints) * 100) : 0;
    return `
      <div class="evi-item">
        <div class="label">${escapeHtml(c.label)} <span class="muted">(${c.score}/${c.maxPoints})</span></div>
        <div style="background:#e5e7eb;border-radius:6px;height:8px;overflow:hidden;margin:6px 0;">
          <div style="width:${pct}%;height:100%;background:${pct >= 80 ? '#b91c1c' : pct >= 50 ? '#b45309' : '#047857'};"></div>
        </div>
        <div class="muted" style="font-size:12px;">${(c.reasons || []).slice(0, 4).map(escapeHtml).join(" · ") || "—"}</div>
      </div>
    `;
  }).join("");
  const actions = (s.recommendedNextActions || []).map((a) => `<li>${escapeHtml(a)}</li>`).join("");
  const safety = (s.safetyWarnings || []).map((a) => `<li>${escapeHtml(a)}</li>`).join("");

  return `
    <div class="result-section">
      <h4>신고 후보 우선순위 점수</h4>
      <div class="score-row">
        <span class="score-pill ${levelBadge === 'danger' ? 'grade-high' : levelBadge === 'warn' ? 'grade-mid' : 'grade-low'}"><span class="num">${s.priorityScore}</span>/100</span>
        <span class="badge ${levelBadge}">${escapeHtml(s.priorityLabel || "")}</span>
      </div>
      <p class="muted" style="margin:6px 0;">${escapeHtml(s.disclaimer || "")}</p>

      <div class="score-notes">
        <p>이 점수는 사람이 먼저 검토할 후보를 정렬하기 위한 참고 점수입니다.</p>
        <p>점수가 높아도 위법 확정은 아니며, 신고 전 원문과 증거를 반드시 확인해야 합니다.</p>
      </div>

      ${renderScoreExplanationBlock(rd)}

      <h4 style="margin:10px 0 6px;">구성요소</h4>
      <div class="evidence-grid">${compsHtml}</div>

      ${actions ? `<div class="next-actions" style="margin-top:10px;"><h4>다음 행동 추천</h4><ol>${actions}</ol></div>` : ""}
      ${safety ? `<div class="next-actions" style="margin-top:8px;background:#fff7ed;border-color:#fed7aa;"><h4>안전 안내</h4><ul>${safety}</ul></div>` : ""}
    </div>
  `;
}

function renderLlmAnalysisPanel(llm) {
  if (!llm) return "";
  const cls = llm.overallRisk === "VERY_HIGH" || llm.overallRisk === "HIGH" ? "danger"
    : llm.overallRisk === "MEDIUM" ? "warn"
    : llm.overallRisk === "LOW" ? "ok" : "muted";
  const findings = Array.isArray(llm.findings) ? llm.findings.slice(0, 10) : [];
  const checklistItems = (llm.humanReviewChecklist || []).slice(0, 12).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  const missingItems = (llm.missingEvidence || []).slice(0, 10).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  const prohibitedItems = (llm.prohibitedPhrases || []).slice(0, 10).map((x) => escapeHtml(x)).join(" · ");
  const safetyItems = (llm.safetyWarnings || []).slice(0, 6).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  const agencyChips = (llm.agencyCandidates || []).slice(0, 6).map((a) => `<span class="badge ok">${escapeHtml(a)}</span>`).join(" ");

  const findingsHtml = findings.length
    ? findings.map((f) => `
      <div class="evi-item" style="border-left:4px solid ${f.riskLevel === "HIGH" ? "#b91c1c" : f.riskLevel === "MEDIUM" ? "#b45309" : "#6b7280"};">
        <div class="label">
          <span class="badge ${riskBadgeClass(f.riskLevel)}">${escapeHtml(f.riskLevel)}</span>
          <span style="margin-left:6px;">${escapeHtml(f.issue)}</span>
          ${f.sourceSection ? `<span class="muted" style="margin-left:6px;">(${escapeHtml(f.sourceSection)})</span>` : ""}
        </div>
        <div class="value">${escapeHtml(f.evidence)}</div>
        <div class="muted" style="margin-top:4px;font-size:12px;">${escapeHtml(f.reason)}</div>
      </div>
    `).join("")
    : '<p class="muted">제시된 finding이 없습니다.</p>';

  const analysisMode = llm.analysisMode || "mock";
  const modeLabel = analysisMode === "real" ? "Real (실제 API)"
    : analysisMode === "fallback" ? "Fallback (실제 호출 실패 → mock)"
    : "Mock (API 미호출)";
  const modeCls = analysisMode === "real" ? "ok" : analysisMode === "fallback" ? "warn" : "muted";
  const usedApiLabel = llm.usedExternalApi === true ? "외부 API 사용함" : "외부 API 미사용";

  return `
    <div class="result-section">
      <h4>AI 문맥 판단 (Analyzer Agent)</h4>
      <p class="muted" style="margin:4px 0;">
        <span class="badge ${modeCls}">분석 모드 ${escapeHtml(modeLabel)}</span>
        <span class="badge muted">${escapeHtml(usedApiLabel)}</span>
      </p>
      <p class="muted" style="margin:4px 0;">
        <span class="badge ${cls}">위험도 ${escapeHtml(llm.overallRisk || "")}</span>
        <span class="badge ${riskBadgeClass(llm.violationLikelihood)}">위반 가능성 ${escapeHtml(llm.violationLikelihood || "")}</span>
        신뢰도 ${Math.round((llm.confidence || 0) * 100)}%
      </p>
      <p>${escapeHtml(llm.summary || "")}</p>

      <h4 style="margin:10px 0 6px;">신고처 후보</h4>
      <p>${agencyChips || escapeHtml(llm.recommendedAgency || "(없음)")}</p>

      <h4 style="margin:10px 0 6px;">문제될 수 있는 표현 (findings)</h4>
      <div class="evidence-grid">${findingsHtml}</div>

      ${missingItems ? `<h4 style="margin:10px 0 6px;">보완 증거</h4><ul>${missingItems}</ul>` : ""}

      <h4 style="margin:10px 0 6px;">신고서 초안용 중립 문구</h4>
      <p class="muted" style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:10px 12px;">${escapeHtml(llm.reportDraftSummary || "")}</p>

      ${prohibitedItems ? `<h4 style="margin:10px 0 6px;">피해야 할 표현</h4><p class="muted">${prohibitedItems}</p>` : ""}

      ${checklistItems ? `<h4 style="margin:10px 0 6px;">사람 검토 체크리스트</h4><ul>${checklistItems}</ul>` : ""}

      ${safetyItems ? `<div class="next-actions" style="margin-top:10px;"><h4>안전 안내</h4><ul>${safetyItems}</ul></div>` : ""}

      <p class="muted" style="margin-top:8px;">⚠ AI 분석 결과는 법 위반 확정이 아니며, 신고 전 사람이 공식 기준과 증거를 검토해야 합니다.</p>
    </div>
  `;
}

function riskBadgeClass(riskLevel) {
  if (riskLevel === "HIGH" || riskLevel === "매우 높음" || riskLevel === "높음") return "danger";
  if (riskLevel === "MEDIUM" || riskLevel === "검토 필요") return "warn";
  return "muted";
}

function renderRuleDetectionPanel(rd) {
  if (!rd) return "";
  const counts = rd.counts || { HIGH: 0, MEDIUM: 0, LOW: 0, combo: 0, total: 0 };
  const matches = Array.isArray(rd.matches) ? rd.matches : [];
  const segments = Array.isArray(rd.highlightedSegments) ? rd.highlightedSegments : [];
  const repeated = Array.isArray(rd.repeatedPhrases) ? rd.repeatedPhrases : [];
  const cooc = rd.cooccurrence || {};

  // 탐지 결과가 없을 때 — 명시적 안내
  if (matches.length === 0) {
    return `
      <div class="result-section">
        <h4>위반 의심 문구 탐지 (Rule Agent)</h4>
        <div class="detect-empty">탐지된 의심 문구 없음. 다만 최종 판단은 사람이 해야 합니다.</div>
        <p class="muted" style="margin-top:8px;">${escapeHtml(rd.safetyNotice || "이 결과는 법 위반 확정이 아니라 신고 후보 검토용입니다.")}</p>
      </div>
    `;
  }

  const top = matches.slice(0, 15);
  const matchRows = top.map((m) => `
    <tr>
      <td><span class="badge ${riskBadgeClass(m.riskLevel)}">${escapeHtml(m.riskLevel)}</span></td>
      <td><strong>${escapeHtml(m.keyword)}</strong><div class="muted" style="font-size:11.5px;">${escapeHtml(m.category)} · ${escapeHtml(m.sourceSection || "main")}</div></td>
      <td class="muted" style="font-size:12.5px;">${escapeHtml(m.reason)}</td>
      <td style="font-size:12.5px;">${escapeHtml(m.excerpt || m.sentence || "")}</td>
    </tr>
  `).join("");

  const repeatHtml = repeated.length
    ? `<span class="badge warn">동일 문구 반복 있음</span> <span class="muted" style="font-size:12px;">${repeated.map((r) => `${escapeHtml(r.keyword)}×${r.count}`).join(" · ")}</span>`
    : `<span class="badge muted">동일 문구 반복 없음</span>`;
  const coocHtml = `
    ${cooc.productAndDisease ? '<span class="badge danger">상품(군)+질병명 동시 등장</span>' : '<span class="badge muted">상품+질병 동시 등장 없음</span>'}
    ${cooc.treatmentAndDisease ? '<span class="badge danger">치료/예방 표현+질병명 동시 등장</span>' : '<span class="badge muted">치료표현+질병 동시 등장 없음</span>'}
  `;

  return `
    <div class="result-section">
      <h4>위반 의심 문구 탐지 (Rule Agent)</h4>
      <p class="muted">위험도 점수 ${rd.riskScore || 0}/100 · 등급 ${escapeHtml(rd.riskLevel || "")} · HIGH ${counts.HIGH} / MEDIUM ${counts.MEDIUM} / LOW ${counts.LOW} / 조합 ${counts.combo} (총 ${counts.total}건)</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0;">${repeatHtml} ${coocHtml}</div>
      <div class="safety-banner" style="margin:6px 0;">법 위반 확정 아님 · 신고 전 사람 검토 필요</div>
      <h4 style="margin:10px 0 6px;">탐지된 의심 문구</h4>
      <div style="overflow-x:auto;">
        <table class="detect-table">
          <thead><tr><th>위험등급</th><th>의심 문구</th><th>탐지 이유</th><th>원문 문맥</th></tr></thead>
          <tbody>${matchRows}</tbody>
        </table>
      </div>
      ${matches.length > top.length ? `<p class="muted" style="font-size:12px;">상위 ${top.length}건 표시 (총 ${matches.length}건)</p>` : ""}
    </div>
  `;
}

function renderExtractionPanel(extraction) {
  if (!extraction) return "";
  const top = (arr, n = 5) => (Array.isArray(arr) ? arr.slice(0, n) : []);
  const bullet = (arr) =>
    top(arr).length
      ? `<ul>${top(arr).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
      : '<p class="muted">없음</p>';
  const inline = (arr) =>
    top(arr).length ? top(arr).map(escapeHtml).join(" · ") : "—";
  const warns = top(extraction.extractionWarnings, 10);
  const hints = top(extraction.removedBoilerplateHints, 10);
  return `
    <div class="result-section">
      <h4>본문 추출 결과 (사람 검토용)</h4>
      <p class="muted">${escapeHtml(extraction.productName || "상품명 미식별")} · 본문 ${extraction.textLength || 0}자 · 의심 문구 ${(extraction.claimCandidates || []).length}건 · 후기 ${(extraction.reviewCandidates || []).length}건 · 성분 ${(extraction.ingredientCandidates || []).length}건 · 주의 ${(extraction.warningCandidates || []).length}건</p>
      <details style="margin-top:6px;">
        <summary style="cursor:pointer;font-weight:700;font-size:13px;">상세 펼치기 (각 카테고리 상위 5개)</summary>
        <div style="margin-top:8px;">
          <h4 style="margin:6px 0;">상품명</h4>
          <p>${escapeHtml(extraction.productName || "—")}</p>
          <h4 style="margin:6px 0;">가격 후보</h4>
          <p>${inline(extraction.priceCandidates)}</p>
          <h4 style="margin:6px 0;">의심 광고 문구 후보</h4>
          ${bullet(extraction.claimCandidates)}
          <h4 style="margin:6px 0;">후기/리뷰 문구</h4>
          ${bullet(extraction.reviewCandidates)}
          <h4 style="margin:6px 0;">성분/원료</h4>
          ${bullet(extraction.ingredientCandidates)}
          <h4 style="margin:6px 0;">섭취 방법</h4>
          ${bullet(extraction.usageCandidates)}
          <h4 style="margin:6px 0;">주의사항</h4>
          ${bullet(extraction.warningCandidates)}
          <h4 style="margin:6px 0;">판매자 정보</h4>
          ${bullet(extraction.sellerCandidates)}
          ${warns.length ? `<h4 style="margin:6px 0;">추출 경고</h4><p class="muted">${warns.map(escapeHtml).join(" · ")}</p>` : ""}
          ${hints.length ? `<h4 style="margin:6px 0;">제거된 boilerplate 힌트</h4><p class="muted">${hints.map(escapeHtml).join(" · ")}</p>` : ""}
        </div>
      </details>
    </div>
  `;
}

function severityBadge(sev) {
  if (sev === "critical" || sev === "high") return "danger";
  if (sev === "medium") return "warn";
  return "muted";
}

// ---------- Evidence ----------
function renderEvidence(c) {
  const root = document.getElementById("evidence");
  const ev = c.evidence || {};
  const items = [
    { label: "원본 URL", value: c.url ? `<a href="${escapeAttr(c.url)}" target="_blank" rel="noreferrer">${escapeHtml(c.url)}</a>` : "—", ok: !!c.url },
    { label: "수집일시", value: escapeHtml(ev.capturedAt || c.createdAt || "—"), ok: !!(ev.capturedAt || c.createdAt) },
    { label: "페이지 제목", value: escapeHtml(c.title || "—"), ok: !!c.title },
    { label: "스크린샷 저장", value: ev.screenshotPath ? "저장됨" : "없음", ok: !!ev.screenshotPath },
    { label: "PDF 저장", value: ev.pdfPath ? "저장됨" : "없음", ok: !!ev.pdfPath },
    { label: "텍스트 추출", value: ev.textPath ? "저장됨" : "없음", ok: !!ev.textPath },
    { label: "신고서 초안", value: c.reportPath ? "생성됨" : "없음", ok: !!c.reportPath }
  ];
  const fileLinkRow = c.id ? `
    <p class="muted" style="margin-top:8px;">
      파일 열람:
      <a href="/api/cases/${escapeAttr(c.id)}/evidence/page.html" target="_blank" rel="noreferrer">HTML</a> ·
      <a href="/api/cases/${escapeAttr(c.id)}/evidence/page.txt" target="_blank" rel="noreferrer">TEXT</a> ·
      <a href="/api/cases/${escapeAttr(c.id)}/evidence/screenshot.png" target="_blank" rel="noreferrer">PNG</a> ·
      <a href="/api/cases/${escapeAttr(c.id)}/evidence/page.pdf" target="_blank" rel="noreferrer">PDF</a> ·
      <a href="/api/cases/${escapeAttr(c.id)}/evidence/manifest.json" target="_blank" rel="noreferrer">manifest</a> ·
      <a href="/api/cases/${escapeAttr(c.id)}/evidence/package" target="_blank" rel="noreferrer">package summary</a>
    </p>` : "";
  root.innerHTML = `
    <p class="section-hint">아래 증거는 사람이 외부 신고기관에 직접 제출할 때 참고·첨부할 수 있도록 정리됩니다. 자동 신고 기능은 제공되지 않습니다.</p>
    <div class="evidence-grid">
      ${items.map((i) => `
        <div class="evi-item ${i.ok ? "ok" : "miss"}">
          <div class="label">${escapeHtml(i.label)}</div>
          <div class="value">${i.value}</div>
        </div>
      `).join("")}
    </div>
    <div id="evidencePackageSummary" class="muted" style="margin-top:8px;">증거 패키지 요약 로드 중...</div>
    ${fileLinkRow}
  `;
  if (c.id) loadEvidencePackageSummary(c.id);
}

async function loadEvidencePackageSummary(caseId) {
  const root = document.getElementById("evidencePackageSummary");
  if (!root) return;
  try {
    const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/evidence/package`);
    if (!res.ok) { root.textContent = "패키지 요약을 가져오지 못했습니다."; return; }
    const data = await res.json();
    const s = data && data.evidencePackage;
    if (!s || !s.exists) { root.textContent = "증거 패키지가 아직 없습니다."; return; }
    const score = Number(s.completenessScore || 0);
    const cls = score >= 80 ? "ok" : score >= 50 ? "warn" : "muted";
    root.innerHTML = `
      <span class="badge ${cls}">증거 완성도 ${score}/100</span>
      <span style="margin-left:6px;">파일 ${s.fileCount}개 · ${Math.round((s.totalBytes || 0) / 1024)} KB</span>
      <span class="muted" style="margin-left:6px;">
        HTML ${s.hasHtml ? "✓" : "—"} · TEXT ${s.hasText ? "✓" : "—"} · PNG ${s.hasScreenshot ? "✓" : "—"} · PDF ${s.hasPdf ? "✓" : "—"} · metadata ${s.hasMetadata ? "✓" : "—"} · manifest ${s.hasManifest ? "✓" : "—"}
      </span>
      <div class="muted" style="margin-top:4px;font-size:12px;">${escapeHtml(s.safetyNotice || "")}</div>
    `;
  } catch (err) {
    root.textContent = `패키지 요약 오류: ${err.message}`;
  }
}

// ---------- Human Review Queue ----------
function bindQueue() {
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.matches("[data-queue-tab]")) {
      e.preventDefault();
      state.queue.statusFilter = t.getAttribute("data-queue-tab");
      writeLS(LS_KEYS.queueTab, state.queue.statusFilter);
      loadQueue();
    }
    if (t.matches("[data-queue-sort]")) {
      e.preventDefault();
      state.queue.sort = t.getAttribute("data-queue-sort");
      writeLS(LS_KEYS.queueSort, state.queue.sort);
      loadQueue();
    }
    if (t.matches("[data-queue-open]")) {
      e.preventDefault();
      openQueueDetail(t.getAttribute("data-queue-open"));
    }
    if (t.matches("[data-queue-close]")) {
      e.preventDefault();
      const m = document.getElementById("queueDetailModal");
      if (m) m.classList.remove("open");
      state.queueDetail = null;
    }
    if (t.matches("[data-queue-status]")) {
      e.preventDefault();
      onQueueStatusButton(t);
    }
    if (t.id === "queueNoteSaveBtn") {
      e.preventDefault();
      onQueueNoteSave();
    }
  });
}

async function loadQueue() {
  const root = document.getElementById("caseList");
  if (!root) return;
  const filter = state.queue.statusFilter || "ALL";
  const sort = state.queue.sort || "priority";
  const qs = new URLSearchParams({ sort });
  if (filter && filter !== "ALL") qs.set("status", filter);
  qs.set("limit", "50");
  try {
    const res = await fetch(`/api/review/queue?${qs.toString()}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || "queue fetch failed");
    state.queue.items = data.items || [];
    state.queue.summary = data.summary;
    state.cases = state.queue.items; // 기존 코드 호환 (showCaseDetail 등에서 참조)
    renderQueue(root);
  } catch (err) {
    root.innerHTML = `<div class="code">${escapeHtml(err.message)}</div>`;
  }
}

function renderQueue(root) {
  const counts = (state.queue.summary && state.queue.summary.counts) || {};
  const filter = state.queue.statusFilter || "ALL";
  const items = state.queue.items || [];

  const countsHtml = QUEUE_STATUSES.map((s) => `
    <div class="evi-item" style="text-align:center;padding:8px 10px;">
      <div class="label" style="font-size:11px;">${escapeHtml(STATUS_LABEL[s] || s)}</div>
      <div class="value" style="font-size:18px;">${counts[s] || 0}</div>
    </div>
  `).join("");

  const tabs = ["ALL", ...QUEUE_STATUSES].map((s) => {
    const active = s === filter;
    const label = s === "ALL" ? "전체" : (STATUS_LABEL[s] || s);
    const c = s === "ALL" ? (state.queue.summary?.total ?? 0) : (counts[s] || 0);
    return `<button class="badge ${active ? 'ok' : 'muted'}" type="button" data-queue-tab="${escapeAttr(s)}" style="border:0;cursor:pointer;padding:6px 10px;font-weight:700;">${escapeHtml(label)} ${c}</button>`;
  }).join(" ");

  const sortBtns = `
    <button class="badge ${state.queue.sort === 'priority' ? 'ok' : 'muted'}" type="button" data-queue-sort="priority" style="border:0;cursor:pointer;padding:6px 10px;font-weight:700;">우선순위↓</button>
    <button class="badge ${state.queue.sort === 'recent' ? 'ok' : 'muted'}" type="button" data-queue-sort="recent" style="border:0;cursor:pointer;padding:6px 10px;font-weight:700;">최신순</button>
  `;

  const cardsHtml = items.length === 0
    ? '<p class="muted" style="margin-top:10px;">조건에 맞는 Case가 없습니다. 위에서 후보 발굴 또는 수동 URL 분석을 실행해 보세요.</p>'
    : items.map((c) => {
        const mod = MODULES.find((m) => m.id === c.moduleId);
        const grade = gradeFromScore(c.priorityScore || 0);
        const statusKey = c.status || "DRAFT";
        return `
          <div class="case">
            <div>
              <div class="title">${escapeHtml(c.title || c.url || c.id)}</div>
              <div class="meta">
                ${escapeHtml(mod ? mod.name : c.moduleId)} ·
                신고처: ${escapeHtml(c.agencyCandidate || (mod && mod.agency) || "—")} ·
                ${escapeHtml(c.createdAt)} ·
                ${c.hasEvidencePackage ? "증거 ✓" : "증거 —"} · ${c.hasReportDraft ? "신고서 ✓" : "신고서 —"}
              </div>
            </div>
            <div class="badges">
              <span class="badge ${grade.cls.replace('grade-', '')}">우선순위 ${c.priorityScore ?? 0}</span>
              <span class="badge ${STATUS_BADGE[statusKey] || 'muted'}">${escapeHtml(STATUS_LABEL[statusKey] || statusKey)}</span>
              <button class="ghost" type="button" data-queue-open="${escapeAttr(c.id)}">상세보기</button>
            </div>
          </div>
        `;
      }).join("");

  root.innerHTML = `
    <p class="muted" style="margin-bottom:8px;">⚠ 이 시스템은 자동 신고를 수행하지 않습니다. SUBMITTED 상태는 외부에 사람이 직접 제출한 사실을 내부에 기록하는 표시일 뿐입니다.</p>
    <h4 style="margin:6px 0;">상태별 현황</h4>
    <div class="evidence-grid" style="grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));">${countsHtml}</div>
    <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">${tabs}</div>
    <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">${sortBtns}</div>
    <div style="margin-top:10px;">${cardsHtml}</div>
    ${renderQueueDetailModal()}
  `;
}

function renderQueueDetailModal() {
  return `
    <div class="modal-backdrop" id="queueDetailModal">
      <div class="modal" style="max-width:780px;width:100%;max-height:90vh;overflow:auto;">
        <h3 id="queueDetailTitle">Case 상세</h3>
        <p class="muted" id="queueDetailSafety">⚠ 이 시스템은 자동 신고를 수행하지 않습니다.</p>
        <div id="queueDetailBody"><p class="muted">불러오는 중...</p></div>
        <div class="actions">
          <button class="ghost" type="button" data-queue-close="1">닫기</button>
        </div>
      </div>
    </div>
  `;
}

async function openQueueDetail(caseId) {
  if (!caseId) return;
  const m = document.getElementById("queueDetailModal");
  if (m) m.classList.add("open");
  const body = document.getElementById("queueDetailBody");
  if (body) body.innerHTML = '<p class="muted">불러오는 중...</p>';
  try {
    const res = await fetch(`/api/review/queue/${encodeURIComponent(caseId)}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || "detail fetch failed");
    state.queueDetail = data;
    renderQueueDetail(data);
  } catch (err) {
    if (body) body.innerHTML = `<div class="code">${escapeHtml(err.message)}</div>`;
  }
}

function renderQueueDetail(d) {
  const c = d.case;
  if (!c) return;
  const title = document.getElementById("queueDetailTitle");
  if (title) title.textContent = c.title || c.id;
  const allowedFrom = Array.isArray(d.allowedFrom) ? d.allowedFrom : [];
  const ev = d.evidencePackage;
  const rs = d.reportSummary;
  const rd = c.ruleDetection;
  const llm = c.llmAnalysis;
  const sc = c.scoringResult;

  const transitionBtns = allowedFrom.map((to) => {
    const label = STATUS_LABEL[to] || to;
    return `<button class="primary" type="button" data-queue-status="${escapeAttr(to)}" style="padding:8px 12px;font-size:13px;">→ ${escapeHtml(label)}</button>`;
  }).join(" ");

  const logs = (d.logs || []).slice(0, 15).map((l) => {
    const kind = l.kind === "STATUS_CHANGE"
      ? `${escapeHtml(STATUS_LABEL[l.fromStatus] || l.fromStatus || "?")} → ${escapeHtml(STATUS_LABEL[l.toStatus] || l.toStatus || "?")}`
      : "메모";
    return `<li><span class="muted">[${escapeHtml(l.createdAt)}]</span> ${escapeHtml(kind)}${l.reviewerName ? ` · ${escapeHtml(l.reviewerName)}` : ""}${l.note ? ` · ${escapeHtml(l.note)}` : ""}</li>`;
  }).join("");

  const evLine = ev && ev.exists
    ? `완성도 ${ev.completenessScore}/100 · 파일 ${ev.fileCount}개`
    : "증거 패키지 미생성";
  const rsLine = rs && rs.exists
    ? `생성됨 ${escapeHtml(rs.generatedAt || "")} · ${["MD", "TXT", "DOCX"].filter((_, i) => [rs.hasMarkdown, rs.hasText, rs.hasDocx][i]).join(" / ") || "—"}`
    : "신고서 초안 미생성 (체크리스트 15 이후 사용 가능)";

  const body = document.getElementById("queueDetailBody");
  if (!body) return;
  body.innerHTML = `
    <div class="muted" style="margin-bottom:6px;">
      <span class="badge ${STATUS_BADGE[c.status] || 'muted'}">${escapeHtml(STATUS_LABEL[c.status] || c.status)}</span>
      <span class="badge ${gradeFromScore(c.riskScore || 0).cls.replace('grade-', '')}">우선순위 ${c.riskScore ?? 0}</span>
      ${c.url ? `· <a href="${escapeAttr(c.url)}" target="_blank" rel="noreferrer">${escapeHtml(c.url)}</a>` : ""}
    </div>
    <p>${escapeHtml(c.summary || "(요약 없음)")}</p>

    <h4 style="margin:10px 0 4px;">Rule Agent</h4>
    <p class="muted">매치 ${(rd?.counts?.total ?? 0)}건 (HIGH ${rd?.counts?.HIGH ?? 0} / MEDIUM ${rd?.counts?.MEDIUM ?? 0} / LOW ${rd?.counts?.LOW ?? 0} / 조합 ${rd?.counts?.combo ?? 0})</p>

    <h4 style="margin:10px 0 4px;">AI 문맥 판단</h4>
    <p class="muted">위험도 ${escapeHtml(llm?.overallRisk || "—")} · 위반 가능성 ${escapeHtml(llm?.violationLikelihood || "—")} · 신뢰도 ${Math.round((llm?.confidence || 0) * 100)}%</p>

    <h4 style="margin:10px 0 4px;">우선순위 점수</h4>
    <p class="muted">${sc ? `${sc.priorityScore}/100 (${escapeHtml(sc.priorityLabel)})` : "(미계산)"}</p>

    <h4 style="margin:10px 0 4px;">증거 패키지</h4>
    <p class="muted">${escapeHtml(evLine)} ·
      <a href="/api/cases/${escapeAttr(c.id)}/evidence/package" target="_blank" rel="noreferrer">summary</a> ·
      <a href="/api/cases/${escapeAttr(c.id)}/evidence/manifest.json" target="_blank" rel="noreferrer">manifest</a>
    </p>

    <h4 style="margin:10px 0 4px;">신고서 초안</h4>
    <p class="muted">${escapeHtml(rsLine)} ·
      <a href="/api/cases/${escapeAttr(c.id)}/report/report.md" target="_blank" rel="noreferrer">MD</a> ·
      <a href="/api/cases/${escapeAttr(c.id)}/report/report.txt" target="_blank" rel="noreferrer">TXT</a> ·
      <a href="/api/cases/${escapeAttr(c.id)}/report/report.docx" target="_blank" rel="noreferrer">DOCX</a>
    </p>

    <h4 style="margin:10px 0 4px;">공식 신고처 열기 (외부 링크)</h4>
    <div id="queueOfficialLinks" class="muted">불러오는 중...</div>
    <ul class="muted" style="font-size:12px;margin:4px 0;padding-left:18px;list-style:disc;">
      <li>공식 신고처 링크만 제공합니다.</li>
      <li>실제 신고는 사용자가 공식 창구에서 직접 제출해야 합니다.</li>
      <li>공익레이더는 자동 제출·자동 로그인·자동 양식입력을 하지 않습니다.</li>
    </ul>

    <h4 style="margin:10px 0 4px;">상태 변경</h4>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">${transitionBtns || '<span class="muted">전이 가능한 상태가 없습니다.</span>'}</div>

    <h4 style="margin:10px 0 4px;">검토 메모</h4>
    <textarea id="queueNoteInput" placeholder="메모를 입력하세요" style="min-height:60px;"></textarea>
    <div style="display:flex;gap:6px;align-items:center;margin-top:6px;">
      <input id="queueReviewerName" type="text" placeholder="검토자 이름 (선택)" style="max-width:240px;" />
      <button class="primary" type="button" id="queueNoteSaveBtn" style="padding:8px 12px;font-size:13px;">메모 저장</button>
      <span id="queueNoteStatus" class="muted" style="font-size:12px;"></span>
    </div>

    <div id="feedbackFormBox" style="margin-top:10px;"></div>

    <h4 style="margin:10px 0 4px;">최근 로그</h4>
    <ul style="font-size:12.5px;">${logs || "<li class='muted'>로그 없음</li>"}</ul>
  `;
  loadApprovalGateLinks(c.moduleId);
  // 피드백 입력 영역
  state.feedback.selectedReasons = new Set();
  // 기본 결정값을 case 상태로 추정
  if (c.status === "HOLD") state.feedback.selectedDecision = "HOLD";
  else if (c.status === "APPROVED") state.feedback.selectedDecision = "APPROVE";
  else state.feedback.selectedDecision = "REJECT";
  loadCaseFeedbacks(c.id).then(renderFeedbackForm);
  renderFeedbackForm();
}

async function loadApprovalGateLinks(moduleId) {
  const root = document.getElementById("queueOfficialLinks");
  if (!root) return;
  try {
    const res = await fetch(`/api/policy/approval-gate?moduleId=${encodeURIComponent(moduleId || "false_ad")}`);
    const data = await res.json();
    const links = Array.isArray(data.officialReportingLinks) ? data.officialReportingLinks
      : Array.isArray(data.officialLinks) ? data.officialLinks : null;
    if (!data.ok || !links) {
      root.textContent = "공식 링크를 불러오지 못했습니다.";
      return;
    }
    if (links.length === 0) {
      root.textContent = "공식 링크 데이터가 등록되어 있지 않습니다.";
      return;
    }
    root.innerHTML = links.map((l) => `
      <div class="evi-item" style="border-left:4px solid #2563eb;margin-bottom:4px;">
        <div class="label">${escapeHtml(l.agencyName)}</div>
        <div class="value">
          <a href="${escapeAttr(l.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(l.label)} →</a>
        </div>
        <div class="muted" style="font-size:12px;margin-top:4px;">${escapeHtml(l.caution)}</div>
      </div>
    `).join("");
  } catch (err) {
    root.textContent = "공식 링크 fetch 실패: " + err.message;
  }
}

async function onQueueStatusButton(btn) {
  const toStatus = btn.getAttribute("data-queue-status");
  const d = state.queueDetail;
  if (!d || !d.case || !toStatus) return;
  const caseId = d.case.id;
  let confirmManualSubmission = undefined;
  let note = undefined;
  if (toStatus === "SUBMITTED") {
    const yes = window.confirm("이미 외부 공식 신고 창구에 사람이 직접 제출했습니까?\n이 버튼은 내부 상태만 변경하며 자동 제출을 하지 않습니다.");
    if (!yes) return;
    confirmManualSubmission = true;
    note = "외부 공식 창구에 사람이 직접 제출한 뒤 내부 기록으로 변경";
  }
  const body = { status: toStatus, confirmManualSubmission, note };
  const reviewerInput = document.getElementById("queueReviewerName");
  if (reviewerInput && reviewerInput.value) body.reviewerName = reviewerInput.value;
  try {
    const res = await fetch(`/api/review/queue/${encodeURIComponent(caseId)}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    await openQueueDetail(caseId);
    await loadQueue();
  } catch (err) {
    alert("상태 변경 실패: " + err.message);
  }
}

async function onQueueNoteSave() {
  const d = state.queueDetail;
  if (!d || !d.case) return;
  const noteEl = document.getElementById("queueNoteInput");
  const statusEl = document.getElementById("queueNoteStatus");
  const reviewerEl = document.getElementById("queueReviewerName");
  const note = noteEl ? noteEl.value.trim() : "";
  if (!note) { if (statusEl) statusEl.textContent = "메모를 입력하세요."; return; }
  try {
    const res = await fetch(`/api/review/queue/${encodeURIComponent(d.case.id)}/note`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note, reviewerName: reviewerEl?.value || undefined })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    if (statusEl) statusEl.textContent = "메모가 저장되었습니다.";
    if (noteEl) noteEl.value = "";
    await openQueueDetail(d.case.id);
  } catch (err) {
    if (statusEl) statusEl.textContent = "저장 실패: " + err.message;
  }
}

// 분석 결과 영역에서 사용하는 기존 함수 — 인라인 미리보기로만 사용
function showCaseDetail(id) {
  const c = state.cases.find((x) => x.id === id);
  if (!c) {
    openQueueDetail(id);
    return;
  }
  renderResult(c);
  renderEvidence(c);
  renderProcess("done");
  document.getElementById("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- Discovery ----------
function bindDiscovery() {
  const discoverBtn = document.getElementById("discoverBtn");
  const refreshBtn = document.getElementById("refreshCandidatesBtn");
  if (discoverBtn) discoverBtn.addEventListener("click", runDiscovery);
  if (refreshBtn) refreshBtn.addEventListener("click", loadCandidates);
}

async function loadTopics() {
  const statusEl = document.getElementById("discoveryStatus");
  const chips = document.getElementById("topicChips");
  try {
    const res = await fetch(`/api/discovery/topics?moduleId=${encodeURIComponent(state.selectedModuleId)}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || "topics fetch failed");
    state.topics = data.topics || [];
    if (statusEl) statusEl.textContent = `사용 가능한 주제: ${state.topics.length}건`;
    if (chips) renderTopicChips();
  } catch (err) {
    if (statusEl) statusEl.textContent = "주제 목록을 불러오지 못했습니다: " + err.message;
  }
}

function renderTopicChips() {
  const chips = document.getElementById("topicChips");
  if (!chips) return;
  chips.innerHTML = state.topics.map((t) => {
    const active = state.selectedTopicIds.has(t.id);
    return `<button type="button" class="badge ${active ? "ok" : "muted"}" data-topic="${escapeAttr(t.id)}" style="padding:6px 10px;border:0;cursor:pointer;font-weight:700;">${escapeHtml(t.label)}</button>`;
  }).join("");
  chips.querySelectorAll("button[data-topic]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-topic");
      if (state.selectedTopicIds.has(id)) state.selectedTopicIds.delete(id);
      else state.selectedTopicIds.add(id);
      renderTopicChips();
    });
  });
}

async function runDiscovery() {
  const discoverBtn = document.getElementById("discoverBtn");
  const candidateList = document.getElementById("candidateList");
  const selected = [...state.selectedTopicIds];
  if (selected.length === 0) {
    openModal("주제를 1개 이상 선택하세요", "탐색할 주제를 골라야 후보를 발굴할 수 있습니다.");
    return;
  }
  const mode = document.getElementById("discoveryMode").value || "quick";
  discoverBtn.disabled = true;
  candidateList.innerHTML = '<p class="muted">후보를 찾는 중입니다...</p>';
  try {
    const res = await fetch("/api/discovery/candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ moduleId: state.selectedModuleId, topics: selected, mode })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || "discovery failed");
    await loadCandidates();
    const banner = document.createElement("p");
    banner.className = "muted";
    banner.style.marginTop = "8px";
    const dedupeInfo = data.dedupe
      ? ` · Dedupe: ${data.dedupe.kept}/${data.dedupe.total} 유지 (중복 ${data.dedupe.duplicates}, 유사 ${data.dedupe.possibleDuplicates}, 중복률 ${(data.dedupe.duplicateRate * 100).toFixed(1)}%)`
      : "";
    banner.textContent = `발굴 모드: ${data.discoveryMode || data.mode || ""} · 신규 추가 ${data.added}건${dedupeInfo}. 본문 분석과 사람 검토가 필요합니다.`;
    candidateList.prepend(banner);
  } catch (err) {
    // API 실패 시 빨간 오류로 중단하지 말고 안전 안내 카드로 표시한다 (체크리스트 26).
    candidateList.innerHTML = `
      <div class="input-notice" style="border-left:4px solid #f59e0b;">
        <strong>후보 발굴을 완료하지 못했습니다 (안전 안내)</strong>
        <ul>
          <li>외부 API 호출에 실패했거나 키가 없을 수 있습니다. 서버는 계속 동작합니다.</li>
          <li>Mock 모드로 다시 시도하거나, 수동 URL 분석을 사용할 수 있습니다.</li>
          <li>후보 URL은 신고 대상 확정이 아니라 분석 후보입니다. 자동 신고는 하지 않습니다.</li>
        </ul>
        <p class="muted" style="font-size:12px;margin:4px 0 0;">상세: ${escapeHtml(String(err.message || "unknown"))}</p>
      </div>`;
  } finally {
    discoverBtn.disabled = false;
  }
}

async function loadCandidates() {
  const root = document.getElementById("candidateList");
  try {
    const res = await fetch(`/api/discovery/candidates?moduleId=${encodeURIComponent(state.selectedModuleId)}&limit=50`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || "candidate list failed");
    state.candidates = data.candidates || [];
    if (state.candidates.length === 0) {
      root.innerHTML = '<p class="muted">아직 후보가 없습니다. 위에서 "후보 자동 찾기"를 실행하세요.</p>';
      return;
    }
    root.innerHTML = state.candidates.map((c) => {
      const grade = gradeFromScore(c.firstScore);
      const isAnalyzed = c.status === "ANALYZED";
      return `
        <div class="case">
          <div>
            <div class="title">${escapeHtml(c.title || c.url)}</div>
            <div class="meta">
              <a href="${escapeAttr(c.url)}" target="_blank" rel="noreferrer">${escapeHtml(c.url)}</a><br/>
              주제: ${escapeHtml(c.topic)} · 키워드: ${escapeHtml(c.keyword)} · ${escapeHtml(c.source)} (${escapeHtml(c.discoveryMethod)})
              ${c.snippet ? `<br/><span class="muted">${escapeHtml(c.snippet)}</span>` : ""}
              ${c.reasons && c.reasons.length ? `<br/><span class="muted">근거: ${c.reasons.map(escapeHtml).join(" · ")}</span>` : ""}
            </div>
          </div>
          <div class="badges">
            <span class="badge ${grade.cls.replace("grade-", "")}">1차점수 ${c.firstScore}</span>
            <span class="badge ${isAnalyzed ? "ok" : "muted"}">${escapeHtml(c.status)}</span>
            <button class="primary" data-analyze="${escapeAttr(c.id)}" type="button" ${isAnalyzed ? "disabled" : ""} style="padding:8px 12px;font-size:13px;">${isAnalyzed ? "분석 완료" : "분석하기"}</button>
            <button class="ghost" data-scout-queue="${escapeAttr(c.id)}" type="button" style="padding:8px 12px;font-size:13px;">대기열로 보내기</button>
            <button class="ghost" data-scout-reject="${escapeAttr(c.id)}" type="button" style="padding:8px 12px;font-size:13px;">폐기</button>
          </div>
        </div>
      `;
    }).join("");
    root.querySelectorAll("button[data-analyze]").forEach((btn) => {
      btn.addEventListener("click", () => analyzeCandidate(btn.getAttribute("data-analyze"), btn));
    });
    root.querySelectorAll("button[data-scout-queue]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-scout-queue");
        btn.disabled = true;
        try {
          const r = await fetch(`/api/scout/candidates/${encodeURIComponent(id)}/queue`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
          const d = await r.json();
          if (!d.ok) throw new Error(d.message || `HTTP ${r.status}`);
          alert("대기열로 보냈습니다. " + (d.note || ""));
          await loadCandidates();
          await loadQueue();
        } catch (e) {
          alert("실패: " + e.message);
        } finally { btn.disabled = false; }
      });
    });
    root.querySelectorAll("button[data-scout-reject]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-scout-reject");
        if (!window.confirm("후보를 폐기 상태로 변경하시겠습니까?")) return;
        btn.disabled = true;
        try {
          const r = await fetch(`/api/scout/candidates/${encodeURIComponent(id)}/reject`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
          const d = await r.json();
          if (!d.ok) throw new Error(d.message || `HTTP ${r.status}`);
          await loadCandidates();
        } catch (e) {
          alert("실패: " + e.message);
        } finally { btn.disabled = false; }
      });
    });
  } catch (err) {
    root.innerHTML = `<div class="code">${escapeHtml(err.message)}</div>`;
  }
}

async function analyzeCandidate(candidateId, btn) {
  const result = document.getElementById("result");
  const evidenceBox = document.getElementById("evidence");
  btn.disabled = true;
  btn.textContent = "분석 중...";
  result.innerHTML = '<p class="muted">후보 본문을 수집하고 분석 중입니다. 시간이 걸릴 수 있습니다.</p>';
  evidenceBox.innerHTML = '<p class="muted">분석이 끝나면 증거 패키지가 표시됩니다.</p>';
  renderProcess("running", 0);
  const stepTimers = [];
  for (let i = 1; i < PROCESS_STEPS.length - 1; i++) {
    stepTimers.push(setTimeout(() => renderProcess("running", i), i * 700));
  }
  try {
    const res = await fetch(`/api/discovery/candidates/${encodeURIComponent(candidateId)}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" }
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || "analyze failed");
    stepTimers.forEach(clearTimeout);
    renderProcess("done");
    renderResult(data.case);
    renderEvidence(data.case);
    await loadCandidates();
    await loadCases();
  } catch (err) {
    stepTimers.forEach(clearTimeout);
    renderProcess("pending");
    result.innerHTML = `<div class="code">${escapeHtml(err.message)}</div>`;
    evidenceBox.innerHTML = '<p class="muted">분석이 실패해 증거 패키지를 만들지 못했습니다. mock 후보는 실제 네트워크 호출에 실패할 수 있습니다.</p>';
    btn.disabled = false;
    btn.textContent = "분석하기";
  }
}

// ---------- Feedback DB (체크리스트 21) ----------
function bindFeedback() {
  const refreshBtn = document.getElementById("feedbackStatsRefreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", () => loadFeedbackStats());
  const impBtn = document.getElementById("feedbackImprovementsBtn");
  if (impBtn) impBtn.addEventListener("click", () => loadFeedbackImprovements());

  // 모달 내부 폼은 delegated handlers — renderQueueDetail이 매번 새로 그림
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.matches("[data-fb-reason]")) {
      e.preventDefault();
      const code = t.getAttribute("data-fb-reason");
      if (state.feedback.selectedReasons.has(code)) state.feedback.selectedReasons.delete(code);
      else state.feedback.selectedReasons.add(code);
      renderFeedbackForm();
    }
    if (t.id === "feedbackSaveBtn") {
      e.preventDefault();
      onFeedbackSave();
    }
    if (t.matches("[data-fb-decision]")) {
      e.preventDefault();
      state.feedback.selectedDecision = t.getAttribute("data-fb-decision");
      renderFeedbackForm();
    }
  });
}

async function loadFeedbackMeta() {
  try {
    const res = await fetch("/api/feedback/meta");
    const data = await res.json();
    if (data && data.ok) state.feedback.meta = data;
  } catch { /* ignore */ }
}

async function loadFeedbackStats() {
  const root = document.getElementById("feedbackStats");
  if (!root) return;
  try {
    const res = await fetch("/api/feedback/stats");
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || "feedback stats failed");
    state.feedback.stats = data.stats;
    renderFeedbackStats(root, data);
  } catch (err) {
    root.innerHTML = `<div class="code">${escapeHtml(err.message)}</div>`;
  }
}

function renderFeedbackStats(root, data) {
  const s = data.stats || {};
  const dec = s.byDecision || {};
  const rc = s.byReasonCategory || {};
  const evIss = s.evidenceIssueCounts || {};
  const topRules = (s.topRuleFalsePositiveIds || []).slice(0, 5);
  const topKws = (s.topKeywordFalsePositives || []).slice(0, 5);

  const cards = [
    { label: "총 피드백", value: s.total ?? 0, cls: "muted" },
    { label: "오탐 (FALSE_POSITIVE)", value: dec.FALSE_POSITIVE ?? 0, cls: "warn" },
    { label: "증거부족", value: evIss.EVIDENCE_INSUFFICIENT ?? 0, cls: "warn" },
    { label: "중복", value: dec.DUPLICATE ?? 0, cls: "muted" },
    { label: "보류", value: dec.HOLD ?? 0, cls: "muted" },
    { label: "폐기", value: dec.REJECT ?? 0, cls: "danger" }
  ];
  const cardsHtml = cards.map((c) => `
    <div class="evi-item" style="text-align:center;padding:8px 10px;">
      <div class="label" style="font-size:11px;">${escapeHtml(c.label)}</div>
      <div class="value" style="font-size:18px;">${escapeHtml(String(c.value))}</div>
    </div>
  `).join("");

  const rulesHtml = topRules.length
    ? topRules.map((r) => `<li><code>${escapeHtml(r.ruleId)}</code> · 오탐 ${r.count}건</li>`).join("")
    : '<li class="muted">아직 오탐 데이터가 없습니다.</li>';
  const kwsHtml = topKws.length
    ? topKws.map((k) => `<li>${escapeHtml(k.keyword)} · ${k.count}건</li>`).join("")
    : '<li class="muted">아직 오탐 키워드가 없습니다.</li>';

  root.innerHTML = `
    <div class="evidence-grid" style="grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));">${cardsHtml}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;">
      <div>
        <h4 style="margin:4px 0;">가장 많이 오탐된 Rule ID</h4>
        <ul style="font-size:12.5px;">${rulesHtml}</ul>
      </div>
      <div>
        <h4 style="margin:4px 0;">가장 많이 오탐된 키워드</h4>
        <ul style="font-size:12.5px;">${kwsHtml}</ul>
      </div>
    </div>
    <p class="muted" style="font-size:12px;margin-top:6px;">⚠ ${escapeHtml(data.safetyNotice || "피드백은 자동으로 룰을 변경하지 않습니다.")}</p>
  `;
}

async function loadFeedbackImprovements() {
  const root = document.getElementById("feedbackImprovements");
  if (!root) return;
  root.innerHTML = '<p class="muted">불러오는 중...</p>';
  try {
    const res = await fetch("/api/feedback/improvements");
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || "improvements failed");
    const r = (data.ruleImprovements || []).map((x) =>
      `<li><code>${escapeHtml(x.ruleId)}</code> · 오탐 ${x.falsePositiveCount}건 — ${escapeHtml(x.recommendation)}</li>`).join("");
    const p = (data.promptImprovements || []).map((x) =>
      `<li>${escapeHtml(x.issue)} · ${x.count}건 — ${escapeHtml(x.recommendation)}</li>`).join("");
    const sc = (data.scoringImprovements || []).map((x) =>
      `<li>${escapeHtml(x.issue)} · ${x.count}건 — ${escapeHtml(x.recommendation)}</li>`).join("");
    const ev = (data.evidenceImprovements || []).map((x) =>
      `<li>${escapeHtml(x.issue)} · ${x.count}건 — ${escapeHtml(x.recommendation)}</li>`).join("");
    root.innerHTML = `
      <p class="muted">${escapeHtml(data.message || "")}</p>
      <h4 style="margin:6px 0;">룰 개선 후보</h4>
      <ul style="font-size:12.5px;">${r || '<li class="muted">없음</li>'}</ul>
      <h4 style="margin:6px 0;">프롬프트 개선 후보</h4>
      <ul style="font-size:12.5px;">${p || '<li class="muted">없음</li>'}</ul>
      <h4 style="margin:6px 0;">점수 개선 후보</h4>
      <ul style="font-size:12.5px;">${sc || '<li class="muted">없음</li>'}</ul>
      <h4 style="margin:6px 0;">증거 개선 후보</h4>
      <ul style="font-size:12.5px;">${ev || '<li class="muted">없음</li>'}</ul>
      <p class="muted" style="font-size:12px;margin-top:6px;">⚠ ${escapeHtml(data.safetyNotice || "자동 변경이 아닙니다.")}</p>
    `;
  } catch (err) {
    root.innerHTML = `<div class="code">${escapeHtml(err.message)}</div>`;
  }
}

function renderFeedbackForm() {
  const root = document.getElementById("feedbackFormBox");
  if (!root) return;
  const meta = state.feedback.meta;
  const decisions = (meta && meta.decisions) || [];
  const cats = (meta && meta.reasonCategories) || [];
  const selectedDecision = state.feedback.selectedDecision;

  const decisionBtns = decisions.map((d) => {
    const active = d.code === selectedDecision;
    return `<button type="button" class="badge ${active ? 'ok' : 'muted'}" data-fb-decision="${escapeAttr(d.code)}" style="border:0;cursor:pointer;padding:6px 10px;font-weight:700;">${escapeHtml(d.label)}</button>`;
  }).join(" ");

  const reasonBtns = cats.map((c) => {
    const active = state.feedback.selectedReasons.has(c.code);
    return `<button type="button" class="badge ${active ? 'ok' : 'muted'}" data-fb-reason="${escapeAttr(c.code)}" title="${escapeAttr(c.description)}" style="border:0;cursor:pointer;padding:6px 10px;font-weight:700;">${escapeHtml(c.label)}</button>`;
  }).join(" ");

  const fbList = (state.feedback.caseFeedbacks || []).slice(0, 5).map((f) => {
    const ts = escapeHtml(f.createdAt || "");
    const dec = escapeHtml(f.decision || "");
    const reasons = (f.reasonCategories || []).join(", ");
    const memo = f.memo ? `<div class="muted" style="font-size:12px;">${escapeHtml(f.memo)}</div>` : "";
    const pii = f.piiMasked ? '<span class="badge warn" style="margin-left:6px;">PII 마스킹</span>' : "";
    return `<li><strong>${dec}</strong> · <span class="muted">${ts}</span>${pii}<br/><span class="muted" style="font-size:12px;">${escapeHtml(reasons)}</span>${memo}</li>`;
  }).join("");

  root.innerHTML = `
    <h4 style="margin:10px 0 4px;">검토 피드백</h4>
    <p class="muted" style="font-size:12px;">⚠ 피드백은 자동으로 룰을 변경하지 않습니다. 사람이 검토할 개선 근거로 누적됩니다. 메모에 개인정보가 들어오면 자동 마스킹됩니다.</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;"><span class="muted" style="font-size:12px;align-self:center;">결정:</span> ${decisionBtns}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;"><span class="muted" style="font-size:12px;align-self:center;">반려/오탐 사유:</span> ${reasonBtns}</div>
    <label style="font-size:12px;">검토자 메모 (필요 시)</label>
    <textarea id="feedbackMemo" placeholder="해당 후보를 왜 폐기/보류/오탐 처리했는지 적어주세요. (이메일/전화번호/주민번호는 자동 마스킹됩니다.)" style="min-height:60px;"></textarea>
    <label style="font-size:12px;">관련 룰 ID (콤마 구분, 선택)</label>
    <input id="feedbackRuleIds" type="text" placeholder="예: H004, M011" />
    <label style="font-size:12px;">관련 키워드 (콤마 구분, 선택)</label>
    <input id="feedbackKeywords" type="text" placeholder="예: 당뇨 완치, 혈압약 대체" />
    <label style="font-size:12px;">LLM 판단 오류 메모 (선택)</label>
    <input id="feedbackLlmNotes" type="text" placeholder="LLM이 과장/축소했다면 한 줄로" />
    <label style="font-size:12px;">점수 오류 메모 (선택)</label>
    <input id="feedbackScoringNotes" type="text" placeholder="점수가 과대평가되었다면 한 줄로" />
    <label style="font-size:12px;">개선 제안 (룰 / 프롬프트 / 점수 — 콤마 구분, 선택)</label>
    <input id="feedbackSuggestRule" type="text" placeholder="룰 개선 제안" />
    <input id="feedbackSuggestPrompt" type="text" placeholder="프롬프트 개선 제안" style="margin-top:4px;" />
    <input id="feedbackSuggestScoring" type="text" placeholder="점수 개선 제안" style="margin-top:4px;" />
    <div style="display:flex;gap:6px;align-items:center;margin-top:6px;">
      <button class="primary" type="button" id="feedbackSaveBtn" style="padding:8px 12px;font-size:13px;">피드백 저장</button>
      <span id="feedbackSaveStatus" class="muted" style="font-size:12px;"></span>
    </div>
    <h5 style="margin:10px 0 4px;">이 Case의 최근 피드백</h5>
    <ul style="font-size:12.5px;">${fbList || "<li class='muted'>아직 피드백 없음</li>"}</ul>
  `;
}

function splitCsv(s) {
  if (!s) return [];
  return String(s).split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
}

async function onFeedbackSave() {
  const d = state.queueDetail;
  if (!d || !d.case) return;
  const caseId = d.case.id;
  const memo = (document.getElementById("feedbackMemo")?.value || "").trim();
  const ruleIds = splitCsv(document.getElementById("feedbackRuleIds")?.value);
  const keywords = splitCsv(document.getElementById("feedbackKeywords")?.value);
  const llmNotes = (document.getElementById("feedbackLlmNotes")?.value || "").trim();
  const scoringNotes = (document.getElementById("feedbackScoringNotes")?.value || "").trim();
  const suggestRule = splitCsv(document.getElementById("feedbackSuggestRule")?.value);
  const suggestPrompt = splitCsv(document.getElementById("feedbackSuggestPrompt")?.value);
  const suggestScoring = splitCsv(document.getElementById("feedbackSuggestScoring")?.value);
  const reviewer = document.getElementById("queueReviewerName")?.value || undefined;

  const reasonCategories = Array.from(state.feedback.selectedReasons);
  const status = document.getElementById("feedbackSaveStatus");

  const payload = {
    decision: state.feedback.selectedDecision || "REJECT",
    reasonCategories,
    reviewerName: reviewer,
    memo: memo || undefined,
    relatedRuleIds: ruleIds,
    relatedKeywords: keywords,
    llmIssueNotes: llmNotes || undefined,
    scoringIssueNotes: scoringNotes || undefined,
    suggestedRuleChanges: suggestRule,
    suggestedPromptChanges: suggestPrompt,
    suggestedScoringChanges: suggestScoring,
    caseStatusAtFeedback: d.case.status
  };

  try {
    if (status) status.textContent = "저장 중...";
    const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    if (status) {
      status.textContent = data.piiMasked
        ? `저장됨. 개인정보 ${Object.values(data.piiHits || {}).reduce((a,b)=>a+b,0)}개 마스킹됨.`
        : "저장됨.";
    }
    // 초기화
    state.feedback.selectedReasons.clear();
    document.getElementById("feedbackMemo").value = "";
    await loadCaseFeedbacks(caseId);
    await loadFeedbackStats();
    renderFeedbackForm();
  } catch (err) {
    if (status) status.textContent = "저장 실패: " + err.message;
  }
}

async function loadCaseFeedbacks(caseId) {
  try {
    const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/feedback`);
    const data = await res.json();
    if (data && data.ok) state.feedback.caseFeedbacks = data.items || [];
  } catch { /* ignore */ }
}

// ---------- Outcome Tracker (체크리스트 30) ----------
function bindOutcome() {
  const saveBtn = document.getElementById("outcomeSaveBtn");
  if (saveBtn) saveBtn.addEventListener("click", saveOutcome);
  const refreshBtn = document.getElementById("outcomeRefreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", loadOutcomeData);
}

async function loadOutcomeMeta() {
  try {
    const res = await fetch("/api/outcomes/meta");
    const data = await res.json();
    if (!data.ok) return;
    state.outcome.meta = data;
    populateOutcomeSelects(data);
  } catch { /* ignore */ }
}

function populateOutcomeSelects(meta) {
  const statusSel = document.getElementById("outcomeStatus");
  const decSel = document.getElementById("outcomeDecision");
  const rewardSel = document.getElementById("outcomeReward");
  if (statusSel) {
    statusSel.innerHTML = (meta.statuses || []).map((s) =>
      `<option value="${escapeAttr(s.code)}" ${s.code === "SUBMITTED_MANUALLY" ? "selected" : ""}>${escapeHtml(s.label)}</option>`
    ).join("");
  }
  if (decSel) {
    decSel.innerHTML = (meta.decisions || []).map((d) =>
      `<option value="${escapeAttr(d.code)}" ${d.code === "PENDING" ? "selected" : ""}>${escapeHtml(d.label)}</option>`
    ).join("");
  }
  if (rewardSel) {
    rewardSel.innerHTML = (meta.rewardOutcomes || []).map((r) =>
      `<option value="${escapeAttr(r.code)}" ${r.code === "UNKNOWN" ? "selected" : ""}>${escapeHtml(r.label)}</option>`
    ).join("");
  }
}

async function loadOutcomeData() {
  try {
    const [listRes, statsRes, followRes] = await Promise.all([
      fetch("/api/outcomes?limit=30").then((r) => r.json()),
      fetch("/api/outcomes/stats").then((r) => r.json()),
      fetch("/api/outcomes/follow-up?graceDays=14").then((r) => r.json())
    ]);
    if (listRes.ok) state.outcome.items = listRes.items || [];
    if (statsRes.ok) state.outcome.stats = statsRes.stats;
    if (followRes.ok) state.outcome.followUp = followRes.items || [];
    renderOutcomeStats();
    renderOutcomeFollowUp();
    renderOutcomeList();
  } catch (err) {
    const root = document.getElementById("outcomeList");
    if (root) root.innerHTML = `<div class="code">로드 실패: ${escapeHtml(err.message)}</div>`;
  }
}

function renderOutcomeStats() {
  const root = document.getElementById("outcomeStats");
  if (!root) return;
  const s = state.outcome.stats;
  if (!s) { root.textContent = "통계 없음"; return; }
  const cards = [
    { label: "총 기록", value: s.total ?? 0, cls: "muted" },
    { label: "제출 기록", value: s.submittedCount ?? 0, cls: "muted" },
    { label: "접수 확인", value: s.receivedCount ?? 0, cls: "ok" },
    { label: "처리 중", value: s.inReviewCount ?? 0, cls: "muted" },
    { label: "보완 요청", value: s.supplementRequestedCount ?? 0, cls: "warn" },
    { label: "수용/인정", value: s.acceptedCount ?? 0, cls: "ok" },
    { label: "반려", value: s.rejectedCount ?? 0, cls: "danger" },
    { label: "포상 검토", value: s.rewardReviewCount ?? 0, cls: "muted" },
    { label: "지급 확인", value: s.rewardPaidCount ?? 0, cls: "ok" },
    { label: "Follow-up", value: s.followUpDueCount ?? 0, cls: (s.followUpDueCount || 0) > 0 ? "warn" : "muted" }
  ];
  const cardsHtml = cards.map((c) => `
    <div class="evi-item ${c.cls === 'ok' ? 'kpi-ok' : c.cls === 'warn' ? 'kpi-warn' : c.cls === 'danger' ? 'kpi-danger' : 'kpi-muted'}" style="text-align:center;padding:8px 10px;">
      <div class="label" style="font-size:11px;">${escapeHtml(c.label)}</div>
      <div class="value" style="font-size:18px;">${escapeHtml(String(c.value))}</div>
    </div>
  `).join("");
  const reward = `<p class="muted" style="font-size:12px;margin-top:6px;">사용자 입력 지급 확인 금액 합계: <code>${(s.rewardPaidAmountTotal || 0).toLocaleString()}</code> (예측 아님, 실제 지급 확인 ${s.rewardPaidEntries || 0}건)</p>`;
  root.innerHTML = `<div class="ops-kpi-grid">${cardsHtml}</div>${reward}`;
}

function renderOutcomeFollowUp() {
  const root = document.getElementById("outcomeFollowUp");
  if (!root) return;
  const items = state.outcome.followUp || [];
  if (items.length === 0) {
    root.innerHTML = '<p class="muted">follow-up 필요 항목 없음.</p>';
    return;
  }
  const rows = items.slice(0, 20).map((f) => {
    const cls = f.daysOverdue > 0 ? "danger" : f.daysOverdue === 0 ? "warn" : "muted";
    return `<li>
      <span class="badge ${cls}">D${f.daysOverdue > 0 ? "+" : ""}${f.daysOverdue}</span>
      caseId <code>${escapeHtml(f.caseId)}</code> · ${escapeHtml(f.agencyName || "(미기록)")} · ${escapeHtml(f.status)} · due ${escapeHtml(f.followUpDueAt)}
    </li>`;
  }).join("");
  root.innerHTML = `<ul style="font-size:12.5px;">${rows}</ul>`;
}

function renderOutcomeList() {
  const root = document.getElementById("outcomeList");
  if (!root) return;
  const items = state.outcome.items || [];
  if (items.length === 0) {
    root.innerHTML = '<p class="muted">아직 기록된 결과가 없습니다. 위에서 Case ID 를 입력하고 결과를 저장해 보세요.</p>';
    return;
  }
  const rows = items.map((o) => {
    const statusCls = (o.status === "REJECTED" || o.status === "REWARD_REJECTED") ? "danger"
      : (o.status === "ACCEPTED" || o.status === "REWARD_PAID") ? "ok"
      : (o.status === "SUPPLEMENT_REQUESTED") ? "warn" : "muted";
    const reward = o.rewardOutcome && o.rewardOutcome !== "UNKNOWN" ? `<span class="badge muted" style="margin-left:4px;">${escapeHtml(o.rewardOutcome)}</span>` : "";
    const masked = o.piiMasked ? '<span class="badge warn" style="margin-left:4px;">PII 마스킹</span>' : "";
    const manual = o.submittedManually ? '<span class="badge muted" style="margin-left:4px;">수동 제출 기록</span>' : "";
    const recorder = o.recorderName ? ` · 기록자 ${escapeHtml(String(o.recorderName))}` : "";
    const ref = o.referenceNumber ? `· 접수 <code>${escapeHtml(String(o.referenceNumber))}</code>` : "";
    return `
      <div class="ops-top-row">
        <div class="ops-top-rank" style="font-size:12px;">${escapeHtml(o.id)}</div>
        <div class="ops-top-main">
          <div class="ops-top-title" style="font-size:13px;">
            case <code>${escapeHtml(o.caseId)}</code> · ${escapeHtml(o.moduleId || "-")} ·
            ${escapeHtml(o.agencyName || "(미기록)")} ${ref}
          </div>
          <div class="muted" style="font-size:12px;">
            <span class="badge ${statusCls}">${escapeHtml(o.status)}</span>
            · 결과 <span class="badge muted">${escapeHtml(o.decision)}</span>
            ${reward} ${masked} ${manual}
            · 제출 ${escapeHtml(o.submittedAt || "-")} · 접수 ${escapeHtml(o.receivedAt || "-")} · 다음 확인 ${escapeHtml(o.followUpDueAt || "-")}${recorder}
          </div>
        </div>
      </div>
    `;
  }).join("");
  root.innerHTML = `<div class="ops-top-list">${rows}</div>`;
}

async function saveOutcome() {
  const status = document.getElementById("outcomeSaveStatus");
  const caseId = (document.getElementById("outcomeCaseId")?.value || "").trim();
  if (!caseId) {
    if (status) status.textContent = "Case ID 를 입력하세요.";
    return;
  }
  const confirmManual = !!document.getElementById("outcomeConfirmManual")?.checked;
  const payload = {
    agencyName: (document.getElementById("outcomeAgencyName")?.value || "").trim() || undefined,
    agencyChannel: (document.getElementById("outcomeAgencyChannel")?.value || "").trim() || undefined,
    recorderName: (document.getElementById("outcomeRecorderName")?.value || "").trim() || undefined,
    confirmManualSubmission: confirmManual || undefined,
    submittedManually: confirmManual || undefined,
    referenceNumber: (document.getElementById("outcomeRefNumber")?.value || "").trim() || undefined,
    submittedAt: document.getElementById("outcomeSubmittedAt")?.value || undefined,
    receivedAt: document.getElementById("outcomeReceivedAt")?.value || undefined,
    followUpDueAt: document.getElementById("outcomeFollowUpDueAt")?.value || undefined,
    status: document.getElementById("outcomeStatus")?.value || undefined,
    decision: document.getElementById("outcomeDecision")?.value || undefined,
    rewardOutcome: document.getElementById("outcomeReward")?.value || undefined,
    rewardAmount: document.getElementById("outcomeRewardAmount")?.value
      ? Number(document.getElementById("outcomeRewardAmount").value)
      : undefined,
    rewardCurrency: (document.getElementById("outcomeRewardCurrency")?.value || "").trim() || undefined,
    resultSummary: (document.getElementById("outcomeResultSummary")?.value || "").trim() || undefined,
    rejectionReason: (document.getElementById("outcomeRejectionReason")?.value || "").trim() || undefined,
    supplementRequest: (document.getElementById("outcomeSupplementRequest")?.value || "").trim() || undefined,
    notes: (document.getElementById("outcomeNotes")?.value || "").trim() || undefined
  };
  try {
    if (status) status.textContent = "저장 중...";
    const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/outcome`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    if (status) {
      const piiNote = data.piiMasked ? " · PII 마스킹 적용됨" : "";
      const fbNote = data.recommendedFeedback ? " · Feedback DB 에 반려 사유를 남기는 것을 권장합니다." : "";
      status.textContent = `저장 완료 (${data.outcome.status})${piiNote}${fbNote}`;
    }
    await loadOutcomeData();
  } catch (err) {
    if (status) status.textContent = "저장 실패: " + err.message;
  }
}

// ---------- 개인정보 보호 / 삭제 (체크리스트 28) ----------
function bindPrivacy() {
  const scanBtn = document.getElementById("privacyScanBtn");
  if (scanBtn) scanBtn.addEventListener("click", runPrivacyScan);
  const policyBtn = document.getElementById("privacyPolicyBtn");
  if (policyBtn) policyBtn.addEventListener("click", loadPrivacyPolicy);
  const retBtn = document.getElementById("privacyRetentionBtn");
  if (retBtn) retBtn.addEventListener("click", runRetentionDryRun);
  const maskBtn = document.getElementById("privacyMaskBtn");
  if (maskBtn) maskBtn.addEventListener("click", runPrivacyMask);
}

async function runPrivacyScan() {
  const sumRoot = document.getElementById("privacySummary");
  const root = document.getElementById("privacyScanResult");
  if (root) root.innerHTML = '<p class="muted">스캔 중... (data/ 하위 텍스트 파일)</p>';
  try {
    const res = await fetch("/api/privacy/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    state.privacy.scan = data.result;
    renderPrivacyScan(root, sumRoot, data.result);
  } catch (err) {
    if (root) root.innerHTML = `<div class="code">스캔 실패: ${escapeHtml(err.message)}</div>`;
  }
}

function renderPrivacyScan(root, sumRoot, r) {
  if (!r) return;
  const cards = [
    { label: "총 파일", value: r.totalFiles ?? 0, cls: "muted" },
    { label: "스캔됨", value: r.scannedFiles ?? 0, cls: "muted" },
    { label: "skip됨", value: r.skippedFiles ?? 0, cls: "muted" },
    { label: "위험 파일", value: r.filesWithFindings ?? 0, cls: (r.filesWithFindings || 0) > 0 ? "warn" : "muted" },
    { label: "총 finding", value: r.totalFindings ?? 0, cls: (r.totalFindings || 0) > 0 ? "warn" : "muted" }
  ];
  const cardsHtml = cards.map((c) =>
    `<div class="evi-item" style="text-align:center;padding:8px 10px;">
      <div class="label" style="font-size:11px;">${escapeHtml(c.label)}</div>
      <div class="value" style="font-size:18px;">${escapeHtml(String(c.value))}</div>
    </div>`
  ).join("");

  const byType = r.byType || {};
  const typePills = Object.entries(byType)
    .filter(([, c]) => Number(c) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([t, c]) => `<span class="badge warn" style="margin-right:6px;">${escapeHtml(t)} ${c}</span>`)
    .join("");

  const riskFiles = (r.riskFiles || []).slice(0, 15);
  const rowsHtml = riskFiles.length
    ? riskFiles.map((f) => {
        const topPills = (f.topFindings || []).slice(0, 5).map((tf) =>
          `<span class="badge ${tf.confidence === 'HIGH' ? 'danger' : tf.confidence === 'MEDIUM' ? 'warn' : 'muted'}" title="${escapeAttr(tf.recommendedAction || '')}">${escapeHtml(tf.type)} (${escapeHtml(tf.confidence)})</span>`
        ).join(" ");
        return `
          <div class="ops-top-row">
            <div class="ops-top-rank" style="font-size:13px;">${f.findingsCount}</div>
            <div class="ops-top-main">
              <div class="ops-top-title" style="font-size:13px;font-family:monospace;">${escapeHtml(f.filePath)}</div>
              <div class="muted" style="font-size:12px;">${escapeHtml(f.fileType)} · ${Math.round((f.byteSize || 0) / 1024)} KB</div>
              <div style="margin-top:4px;">${topPills}</div>
            </div>
          </div>
        `;
      }).join("")
    : '<p class="muted">위험 파일이 발견되지 않았습니다.</p>';

  if (sumRoot) {
    sumRoot.innerHTML = `
      <div class="evidence-grid" style="grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));">${cardsHtml}</div>
      <div style="margin-top:6px;">${typePills || ''}</div>
      <p class="muted" style="font-size:12px;margin-top:6px;">⚠ ${escapeHtml(r.safetyNotice || '')}</p>
    `;
  }
  root.innerHTML = `<h4 class="ops-section-title">위험 파일 (상위 ${riskFiles.length}개)</h4><div class="ops-top-list">${rowsHtml}</div>`;
}

async function loadPrivacyPolicy() {
  const root = document.getElementById("privacyScanResult");
  try {
    const res = await fetch("/api/privacy/policy");
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    state.privacy.policy = data.policy;
    const p = data.policy;
    const rows = (p.retentionPolicies || []).map((r) =>
      `<li><code>${escapeHtml(r.category)}</code> · ${r.days}일 · ${escapeHtml(r.dir)} · ${escapeHtml(r.description)}</li>`
    ).join("");
    if (root) root.innerHTML = `
      <h4 class="ops-section-title">개인정보 정책</h4>
      <p class="muted" style="font-size:12.5px;">
        masking enabled: <code>${p.maskingEnabled}</code> · dryRun 기본값: <code>${p.dryRunDefault}</code> ·
        scan dirs: <code>${(p.scanDirs || []).join(", ")}</code>
      </p>
      <h5 style="margin:8px 0 4px;">보존기간 정책</h5>
      <ul style="font-size:12.5px;">${rows}</ul>
      <p class="muted" style="font-size:12px;">⚠ ${escapeHtml(data.safetyNotice || '')}</p>
    `;
  } catch (err) {
    if (root) root.innerHTML = `<div class="code">정책 로드 실패: ${escapeHtml(err.message)}</div>`;
  }
}

async function runRetentionDryRun() {
  const root = document.getElementById("privacyScanResult");
  if (root) root.innerHTML = '<p class="muted">보존기간 초과 파일 dry-run 중...</p>';
  try {
    const res = await fetch("/api/privacy/retention/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun: true })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    state.privacy.retention = data.report;
    const r = data.report;
    const rows = (r.expired || []).slice(0, 30).map((e) =>
      `<li><code>${escapeHtml(e.category)}</code> · ${e.ageDays}일 경과 · ${Math.round(e.byteSize / 1024)} KB · <code>${escapeHtml(e.filePath)}</code></li>`
    ).join("");
    if (root) root.innerHTML = `
      <h4 class="ops-section-title">보존기간 초과 파일 (dry-run)</h4>
      <p class="muted" style="font-size:12.5px;">dryRun=${r.dryRun} · 총 ${r.expired.length}건 · 삭제: ${r.deleted.length}건</p>
      <ul style="font-size:12px;">${rows || '<li class="muted">초과 파일 없음</li>'}</ul>
      <p class="muted" style="font-size:12px;">⚠ 실제 삭제는 운영자가 명시적으로 수행해야 합니다. 본 UI 는 dry-run 결과만 표시합니다.</p>
    `;
  } catch (err) {
    if (root) root.innerHTML = `<div class="code">retention 실행 실패: ${escapeHtml(err.message)}</div>`;
  }
}

async function runPrivacyMask() {
  const inputEl = document.getElementById("privacyMaskInput");
  const root = document.getElementById("privacyMaskResult");
  const text = inputEl?.value || "";
  if (!text.trim()) {
    if (root) root.innerHTML = '<p class="muted">텍스트를 입력하세요.</p>';
    return;
  }
  try {
    const res = await fetch("/api/privacy/mask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    state.privacy.lastMask = data.result;
    const r = data.result;
    const byType = r.byType || {};
    const pills = Object.entries(byType).map(([t, c]) =>
      `<span class="badge warn" style="margin-right:4px;">${escapeHtml(t)} ${c}</span>`
    ).join("");
    if (root) root.innerHTML = `
      <p class="muted" style="font-size:12px;">변경됨: <code>${r.changed}</code> · finding: ${r.findings.length}개 ${pills}</p>
      <h5 style="margin:6px 0 4px;">마스킹 결과</h5>
      <pre class="code" style="white-space:pre-wrap;font-size:12px;">${escapeHtml(r.masked)}</pre>
      <p class="muted" style="font-size:12px;">⚠ ${escapeHtml(r.safetyNotice || '')}</p>
    `;
  } catch (err) {
    if (root) root.innerHTML = `<div class="code">마스킹 실패: ${escapeHtml(err.message)}</div>`;
  }
}

// ---------- Trace Log (체크리스트 27) ----------
function bindTrace() {
  const refresh = document.getElementById("traceRefreshBtn");
  if (refresh) refresh.addEventListener("click", loadTraceData);
  for (const id of ["traceAgentFilter", "traceSeverityFilter", "traceEventTypeFilter"]) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", loadTraceData);
  }
  const caseInput = document.getElementById("traceCaseIdFilter");
  if (caseInput) {
    caseInput.addEventListener("change", loadTraceData);
    caseInput.addEventListener("keydown", (e) => { if (e.key === "Enter") loadTraceData(); });
  }
}

async function loadTraceData() {
  const root = document.getElementById("traceList");
  const sumRoot = document.getElementById("traceSummary");
  if (!root) return;
  const agent = document.getElementById("traceAgentFilter")?.value || "";
  const severity = document.getElementById("traceSeverityFilter")?.value || "";
  const eventType = document.getElementById("traceEventTypeFilter")?.value || "";
  const caseId = document.getElementById("traceCaseIdFilter")?.value?.trim() || "";
  state.trace.filters = { agentName: agent, severity, eventType, caseId };

  const params = new URLSearchParams({ limit: "50" });
  if (agent) params.set("agentName", agent);
  if (severity) params.set("severity", severity);
  if (eventType) params.set("eventType", eventType);
  if (caseId) params.set("caseId", caseId);

  try {
    const [eventsRes, summaryRes] = await Promise.all([
      fetch(`/api/traces?${params.toString()}`).then((r) => r.json()),
      fetch(`/api/traces/summary`).then((r) => r.json())
    ]);
    if (!eventsRes.ok) throw new Error(eventsRes.message || "trace list failed");
    state.trace.events = eventsRes.events || [];
    state.trace.summary = summaryRes.ok ? summaryRes.summary : null;
    populateTraceAgentFilter();
    renderTraceSummary(sumRoot);
    renderTraceList(root);
  } catch (err) {
    root.innerHTML = `<div class="code">trace 조회 실패: ${escapeHtml(err.message)}</div>`;
  }
}

function populateTraceAgentFilter() {
  const sel = document.getElementById("traceAgentFilter");
  if (!sel) return;
  const current = sel.value;
  const agents = Object.keys(state.trace.summary?.byAgent || {}).sort();
  sel.innerHTML = '<option value="">(전체)</option>' + agents.map((a) =>
    `<option value="${escapeAttr(a)}" ${a === current ? "selected" : ""}>${escapeHtml(a)} (${state.trace.summary.byAgent[a]})</option>`
  ).join("");
}

function renderTraceSummary(root) {
  if (!root) return;
  const s = state.trace.summary;
  if (!s) { root.textContent = ""; return; }
  const sev = s.bySeverity || {};
  const totals = [
    { label: "총 이벤트", value: s.total ?? 0 },
    { label: "info", value: sev.info ?? 0 },
    { label: "warn", value: sev.warn ?? 0, cls: "warn" },
    { label: "error", value: sev.error ?? 0, cls: "danger" },
    { label: "agent", value: Object.keys(s.byAgent || {}).length },
    { label: "module", value: Object.keys(s.byModule || {}).length }
  ];
  const html = totals.map((t) =>
    `<span class="badge ${t.cls || 'muted'}" style="margin-right:6px;">${escapeHtml(t.label)} ${t.value}</span>`
  ).join("");
  root.innerHTML = `${html} <span class="muted" style="font-size:11.5px;margin-left:6px;">⚠ ${escapeHtml(s.safetyNotice || "")}</span>`;
}

function renderTraceList(root) {
  if (!root) return;
  const events = state.trace.events || [];
  if (events.length === 0) {
    root.innerHTML = '<p class="muted">조건에 맞는 trace 이벤트가 없습니다.</p>';
    return;
  }
  const rows = events.map((e) => {
    const sevCls = e.severity === "error" ? "danger" : e.severity === "warn" ? "warn" : "muted";
    const dur = typeof e.durationMs === "number" ? `${e.durationMs}ms` : "—";
    const masked = e.sensitiveMasked ? '<span class="badge warn" style="margin-left:4px;">PII 마스킹</span>' : "";
    return `
      <div class="ops-top-row">
        <div class="ops-top-rank" style="color:#475569;font-size:12px;">${escapeHtml(e.eventType)}</div>
        <div class="ops-top-main">
          <div class="ops-top-title" style="font-size:13px;">
            ${escapeHtml(e.agentName || "(no agent)")} ·
            <span class="badge ${sevCls}">${escapeHtml(e.severity)}</span> · ${dur} ${masked}
          </div>
          <div class="muted ops-top-meta">${escapeHtml(e.message || "")}</div>
          <div class="muted" style="font-size:11.5px;">
            ${escapeHtml(e.ts)} · traceId <code>${escapeHtml(e.traceId)}</code>
            ${e.caseId ? ` · caseId <code>${escapeHtml(e.caseId)}</code>` : ""}
            ${e.moduleId ? ` · ${escapeHtml(e.moduleId)}` : ""}
            ${e.actor ? ` · actor ${escapeHtml(e.actor)}` : ""}
          </div>
        </div>
      </div>
    `;
  }).join("");
  root.innerHTML = `<div class="ops-top-list">${rows}</div>`;
}

// ---------- 입찰담합 의심 패턴 프로토타입 (체크리스트 26) ----------
function bindBids() {
  const aBtn = document.getElementById("bidAnalyzeBtn");
  if (aBtn) aBtn.addEventListener("click", runBidAnalyze);
  const rBtn = document.getElementById("bidRefreshBtn");
  if (rBtn) rBtn.addEventListener("click", runBidAnalyze);
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.matches("[data-bid-report]")) {
      e.preventDefault();
      const id = t.getAttribute("data-bid-report");
      if (id) loadBidReport(id);
    }
    if (t.id === "bidReportCloseBtn") {
      e.preventDefault();
      state.bids.report = null;
      renderBidDashboard(document.getElementById("bidDashboard"), state.bids.result);
    }
  });
}

async function runBidAnalyze() {
  const root = document.getElementById("bidDashboard");
  if (!root) return;
  const sel = document.getElementById("bidCategorySelect");
  const category = sel ? sel.value : "";
  state.bids.category = category;
  root.innerHTML = '<p class="muted">sample 입찰 데이터 패턴 분석 중...</p>';
  try {
    const body = { useSampleData: true };
    if (category) body.category = category;
    const res = await fetch("/api/bids/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    state.bids.result = data;
    state.bids.report = null;
    renderBidDashboard(root, data);
  } catch (err) {
    root.innerHTML = `<div class="code">분석 실패: ${escapeHtml(err.message)}</div>`;
  }
}

function renderBidDashboard(root, data) {
  if (!root || !data) return;
  const groups = data.riskGroups || [];
  const cards = [
    { label: "총 입찰", value: data.totalBids ?? 0, cls: "muted" },
    { label: "참여 업체", value: data.uniqueBidders ?? 0, cls: "muted" },
    { label: "발주기관", value: data.uniqueIssuers ?? 0, cls: "muted" },
    { label: "위험 업체군", value: data.riskGroupCount ?? 0, cls: (data.riskGroupCount || 0) > 0 ? "warn" : "muted" },
    { label: "의심 입찰", value: data.suspiciousBidCount ?? 0, cls: (data.suspiciousBidCount || 0) > 0 ? "warn" : "muted" }
  ];
  const cardsHtml = cards.map((c) => `
    <div class="evi-item" style="text-align:center;padding:8px 10px;">
      <div class="label" style="font-size:11px;">${escapeHtml(c.label)}</div>
      <div class="value" style="font-size:18px;">${escapeHtml(String(c.value))}</div>
    </div>
  `).join("");

  const rows = groups.map((g) => {
    const lvlCls = g.priorityLevel === "VERY_HIGH_PRIORITY" ? "danger" :
                   g.priorityLevel === "HIGH_PRIORITY" ? "warn" :
                   g.priorityLevel === "REVIEW_NEEDED" ? "muted" : "muted";
    const sigPills = (g.signals || []).slice(0, 8).map((s) =>
      `<span class="badge ${s.weight >= 20 ? 'danger' : (s.weight >= 15 ? 'warn' : 'muted')}" title="${escapeAttr(s.description)}">${escapeHtml(s.label)} (+${s.weight})</span>`
    ).join(" ");
    const winners = Object.entries(g.winners || {}).map(([w, c]) => `${escapeHtml(w)}=${c}`).join(", ");
    return `
      <div class="ops-top-row">
        <div class="ops-top-rank">${g.priorityScore}</div>
        <div class="ops-top-main">
          <div class="ops-top-title">${escapeHtml(g.companies.join(" + "))}</div>
          <div class="muted ops-top-meta">
            ${g.bidCount}회 동반 참여 · 평균 낙찰률 ${g.avgAwardRate}% · 평균 spread ${g.avgBidSpread}%p ·
            <span class="badge ${lvlCls}">${escapeHtml(g.priorityLabel)}</span>
          </div>
          <div class="muted" style="font-size:12px;margin-top:2px;">낙찰자: ${winners || "(미기록)"}</div>
          <div style="margin-top:4px;">${sigPills || '<span class="muted" style="font-size:12px;">탐지된 신호 없음</span>'}</div>
        </div>
        <div class="ops-top-action">
          <button class="ghost" type="button" data-bid-report="${escapeAttr(g.groupId)}">리포트 초안</button>
        </div>
      </div>
    `;
  }).join("");

  const reportHtml = state.bids.report
    ? `
      <h4 class="ops-section-title">리포트 초안 미리보기 — ${escapeHtml(state.bids.report.group?.groupId || "")}</h4>
      <pre class="code" style="max-height:320px;overflow:auto;white-space:pre-wrap;font-size:12px;">${escapeHtml(state.bids.report.markdown || "")}</pre>
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button class="ghost" type="button" id="bidReportCloseBtn">초안 닫기</button>
      </div>
    `
    : "";

  root.innerHTML = `
    <p class="muted ops-safety">⚠ ${escapeHtml(data.safetyNotice || "입찰담합 모듈은 공개자료 기반 패턴 분석 프로토타입입니다.")}</p>
    <p class="muted">데이터: ${data.syntheticOnly ? "synthetic" : "(unknown)"} · analyzedAt ${escapeHtml(data.analyzedAt || "")} · 카테고리 필터: ${escapeHtml(data.categoryFilter || "(전체)")}</p>
    <div class="evidence-grid" style="grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));">${cardsHtml}</div>
    <h4 class="ops-section-title">위험 업체군 (점수 내림차순)</h4>
    <div class="ops-top-list">${rows || '<p class="muted">탐지된 위험 업체군이 없습니다.</p>'}</div>
    ${reportHtml}
  `;
}

async function loadBidReport(groupId) {
  try {
    const res = await fetch(`/api/bids/groups/${encodeURIComponent(groupId)}/report`);
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    state.bids.report = { group: data.group, markdown: data.report?.markdown || "" };
    renderBidDashboard(document.getElementById("bidDashboard"), state.bids.result);
  } catch (err) {
    alert("리포트 초안 로드 실패: " + err.message);
  }
}

// ---------- 보조금 의심 후보 프로토타입 (체크리스트 25) ----------
function bindSubsidy() {
  const aBtn = document.getElementById("subsidyAnalyzeBtn");
  if (aBtn) aBtn.addEventListener("click", runSubsidyAnalyze);
  const rBtn = document.getElementById("subsidyRefreshBtn");
  if (rBtn) rBtn.addEventListener("click", runSubsidyAnalyze);
  const demoBtn = document.getElementById("subsidyEngineDemoBtn");
  if (demoBtn) demoBtn.addEventListener("click", runSubsidyEngineDemo);
  const statusBtn = document.getElementById("subsidyEngineStatusBtn");
  if (statusBtn) statusBtn.addEventListener("click", runSubsidyEngineStatus);
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.matches("[data-subsidy-report]")) {
      e.preventDefault();
      const id = t.getAttribute("data-subsidy-report");
      if (id) loadSubsidyReport(id);
    }
    if (t.id === "subsidyReportCloseBtn") {
      e.preventDefault();
      state.subsidy.report = null;
      renderSubsidyDashboard(document.getElementById("subsidyDashboard"), state.subsidy.result);
    }
  });
}

async function runSubsidyAnalyze() {
  const root = document.getElementById("subsidyDashboard");
  if (!root) return;
  root.innerHTML = '<p class="muted">sample 기반 분석 중...</p>';
  try {
    const res = await fetch("/api/subsidy/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ regionId: "dangjin", useSampleData: true })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    state.subsidy.result = data;
    state.subsidy.report = null;
    renderSubsidyDashboard(root, data);
  } catch (err) {
    root.innerHTML = `<div class="code">분석 실패: ${escapeHtml(err.message)}</div>`;
  }
}

function renderSubsidyDashboard(root, data) {
  if (!root || !data) return;
  const candidates = data.candidates || [];
  const total = data.recordCount ?? candidates.length;
  const veryHigh = candidates.filter((c) => c.priorityLevel === "VERY_HIGH_PRIORITY").length;
  const high = candidates.filter((c) => c.priorityLevel === "HIGH_PRIORITY").length;
  const review = candidates.filter((c) => c.priorityLevel === "REVIEW_NEEDED").length;
  const low = candidates.filter((c) => c.priorityLevel === "LOW").length;

  const cards = [
    { label: "분석 레코드", value: total, cls: "muted" },
    { label: "최우선 검토", value: veryHigh, cls: veryHigh > 0 ? "danger" : "muted" },
    { label: "우선 검토", value: high, cls: high > 0 ? "warn" : "muted" },
    { label: "검토 필요", value: review, cls: "muted" },
    { label: "낮음", value: low, cls: "muted" }
  ];
  const cardsHtml = cards.map((c) => `
    <div class="evi-item" style="text-align:center;padding:8px 10px;">
      <div class="label" style="font-size:11px;">${escapeHtml(c.label)}</div>
      <div class="value" style="font-size:18px;">${escapeHtml(String(c.value))}</div>
    </div>
  `).join("");

  const rows = candidates.map((c) => {
    const lvlCls = c.priorityLevel === "VERY_HIGH_PRIORITY" ? "danger" :
                   c.priorityLevel === "HIGH_PRIORITY" ? "warn" :
                   c.priorityLevel === "REVIEW_NEEDED" ? "muted" : "muted";
    const sigPills = (c.signals || []).slice(0, 6).map((s) =>
      `<span class="badge ${s.weight >= 20 ? 'danger' : (s.weight >= 15 ? 'warn' : 'muted')}" title="${escapeAttr(s.description)}">${escapeHtml(s.label)} (+${s.weight})</span>`
    ).join(" ");
    return `
      <div class="ops-top-row">
        <div class="ops-top-rank">${c.priorityScore}</div>
        <div class="ops-top-main">
          <div class="ops-top-title">${escapeHtml(c.projectTitle)}</div>
          <div class="muted ops-top-meta">
            ${escapeHtml(c.recipientName)} · ${c.fiscalYear}년 · ${(c.grantAmount || 0).toLocaleString()}원 ·
            <span class="badge ${lvlCls}">${escapeHtml(c.priorityLabel)}</span>
          </div>
          <div style="margin-top:4px;">${sigPills || '<span class="muted" style="font-size:12px;">탐지된 신호 없음</span>'}</div>
          <div class="muted ops-top-url" style="font-size:11.5px;">${escapeHtml(c.publicListingUrl || "")}</div>
        </div>
        <div class="ops-top-action">
          <button class="ghost" type="button" data-subsidy-report="${escapeAttr(c.recordId)}">리포트 초안</button>
        </div>
      </div>
    `;
  }).join("");

  const reportHtml = state.subsidy.report
    ? `
      <h4 class="ops-section-title">리포트 초안 미리보기 — ${escapeHtml(state.subsidy.report.candidate?.recordId || "")}</h4>
      <pre class="code" style="max-height:320px;overflow:auto;white-space:pre-wrap;font-size:12px;">${escapeHtml(state.subsidy.report.markdown || "")}</pre>
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button class="ghost" type="button" id="subsidyReportCloseBtn">초안 닫기</button>
      </div>
    `
    : "";

  root.innerHTML = `
    <p class="muted ops-safety">⚠ ${escapeHtml(data.safetyNotice || "보조금 모듈은 공개자료 기반 검토 후보를 만드는 프로토타입입니다.")}</p>
    <p class="muted">시범 지자체: <strong>${escapeHtml(data.pilotRegion || "(미지정)")}</strong> · synthetic=${data.syntheticOnly ? "true" : "false"} · analyzedAt ${escapeHtml(data.analyzedAt || "")}</p>
    <div class="evidence-grid" style="grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));">${cardsHtml}</div>
    <h4 class="ops-section-title">후보 목록 (점수 내림차순)</h4>
    <div class="ops-top-list">${rows || '<p class="muted">후보가 없습니다.</p>'}</div>
    ${reportHtml}
  `;
}

async function loadSubsidyReport(recordId) {
  try {
    const res = await fetch(`/api/subsidy/candidates/${encodeURIComponent(recordId)}/report`);
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    state.subsidy.report = { candidate: data.candidate, markdown: data.report?.markdown || "" };
    renderSubsidyDashboard(document.getElementById("subsidyDashboard"), state.subsidy.result);
  } catch (err) {
    alert("리포트 초안 로드 실패: " + err.message);
  }
}

// ---------- 보조금 탐지 엔진 fixture 데모 (체크리스트 11~25 UI 연결) ----------
function renderEngineStatusPanel(s) {
  if (!s) return "";
  const group = (title, items) => `
    <div class="evi-item" style="padding:8px 10px;">
      <div class="label" style="font-size:12px;font-weight:600;margin-bottom:4px;">${escapeHtml(title)}</div>
      ${items.map((it) => `<div class="muted" style="font-size:11.5px;">• ${escapeHtml(it.name)} — ${escapeHtml(it.status)}</div>`).join("")}
    </div>`;
  return `
    <div class="evidence-grid" style="grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));">
      ${group("수집/전처리", s.collectors)}
      ${group("룰 탐지", s.rules)}
      ${group("스코어링", s.scoring)}
      ${group("AI 분석", s.aiAnalysis)}
    </div>`;
}

async function runSubsidyEngineStatus() {
  const root = document.getElementById("subsidyEngineDemo");
  if (!root) return;
  root.innerHTML = '<p class="muted">엔진 현황 불러오는 중...</p>';
  try {
    const res = await fetch("/api/subsidy/demo-status");
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    root.innerHTML = `
      <p class="muted ops-safety">⚠ ${escapeHtml(data.engineStatus.fixtureNotice || "")}</p>
      ${renderEngineStatusPanel(data.engineStatus)}
      <p class="muted" style="font-size:11.5px;margin-top:8px;">${escapeHtml(data.safetyNotice || "")}</p>`;
  } catch (err) {
    root.innerHTML = `<div class="code">엔진 현황 로드 실패: ${escapeHtml(err.message)}</div>`;
  }
}

async function runSubsidyEngineDemo() {
  const root = document.getElementById("subsidyEngineDemo");
  if (!root) return;
  root.innerHTML = '<p class="muted">fixture 기반 엔진 통합 실행 중... (룰 탐지 · 위험점수 · 보상가능성 · LLM 설명형 분석 · 근거 검증)</p>';
  try {
    const res = await fetch("/api/subsidy/run-demo");
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    renderSubsidyEngineDemo(root, data);
  } catch (err) {
    root.innerHTML = `<div class="code">엔진 데모 실패: ${escapeHtml(err.message)}</div>`;
  }
}

function renderSubsidyEngineDemo(root, d) {
  if (!root || !d) return;
  const pct = (v) => `${Math.round((Number(v) || 0) * 1000) / 10}%`;

  // 섹션 1: 데이터 기준선
  const b = d.baseline || {};
  const baselineHtml = `
    <h4 class="ops-section-title">1. 데이터 기준선</h4>
    <div class="evidence-grid" style="grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));">
      <div class="evi-item" style="text-align:center;"><div class="label" style="font-size:11px;">기준선 종류</div><div class="value" style="font-size:15px;">${escapeHtml(b.kind || "fixture")}</div></div>
      <div class="evi-item" style="text-align:center;"><div class="label" style="font-size:11px;">총 레코드</div><div class="value" style="font-size:15px;">${escapeHtml(String(b.totalRecords ?? 0))}건</div></div>
      <div class="evi-item" style="text-align:center;"><div class="label" style="font-size:11px;">중복률</div><div class="value" style="font-size:15px;">${pct(b.duplicateRate)}</div></div>
      <div class="evi-item" style="text-align:center;"><div class="label" style="font-size:11px;">결측률</div><div class="value" style="font-size:15px;">${pct(b.missingRate)}</div></div>
    </div>
    <p class="muted" style="font-size:11.5px;">상태: ${escapeHtml(b.status || "")}</p>`;

  // 섹션 2: 룰 탐지 결과
  const ruleCards = (d.rules || []).map((r) => {
    const ex = (r.examples || []).map((e) => `
      <div class="ops-top-row" style="align-items:flex-start;">
        <div class="ops-top-rank">${escapeHtml(String(e.riskScore))}</div>
        <div class="ops-top-main">
          <div class="ops-top-title" style="font-size:12.5px;">${escapeHtml(e.title)}</div>
          <div class="muted ops-top-meta" style="font-size:11px;">
            <span class="badge ${e.riskLevel === "high" ? "danger" : e.riskLevel === "medium" ? "warn" : "muted"}">${escapeHtml(e.riskLevel || "-")}</span>
            · reviewRequired=${e.reviewRequired ? "true" : "false"} · ${e.isFixtureBased ? "fixture 기반" : "실데이터"}
          </div>
          <div class="muted" style="font-size:11px;margin-top:3px;">${escapeHtml(e.reason || "")}</div>
        </div>
      </div>`).join("");
    return `
      <div class="evi-item" style="padding:10px;">
        <div class="label" style="font-size:12.5px;font-weight:600;">${escapeHtml(r.label)}</div>
        <div class="muted" style="font-size:11.5px;margin-bottom:4px;">후보 수: <strong>${escapeHtml(String(r.totalCandidates ?? 0))}</strong> · TOP ${escapeHtml(String(r.topCount ?? 0))}</div>
        ${ex || '<div class="muted" style="font-size:11px;">예시 후보 없음</div>'}
      </div>`;
  }).join("");
  const rulesHtml = `
    <h4 class="ops-section-title">2. 룰 탐지 결과 (fixture)</h4>
    <div class="evidence-grid" style="grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));">${ruleCards}</div>`;

  // 섹션 3: 100점 위험점수
  const rs = d.riskScore;
  const riskHtml = rs ? `
    <h4 class="ops-section-title">3. 100점 위험점수</h4>
    <div class="evidence-grid" style="grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));">
      <div class="evi-item" style="text-align:center;"><div class="label" style="font-size:11px;">finalRiskScore</div><div class="value" style="font-size:20px;">${escapeHtml(String(rs.finalRiskScore))}</div></div>
      <div class="evi-item" style="text-align:center;"><div class="label" style="font-size:11px;">riskGrade</div><div class="value" style="font-size:20px;">${escapeHtml(rs.riskGrade)}</div></div>
      <div class="evi-item" style="text-align:center;"><div class="label" style="font-size:11px;">등급 분포 A/B/C</div><div class="value" style="font-size:15px;">${escapeHtml([rs.gradeSummary?.A ?? 0, rs.gradeSummary?.B ?? 0, rs.gradeSummary?.C ?? 0].join(" / "))}</div></div>
    </div>
    <p class="muted" style="font-size:11.5px;">${escapeHtml(rs.reason || "")}</p>
    <pre class="code" style="font-size:11px;max-height:130px;overflow:auto;white-space:pre-wrap;">${escapeHtml(JSON.stringify(rs.scoreBreakdown, null, 2))}</pre>` : "";

  // 섹션 4: 보상가능성 점수
  const rw = d.rewardScore;
  const rewardHtml = rw ? `
    <h4 class="ops-section-title">4. 보상가능성 점수 (보상/포상 가능성 검토 우선순위)</h4>
    <div class="evidence-grid" style="grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));">
      <div class="evi-item" style="text-align:center;"><div class="label" style="font-size:11px;">rewardPossibilityScore</div><div class="value" style="font-size:20px;">${escapeHtml(String(rw.rewardPossibilityScore))}</div></div>
      <div class="evi-item" style="text-align:center;"><div class="label" style="font-size:11px;">우선순위</div><div class="value" style="font-size:20px;">${escapeHtml(rw.rewardPossibilityLevel)}</div></div>
    </div>
    <p class="muted" style="font-size:11.5px;">${escapeHtml(rw.reason || "")}</p>
    <p class="muted" style="font-size:11px;">${escapeHtml((rw.disclaimers || []).join(" / "))}</p>` : "";

  // 섹션 5: LLM 설명형 분석
  const llm = d.llmExplanation;
  const llmHtml = llm ? `
    <h4 class="ops-section-title">5. LLM 설명형 분석 (deterministic fallback · 실제 LLM API 미호출)</h4>
    <div class="evi-item" style="padding:10px;">
      <div class="muted" style="font-size:12px;"><strong>summary:</strong> ${escapeHtml(llm.summary || "")}</div>
      <div class="muted" style="font-size:11.5px;margin-top:5px;"><strong>왜 검토 후보인지:</strong><ul style="margin:3px 0 0;padding-left:16px;">${(llm.whyFlagged || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>
      <div class="muted" style="font-size:11.5px;margin-top:5px;"><strong>어떤 근거:</strong><ul style="margin:3px 0 0;padding-left:16px;">${(llm.keyEvidence || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>
      <div class="muted" style="font-size:11.5px;margin-top:5px;"><strong>추가 확인사항:</strong><ul style="margin:3px 0 0;padding-left:16px;">${(llm.additionalChecks || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>
      ${llm.rewardPossibilityNote ? `<div class="muted" style="font-size:11.5px;margin-top:5px;"><strong>보상/포상 가능성 검토:</strong> ${escapeHtml(llm.rewardPossibilityNote)}</div>` : ""}
      <div class="muted" style="font-size:11px;margin-top:5px;">reviewRequired=${llm.reviewRequired ? "true" : "false"}</div>
    </div>` : "";

  // 섹션 6: 근거 검증 (citation validation)
  const cv = d.citationValidation;
  const cvStatusCls = cv ? (cv.status === "pass" ? "muted" : cv.status === "warning" ? "warn" : "danger") : "muted";
  const citationHtml = cv ? `
    <h4 class="ops-section-title">6. 근거 검증 (citation validation)</h4>
    <p class="muted" style="font-size:12px;">상태: <span class="badge ${cvStatusCls}">${escapeHtml(cv.status)}</span> (mode=${escapeHtml(cv.mode)})</p>
    <div class="evidence-grid" style="grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));">
      <div class="evi-item" style="text-align:center;"><div class="label" style="font-size:11px;">전체 주장</div><div class="value" style="font-size:16px;">${escapeHtml(String(cv.totalClaims))}</div></div>
      <div class="evi-item" style="text-align:center;"><div class="label" style="font-size:11px;">핵심 주장</div><div class="value" style="font-size:16px;">${escapeHtml(String(cv.coreClaims))}</div></div>
      <div class="evi-item" style="text-align:center;"><div class="label" style="font-size:11px;">근거 보유</div><div class="value" style="font-size:16px;">${escapeHtml(String(cv.citedClaims))}</div></div>
      <div class="evi-item" style="text-align:center;"><div class="label" style="font-size:11px;">근거 누락</div><div class="value" style="font-size:16px;">${escapeHtml(String(cv.missingClaims))}</div></div>
      <div class="evi-item" style="text-align:center;"><div class="label" style="font-size:11px;">개인정보 차단</div><div class="value" style="font-size:16px;">${escapeHtml(String(cv.blockedPersonalInfoCount))}</div></div>
      <div class="evi-item" style="text-align:center;"><div class="label" style="font-size:11px;">비공개URL 차단</div><div class="value" style="font-size:16px;">${escapeHtml(String(cv.blockedPrivateUrlCount))}</div></div>
    </div>
    <p class="muted" style="font-size:11.5px;">인정된 근거 유형(sourceUrl/evidenceUrl/recordId/evidenceId/computed_model 등): ${escapeHtml((cv.acceptedCitationTypes || []).join(", ") || "없음")}</p>
    <p class="muted" style="font-size:11px;">로그인 필요·비공개·내부자료 URL과 개인정보 원문이 포함된 근거는 차단됩니다.</p>` : "";

  // 리포트 경로 힌트
  const hints = (d.reportHints || []).map((h) => `<li><code>${escapeHtml(h.command)}</code> → <span class="muted">${escapeHtml(h.outputDir)}</span></li>`).join("");
  const hintsHtml = `
    <h4 class="ops-section-title">7. JSON/Markdown 리포트 생성 경로 (CLI)</h4>
    <ul style="font-size:11px;margin:4px 0;padding-left:16px;">${hints}</ul>`;

  root.innerHTML = `
    <p class="muted ops-safety">⚠ ${escapeHtml(d.fixtureNotice || "")}</p>
    ${renderEngineStatusPanel(d.engineStatus)}
    ${baselineHtml}
    ${rulesHtml}
    ${riskHtml}
    ${rewardHtml}
    ${llmHtml}
    ${citationHtml}
    ${hintsHtml}
    <p class="muted ops-safety" style="margin-top:10px;border-top:1px solid var(--border,#ccc);padding-top:8px;">${escapeHtml(d.safetyNotice || "")}</p>`;
}

// ---------- 첫 화면 고정 보조금 엔진 데모 패널 (subsidyEngineDemoPanel) ----------
async function loadSubsidyEngineStatusInto(root) {
  if (!root) return;
  root.innerHTML = '<p class="muted">엔진 현황 불러오는 중...</p>';
  try {
    const res = await fetch("/api/subsidy/demo-status");
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    root.innerHTML = `
      <p class="muted ops-safety">⚠ ${escapeHtml((data.engineStatus && data.engineStatus.fixtureNotice) || "")}</p>
      ${renderEngineStatusPanel(data.engineStatus)}
      <p class="muted" style="font-size:11.5px;margin-top:8px;">${escapeHtml(data.safetyNotice || "")}</p>`;
  } catch (err) {
    root.innerHTML = `<div class="code">엔진 현황 로드 실패: ${escapeHtml(err.message)} — 잠시 후 다시 시도하거나 Ctrl+F5로 새로고침하세요.</div>`;
  }
}

async function runSubsidyEngineDemoInto(root) {
  if (!root) return;
  root.innerHTML = '<p class="muted">fixture 기반 엔진 통합 실행 중... (룰 탐지 · 위험점수 · 보상가능성 · LLM 설명형 분석 · 근거 검증)</p>';
  try {
    const res = await fetch("/api/subsidy/run-demo");
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    renderSubsidyEngineDemo(root, data);
  } catch (err) {
    root.innerHTML = `<div class="code">엔진 데모 실패: ${escapeHtml(err.message)} — 잠시 후 다시 시도하거나 Ctrl+F5로 새로고침하세요.</div>`;
  }
}

function mountSubsidyEngineDemo() {
  const panel = document.getElementById("subsidyEngineDemoPanel");
  if (!panel) {
    console.warn("[subsidy-ui-demo] subsidyEngineDemoPanel 요소를 찾지 못했습니다.");
    return;
  }
  const result = document.getElementById("subsidyEngineDemoResult");
  const runBtn = document.getElementById("runSubsidyEngineDemoButton");
  const statusBtn = document.getElementById("loadSubsidyEngineStatusButton");
  if (runBtn) runBtn.addEventListener("click", () => runSubsidyEngineDemoInto(result));
  if (statusBtn) statusBtn.addEventListener("click", () => loadSubsidyEngineStatusInto(result));
  // 페이지 로드 시 엔진 현황을 자동으로 표시한다 (사용자가 숨은 조건을 몰라도 보이게).
  loadSubsidyEngineStatusInto(result);
  console.log("[subsidy-ui-demo] mounted");
}

// ---------- Home / Notice (체크리스트 01) ----------
function bindHomeNotice() {
  const btn = document.getElementById("homeNoticeRefreshBtn");
  if (btn) btn.addEventListener("click", loadDashboardSummary);
}

function renderHomeNotice(data) {
  const root = document.getElementById("homeNoticePanel");
  if (!root) return;
  const app = data.app || { name: "공익레이더", version: "?", environment: "?" };
  const mode = data.mode || {};
  const api = data.apiConnections || { openai: {}, naver: {} };
  const readiness = data.readiness || {};
  const guideLinks = Array.isArray(data.guideLinks) ? data.guideLinks : [];
  const homeNotices = Array.isArray(data.homeNotices) ? data.homeNotices : [];
  const todayDate = data.todayDate || data.today?.date || "";

  const modeBadgeCls =
    mode.runtimeMode === "REAL_READY" ? "warn" :
    mode.runtimeMode === "MIXED" ? "warn" : "muted";
  const modeBadge = `<span class="badge ${modeBadgeCls}">모드: ${escapeHtml(mode.runtimeMode || "?")}</span>`;

  const openaiBadge = `<span class="badge ${api.openai?.configured ? "ok" : "muted"}">OpenAI: ${api.openai?.configured ? "연결됨" : "미연결"}</span>`;
  const naverBadge = `<span class="badge ${api.naver?.configured ? "ok" : "muted"}">Naver: ${api.naver?.configured ? "연결됨" : "미연결"}</span>`;
  const schedulerBadge = `<span class="badge ${mode.schedulerEnabled ? "ok" : "muted"}">Scheduler: ${mode.schedulerEnabled ? "활성" : "비활성"}</span>`;
  const scoutBadge = `<span class="badge ${mode.scoutMode === "real" ? "warn" : "muted"}">Scout: ${escapeHtml(mode.scoutMode || "mock")}</span>`;
  const dbBadge = `<span class="badge ${mode.useDb ? "ok" : "muted"}">DB: ${mode.useDb ? "ON" : "OFF"}</span>`;

  const guideHtml = guideLinks.length
    ? `<ul class="home-guide-links">${guideLinks.map((g) => `<li><a href="${escapeAttr(g.href)}">${escapeHtml(g.label)}</a></li>`).join("")}</ul>`
    : '<p class="muted">빠른 가이드가 비어 있습니다.</p>';

  const noticesHtml = homeNotices.length
    ? `<ul class="home-notice-list">${homeNotices.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`
    : "";

  root.innerHTML = `
    <div class="home-notice-grid">
      <div class="home-notice-cell">
        <div class="label">오늘 날짜 (UTC)</div>
        <div class="value">${escapeHtml(todayDate || "—")}</div>
      </div>
      <div class="home-notice-cell">
        <div class="label">앱 / 버전</div>
        <div class="value">${escapeHtml(app.name)} v${escapeHtml(app.version)}</div>
        <div class="muted home-notice-sub">환경: ${escapeHtml(app.environment || "?")}</div>
      </div>
      <div class="home-notice-cell">
        <div class="label">현재 모드</div>
        <div class="value">${modeBadge}</div>
        <div class="muted home-notice-sub">${escapeHtml(mode.label || "Mock 검증 단계")}</div>
      </div>
      <div class="home-notice-cell">
        <div class="label">API 연결 상태</div>
        <div class="value home-notice-badges">${openaiBadge} ${naverBadge}</div>
        <div class="muted home-notice-sub">API 키 값은 표시하지 않습니다.</div>
      </div>
      <div class="home-notice-cell">
        <div class="label">Scheduler / Scout / DB</div>
        <div class="value home-notice-badges">${schedulerBadge} ${scoutBadge} ${dbBadge}</div>
      </div>
      <div class="home-notice-cell home-notice-readiness">
        <div class="label">실전 가능 단계</div>
        <div class="value">${escapeHtml(readiness.stage || "MOCK_VALIDATION")}</div>
        <div class="muted home-notice-sub">${escapeHtml(readiness.label || "Mock 검증 단계 — 실제 신고 전 검증 필요")}</div>
        <div class="muted home-notice-sub">사람 검토 필요: ${readiness.humanReviewRequired ? "예" : "아니오"} · 자동 제출: ${readiness.canAutoSubmit ? "예" : "아니오 (불가)"}</div>
      </div>
    </div>
    <div class="home-notice-safety">
      ⚠ ${escapeHtml(data.safetyNotice || "이 시스템은 자동 신고를 수행하지 않으며, 모든 제출은 사람이 공식 창구에서 직접 진행해야 합니다.")}
    </div>
    ${noticesHtml}
    <h4 class="ops-section-title">빠른 가이드</h4>
    ${guideHtml}
  `;
}

// ---------- Notice / 공지사항 (체크리스트 02) ----------
const NOTICE_FALLBACK_HTML = `
  <div class="notice-grid">
    <div class="notice-card notice-level-warning">
      <div class="notice-head">
        <span class="notice-level notice-level-warning">WARNING</span>
        <span class="notice-title">공지사항을 불러오지 못했습니다</span>
      </div>
      <p class="notice-message">실전 신고 전 공식 기준과 API 연결 상태를 반드시 확인하세요. 자동 신고는 수행되지 않으며, 모든 제출은 사람이 공식 창구에서 직접 진행해야 합니다.</p>
    </div>
  </div>
`;

function renderNotices(data) {
  const root = document.getElementById("noticePanel");
  if (!root) return;
  const notices = Array.isArray(data && data.notices) ? data.notices : [];
  if (notices.length === 0) {
    root.innerHTML = NOTICE_FALLBACK_HTML;
    return;
  }
  const html = notices.map((n) => {
    const level = (n.level || "info").toLowerCase();
    const cls = ["info", "warning", "danger", "success"].includes(level) ? level : "info";
    const action = n.actionLabel && n.actionTarget
      ? `<a class="notice-action" href="${escapeAttr(n.actionTarget)}">${escapeHtml(n.actionLabel)} →</a>`
      : "";
    const reviewedAt = n.lastReviewedAt
      ? `<span class="notice-meta">최근 점검: ${escapeHtml(n.lastReviewedAt)}</span>`
      : "";
    return `
      <div class="notice-card notice-level-${cls}" data-notice-id="${escapeAttr(n.id || "")}">
        <div class="notice-head">
          <span class="notice-level notice-level-${cls}">${escapeHtml(cls.toUpperCase())}</span>
          <span class="notice-title">${escapeHtml(n.title || "")}</span>
        </div>
        <p class="notice-message">${escapeHtml(n.message || "")}</p>
        <div class="notice-foot">
          ${reviewedAt}
          ${action}
        </div>
      </div>
    `;
  }).join("");
  root.innerHTML = `<div class="notice-grid">${html}</div>`;
}

// ---------- Guide / Q&A (실전 재점검 03) ----------
const GUIDE_FALLBACK_HTML = `
  <div class="guide-card guide-fallback">
    <p class="muted">가이드를 불러오지 못했습니다. 실전 신고 전 공식 기준과 공지사항을 확인하세요. 공익레이더는 자동 신고를 수행하지 않으며, 포상금 수령을 보장하지 않습니다.</p>
  </div>
`;

function bindGuideQa() {
  const btn = document.getElementById("guideQaRefreshBtn");
  if (btn) btn.addEventListener("click", loadGuideQa);
  // FAQ 아코디언 토글
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const q = t.closest && t.closest("[data-faq-toggle]");
    if (!q) return;
    e.preventDefault();
    const item = q.closest(".faq-item");
    if (item) item.classList.toggle("open");
  });
}

async function loadGuideQa() {
  const root = document.getElementById("guideQaPanel");
  if (!root) return;
  try {
    const res = await fetch("/api/guide/qa");
    const data = await res.json();
    if (!data.ok || !data.guide) throw new Error(data.message || "guide failed");
    renderGuideQa(data.guide);
  } catch (err) {
    root.innerHTML = GUIDE_FALLBACK_HTML + `<p class="muted" style="margin-top:8px;font-size:12px;">[debug] ${escapeHtml(err.message)}</p>`;
  }
}

function renderFirstRunSteps(steps) {
  const items = (steps || []).map((s) => `
    <li class="guide-step">
      <div class="guide-step-num">${s.step}</div>
      <div class="guide-step-body">
        <div class="guide-step-title">${escapeHtml(s.title || "")}</div>
        <div class="guide-step-detail">${escapeHtml(s.detail || "")}</div>
        ${s.anchor ? `<a class="guide-step-anchor" href="${escapeAttr(s.anchor)}">바로가기 →</a>` : ""}
      </div>
    </li>
  `).join("");
  return `<ol class="guide-steps">${items}</ol>`;
}

function renderModuleGuides(modules) {
  if (!Array.isArray(modules) || modules.length === 0) {
    return '<p class="muted">등록된 모듈 가이드가 없습니다.</p>';
  }
  const cards = modules.map((m) => {
    const list = (arr, label) => `
      <div class="module-guide-block">
        <div class="module-guide-block-label">${escapeHtml(label)}</div>
        <ul class="module-guide-list">
          ${(arr || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("") || '<li class="muted">—</li>'}
        </ul>
      </div>
    `;
    const links = (m.officialLinks || []).map((l) => `
      <a class="module-guide-link" href="${escapeAttr(l.url)}" target="_blank" rel="noopener noreferrer">
        ${escapeHtml(l.label || l.url)} ↗
      </a>
    `).join("");
    return `
      <div class="module-guide-card" data-module-id="${escapeAttr(m.moduleId || "")}">
        <h4 class="module-guide-title">${escapeHtml(m.displayName || m.moduleId || "")}</h4>
        <div class="module-guide-grid">
          ${list(m.whatToCollect, "수집 대상")}
          ${list(m.whereToReport, "신고처")}
          ${list(m.evidence, "필요한 증거")}
          ${list(m.rewardGuide, "포상/보상 공식 기준 (수령 보장 없음)")}
        </div>
        ${links ? `<div class="module-guide-links">${links}</div>` : ""}
      </div>
    `;
  }).join("");
  return `<div class="module-guide-grid-outer">${cards}</div>`;
}

function renderOfficialLinks(links) {
  if (!Array.isArray(links) || links.length === 0) {
    return '<p class="muted">공식 링크가 없습니다.</p>';
  }
  return `
    <div class="official-link-grid">
      ${links.map((l) => `
        <div class="official-link-card">
          <a href="${escapeAttr(l.url)}" target="_blank" rel="noopener noreferrer" class="official-link-label">${escapeHtml(l.label || l.url)} ↗</a>
          <p class="official-link-caution">${escapeHtml(l.caution || "공식 기준은 변경될 수 있으므로 실전 신고 전 재확인하세요.")}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderFaqs(faqs) {
  if (!Array.isArray(faqs) || faqs.length === 0) {
    return '<p class="muted">FAQ 가 없습니다.</p>';
  }
  return `
    <ul class="faq-list">
      ${faqs.map((f) => `
        <li class="faq-item" data-faq-id="${escapeAttr(f.id || "")}">
          <button type="button" class="faq-question" data-faq-toggle="1">
            <span class="faq-q-text">${escapeHtml(f.question || "")}</span>
            <span class="faq-q-toggle" aria-hidden="true">+</span>
          </button>
          <div class="faq-answer">${escapeHtml(f.answer || "")}</div>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderGuideQa(guide) {
  const root = document.getElementById("guideQaPanel");
  if (!root) return;
  if (!guide) {
    root.innerHTML = GUIDE_FALLBACK_HTML;
    return;
  }
  const rules = (guide.safetyRules || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("");

  root.innerHTML = `
    <div class="guide-grid">
      <div class="guide-card guide-card-intro">
        <h3 class="guide-title">${escapeHtml(guide.title || "공익레이더 사용 가이드")}</h3>
        <p class="muted guide-subtitle">${escapeHtml(guide.subtitle || "")}</p>
        <p class="guide-description">${escapeHtml(guide.description || "")}</p>
        <div class="guide-safety">
          <strong>안전 원칙</strong>
          <ul>${rules}</ul>
        </div>
      </div>
      <div class="guide-card guide-card-firstrun">
        <h3 class="guide-title">처음 사용자 첫 실행 순서</h3>
        <p class="muted">실제 신고 전에 Mock 검증과 수동 URL 테스트를 먼저 진행하세요.</p>
        ${renderFirstRunSteps(guide.firstRunSteps)}
      </div>
    </div>

    <h3 class="guide-section-title">모듈별 가이드</h3>
    <p class="muted">모듈별로 무엇을 수집하고 어디에 신고하며 어떤 증거가 필요한지, 포상/보상 공식 기준 확인 위치를 안내합니다. <strong>포상금 수령을 보장하지 않습니다.</strong></p>
    ${renderModuleGuides(guide.moduleGuides)}

    <h3 class="guide-section-title">공식 링크</h3>
    <p class="muted">공식 기준은 기관별로 변경될 수 있으므로 실전 신고 전 사람이 직접 재확인해야 합니다.</p>
    ${renderOfficialLinks(guide.officialLinks)}

    <h3 class="guide-section-title">자주 묻는 질문 (Q&amp;A)</h3>
    ${renderFaqs(guide.faqs)}

    <div class="guide-foot">
      <p class="muted">⚠ ${escapeHtml(guide.safetyNotice || "공익레이더는 자동 신고를 수행하지 않으며, 포상금 수령을 보장하지 않습니다.")}</p>
      <p class="muted">${escapeHtml(guide.rewardDisclaimer || "")}</p>
    </div>
  `;
}

// ---------- Settings (실전 재점검 04) ----------
const SETTINGS_FALLBACK_HTML = `
  <div class="settings-card settings-fallback">
    <p class="muted">설정 정보를 불러오지 못했습니다. .env와 서버 실행 상태를 확인하세요.</p>
  </div>
`;

function bindSettings() {
  const btn = document.getElementById("settingsRefreshBtn");
  if (btn) btn.addEventListener("click", loadSettings);
}

async function loadSettings() {
  const root = document.getElementById("settingsPanel");
  if (!root) return;
  try {
    const res = await fetch("/api/settings");
    const data = await res.json();
    if (!data.ok || !data.settings) throw new Error(data.message || "settings failed");
    renderSettings(data.settings);
    renderOnboardingSetupSummary(data.settings);
  } catch (err) {
    root.innerHTML = SETTINGS_FALLBACK_HTML + `<p class="muted" style="margin-top:8px;font-size:12px;">[debug] ${escapeHtml(err.message)}</p>`;
    renderOnboardingSetupSummary(null);
  }
}

// 초보자 온보딩 카드의 "설정 점검 요약" (체크리스트 8~9). /api/settings 실패 시에도 안전 문구를 보여준다.
function renderOnboardingSetupSummary(settings) {
  const root = document.getElementById("onboardingSetupSummary");
  if (!root) return;
  if (!settings) {
    root.innerHTML = `
      <div class="onboarding-setup-fallback">
        <p class="muted">설정 점검 상태를 불러오지 못했습니다. 설정 화면에서 직접 확인하세요.</p>
        <p class="muted" style="font-size:12px;">자동신고 없음 · 사람 검토 필수 · 수동 제출 기록만 가능</p>
      </div>`;
    return;
  }
  const env = settings.envStatus || {};
  const mode = env.runtimeMode || (settings.runtime && settings.runtime.runtimeMode) || "MOCK";
  const modeKind = mode === "REAL_READY" ? "ok" : mode === "MIXED" ? "warn" : "off";
  const notices = Array.isArray(settings.setupNotices) ? settings.setupNotices.slice(0, 4) : [];
  const chips = [
    `${settingsBadge("MODE: " + mode, modeKind)}`,
    env.openaiApiKey ? settingsBadge("OpenAI 키 " + (env.openaiApiKey.present ? "설정됨" : "미설정"), env.openaiApiKey.present ? "ok" : "off") : "",
    env.evidenceScreenshot || env.evidencePdf
      ? settingsBadge("증거 캡처 " + ((env.evidenceScreenshot && env.evidenceScreenshot.enabled) || (env.evidencePdf && env.evidencePdf.enabled) ? "켜짐" : "꺼짐"),
          ((env.evidenceScreenshot && env.evidenceScreenshot.enabled) || (env.evidencePdf && env.evidencePdf.enabled)) ? "warn" : "off")
      : ""
  ].filter(Boolean).join(" ");
  const noticeHtml = notices.map((n) => {
    const tone = n.tone === "warn" ? "warn" : n.tone === "info" ? "info" : "safe";
    return `<li class="setup-notice setup-notice-${tone}">${escapeHtml(n.text || "")}</li>`;
  }).join("");
  root.innerHTML = `
    <div class="onboarding-setup-inner">
      <div class="onboarding-setup-chips">${chips}</div>
      <ul class="setup-notice-list onboarding-setup-notices">${noticeHtml}</ul>
      <button class="ghost" type="button" data-view-target="settings">설정 점검 자세히 보기 →</button>
    </div>`;
}

function settingsBadge(text, kind) {
  const cls = kind === "ok" ? "ok" : kind === "warn" ? "warn" : kind === "off" ? "off" : "";
  return `<span class="settings-badge ${cls}">${escapeHtml(text)}</span>`;
}

function settingsRow(label, valueHtml) {
  return `
    <div class="settings-row">
      <div class="settings-label">${escapeHtml(label)}</div>
      <div class="settings-value">${valueHtml}</div>
    </div>
  `;
}

// 초보자 설정 점검 카드 (체크리스트 8) — .env 를 직접 열지 않고도 안전 설정을 확인.
function renderSetupCheckCard(settings) {
  if (!settings) return "";
  const notices = Array.isArray(settings.setupNotices) ? settings.setupNotices : [];
  const env = settings.envStatus || {};
  const flag = (f, label) => {
    if (!f) return "";
    const on = f.present === true || f.enabled === true;
    const kind = f.isSecret ? (on ? "ok" : "off") : (on ? "ok" : "off");
    return settingsRow(`${label} (${f.key})`, settingsBadge(f.label || (on ? "설정됨" : "미설정"), kind));
  };
  const noticeHtml = notices.length
    ? notices.map((n) => {
        const tone = n.tone === "warn" ? "warn" : n.tone === "info" ? "info" : "safe";
        return `<li class="setup-notice setup-notice-${tone}">${escapeHtml(n.text || "")}</li>`;
      }).join("")
    : `<li class="setup-notice setup-notice-info">설정 안내를 불러오지 못했습니다.</li>`;

  return `
    <div class="settings-card setup-check-card">
      <h4 class="settings-card-title">🛡 설정 점검 (초보자용)</h4>
      <p class="muted" style="margin:2px 0 10px;font-size:12px;">아래는 지금 시스템이 안전하게 설정되어 있는지 보여줍니다. API 키 원문은 표시하지 않습니다.</p>
      <ul class="setup-notice-list">${noticeHtml}</ul>
      <div class="setup-env-grid">
        ${settingsRow("현재 실행 모드", `${settingsBadge(env.runtimeMode || "MOCK", env.runtimeMode === "REAL_READY" ? "ok" : env.runtimeMode === "MIXED" ? "warn" : "off")} <span class="settings-hint">Mock = 실제 비용 없음</span>`)}
        ${flag(env.openaiApiKey, "OpenAI API 키")}
        ${flag(env.naverClientId, "Naver Client ID")}
        ${flag(env.naverClientSecret, "Naver Client Secret")}
        ${flag(env.evidenceScreenshot, "증거 스크린샷")}
        ${flag(env.evidencePdf, "증거 PDF")}
        ${flag(env.schedulerEnabled, "정기 수집 스케줄러")}
        ${flag(env.privacyDryRun, "개인정보 dry-run")}
      </div>
      <p class="muted" style="margin-top:8px;font-size:12px;">자동신고 없음 · 사람 검토 필수 · 수동 제출 기록만 가능</p>
    </div>
  `;
}

function renderRuntimeSettings(runtime) {
  if (!runtime) return "";
  const modeKind = runtime.runtimeMode === "REAL_READY" ? "ok" : runtime.runtimeMode === "MIXED" ? "warn" : "off";
  return `
    <div class="settings-card">
      <h4 class="settings-card-title">실행 모드</h4>
      ${settingsRow("Runtime mode", `${settingsBadge(runtime.runtimeMode, modeKind)} <span class="settings-hint">${escapeHtml(runtime.label || "")}</span>`)}
      ${settingsRow("MOCK_AI", runtime.mockAi ? settingsBadge("true", "warn") : settingsBadge("false", "ok"))}
      ${settingsRow("MOCK_SCOUT", runtime.mockScout ? settingsBadge("true", "warn") : settingsBadge("false", "ok"))}
      ${settingsRow("USE_DB", runtime.useDb ? settingsBadge("true", "ok") : settingsBadge("false", "off"))}
      ${settingsRow("Scout mode", settingsBadge(runtime.scoutMode || "mock", runtime.scoutMode === "real" ? "ok" : "off"))}
      ${settingsRow("NODE_ENV", `<code>${escapeHtml(runtime.nodeEnv || "")}</code>`)}
    </div>
  `;
}

function renderApiConnectionSettings(api) {
  if (!api) return "";
  const openai = api.openai || { configured: false, label: "미연결" };
  const naver = api.naver || { configured: false, label: "미연결" };
  return `
    <div class="settings-card">
      <h4 class="settings-card-title">API 연결 상태</h4>
      ${settingsRow("OpenAI", `${settingsBadge(openai.configured ? "연결됨" : "미연결", openai.configured ? "ok" : "off")} <span class="settings-hint">API 키 원문은 표시되지 않습니다</span>`)}
      ${settingsRow("Naver", `${settingsBadge(naver.configured ? "연결됨" : "미연결", naver.configured ? "ok" : "off")} <span class="settings-hint">API 키 원문은 표시되지 않습니다</span>`)}
      <ul class="muted" style="list-style:disc;padding-left:20px;margin:8px 0 0;font-size:12px;">
        <li>기본값은 Mock 모드입니다.</li>
        <li>Real 모드는 사용자가 직접 API 키를 설정하고 MOCK_AI=false로 변경한 경우에만 사용됩니다.</li>
        <li>API 사용 시 비용이 발생할 수 있습니다.</li>
        <li>API 키 원문은 화면에 표시하지 않습니다. (설정됨 / 미설정 만 표시)</li>
      </ul>
    </div>
  `;
}

function renderSchedulerSettings(sch) {
  if (!sch) return "";
  return `
    <div class="settings-card">
      <h4 class="settings-card-title">Scheduler</h4>
      ${settingsRow("활성", sch.enabled ? settingsBadge("enabled", "ok") : settingsBadge("disabled", "off"))}
      ${settingsRow("cron", `<code>${escapeHtml(sch.cron || "")}</code>`)}
      ${settingsRow("timezone", `<code>${escapeHtml(sch.timezone || "")}</code>`)}
      ${settingsRow("mode", `<code>${escapeHtml(sch.mode || "")}</code>`)}
      ${settingsRow("최대 후보", `<code>${Number(sch.maxCandidates || 0)}</code>`)}
      ${settingsRow("topics", `<span class="settings-hint">${escapeHtml((sch.topics || []).join(", ") || "—")}</span>`)}
      ${settingsRow("sources", `<span class="settings-hint">${escapeHtml((sch.sources || []).join(", ") || "—")}</span>`)}
    </div>
  `;
}

function renderPrivacySettings(privacy) {
  if (!privacy) return "";
  const rd = privacy.retentionDays || {};
  return `
    <div class="settings-card">
      <h4 class="settings-card-title">개인정보 보호</h4>
      ${settingsRow("Masking enabled", privacy.maskingEnabled ? settingsBadge("true", "ok") : settingsBadge("false", "warn"))}
      ${settingsRow("Privacy dry-run", privacy.dryRun ? settingsBadge("true", "ok") : settingsBadge("false", "warn"))}
      ${settingsRow("Retention (default)", `<code>${Number(rd.default || 0)}</code> 일`)}
      ${settingsRow("Retention (trace)", `<code>${Number(rd.trace || 0)}</code> 일`)}
      ${settingsRow("Retention (evidence)", `<code>${Number(rd.evidence || 0)}</code> 일`)}
      ${settingsRow("Retention (report)", `<code>${Number(rd.report || 0)}</code> 일`)}
      ${settingsRow("Retention (feedback)", `<code>${Number(rd.feedback || 0)}</code> 일`)}
      ${settingsRow("Retention (case)", `<code>${Number(rd.case || 0)}</code> 일`)}
    </div>
  `;
}

function renderStorageSettings(storage) {
  if (!storage) return "";
  return `
    <div class="settings-card">
      <h4 class="settings-card-title">저장소 경로</h4>
      ${settingsRow("DATA_DIR", `<code class="settings-path">${escapeHtml(storage.dataDir || "")}</code>`)}
      ${settingsRow("EVIDENCE_DIR", `<code class="settings-path">${escapeHtml(storage.evidenceDir || "")}</code>`)}
      ${settingsRow("REPORTS_DIR", `<code class="settings-path">${escapeHtml(storage.reportsDir || "")}</code>`)}
      ${settingsRow("TRACE_DIR", `<code class="settings-path">${escapeHtml(storage.traceDir || "")}</code>`)}
      ${settingsRow("FEEDBACK_DIR", `<code class="settings-path">${escapeHtml(storage.feedbackDir || "")}</code>`)}
    </div>
  `;
}

function renderSafetySettings(safety) {
  if (!safety) return "";
  const notes = (safety.notes || []).map((n) => `<li>${escapeHtml(n)}</li>`).join("");
  return `
    <div class="settings-card">
      <h4 class="settings-card-title">안전 설정</h4>
      ${settingsRow("자동 제출 허용", settingsBadge(String(safety.autoSubmitAllowed === true), safety.autoSubmitAllowed === true ? "warn" : "off"))}
      ${settingsRow("사람 검토 필요", settingsBadge(String(safety.humanReviewRequired === true), "ok"))}
      ${settingsRow("Approval Gate", settingsBadge(String(safety.approvalGate || "enabled"), safety.approvalGate === "enabled" ? "ok" : "warn"))}
      ${notes ? `<ul class="settings-list">${notes}</ul>` : ""}
    </div>
  `;
}

function renderReadinessSettings(readiness) {
  if (!readiness) return "";
  const stageKind = readiness.stage === "HUMAN_REVIEW_READY" || readiness.stage === "OPERATION_READY" ? "ok"
    : readiness.stage === "API_KEY_REQUIRED" || readiness.stage === "SETUP_REQUIRED" ? "warn" : "";
  const blocking = (readiness.blockingItems || []).map((b) => `<li>${escapeHtml(b)}</li>`).join("");
  const next = (readiness.nextActions || []).map((b) => `<li>${escapeHtml(b)}</li>`).join("");
  return `
    <div class="settings-card">
      <h4 class="settings-card-title">Readiness</h4>
      ${settingsRow("stage", `${settingsBadge(readiness.stage || "", stageKind)} <span class="settings-hint">${escapeHtml(readiness.label || "")}</span>`)}
      ${blocking ? `<div class="settings-sublabel">blockingItems</div><ul class="settings-list">${blocking}</ul>` : `<div class="settings-sublabel">blockingItems</div><p class="muted" style="margin:4px 0 0;font-size:12px;">없음</p>`}
      ${next ? `<div class="settings-sublabel">nextActions</div><ul class="settings-list">${next}</ul>` : ""}
    </div>
  `;
}

function renderAppSettings(app) {
  if (!app) return "";
  return `
    <div class="settings-card">
      <h4 class="settings-card-title">앱 정보</h4>
      ${settingsRow("제품명", `<strong>${escapeHtml(app.name || "공익레이더")}</strong>`)}
      ${settingsRow("버전", `<code>${escapeHtml(app.version || "")}</code>`)}
      ${settingsRow("환경", `<code>${escapeHtml(app.environment || "")}</code>`)}
      ${settingsRow("포트", `<code>${Number(app.port || 0)}</code>`)}
    </div>
  `;
}

function renderSettings(settings) {
  const root = document.getElementById("settingsPanel");
  if (!root) return;
  if (!settings) {
    root.innerHTML = SETTINGS_FALLBACK_HTML;
    return;
  }
  root.innerHTML = `
    <div class="settings-grid">
      ${renderSetupCheckCard(settings)}
      ${renderAppSettings(settings.app)}
      ${renderRuntimeSettings(settings.runtime)}
      ${renderApiConnectionSettings(settings.apiConnections)}
      ${renderSchedulerSettings(settings.scheduler)}
      ${renderPrivacySettings(settings.privacy)}
      ${renderStorageSettings(settings.storage)}
      ${renderSafetySettings(settings.safety)}
      ${renderReadinessSettings(settings.readiness)}
    </div>
    <p class="muted" style="margin-top:10px;font-size:12px;">${escapeHtml(settings.safetyNotice || "설정 화면은 상태만 표시하며 API 키 원문을 표시하지 않습니다. 외부 신고기관 자동 제출 기능은 제공하지 않습니다.")}</p>
  `;
}

// ---------- Reward Registry (실전 재점검 05) ----------
const REWARD_FALLBACK_HTML = `
  <div class="reward-program-card reward-fallback">
    <p class="muted">신고포상금 제도 정보를 불러오지 못했습니다. 실전 신고 전 공식 기관 페이지를 직접 확인하세요.</p>
  </div>
`;

const rewardRegistryState = {
  programs: [],
  summary: null,
  filterModuleId: "ALL"
};

function bindRewardRegistry() {
  const btn = document.getElementById("rewardRegistryRefreshBtn");
  if (btn) btn.addEventListener("click", loadRewardPrograms);
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const chip = t.closest && t.closest("[data-reward-filter]");
    if (!chip) return;
    e.preventDefault();
    rewardRegistryState.filterModuleId = chip.getAttribute("data-reward-filter") || "ALL";
    renderRewardPrograms({
      programs: rewardRegistryState.programs,
      summary: rewardRegistryState.summary
    });
  });
}

async function loadRewardPrograms() {
  const root = document.getElementById("rewardRegistryPanel");
  if (!root) return;
  try {
    const res = await fetch("/api/reward-programs");
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.programs)) throw new Error(data.message || "reward programs failed");
    rewardRegistryState.programs = data.programs;
    rewardRegistryState.summary = data.summary || null;
    renderRewardPrograms({ programs: data.programs, summary: data.summary });
  } catch (err) {
    root.innerHTML = REWARD_FALLBACK_HTML + `<p class="muted" style="margin-top:8px;font-size:12px;">[debug] ${escapeHtml(err.message)}</p>`;
  }
}

function renderRewardProgramSummary(summary) {
  if (!summary) return "";
  return `
    <div class="reward-program-summary">
      <span class="reward-program-summary-item"><strong>총 ${Number(summary.total || 0)}개 제도</strong> 안내</span>
      <span class="reward-program-summary-item">최종 점검일 <code>${escapeHtml(summary.lastReviewedAt || "")}</code></span>
      <span class="reward-program-summary-item reward-program-summary-warn">⚠ 공식 기준 확인 필요</span>
    </div>
  `;
}

function renderRewardProgramFilter(programs) {
  const moduleIds = Array.from(new Set((programs || []).map((p) => p.moduleId).filter(Boolean))).sort();
  if (moduleIds.length === 0) return "";
  const active = rewardRegistryState.filterModuleId || "ALL";
  const chips = [
    `<button type="button" class="reward-filter-chip ${active === "ALL" ? "active" : ""}" data-reward-filter="ALL">전체 (${programs.length})</button>`,
    ...moduleIds.map((m) => {
      const count = programs.filter((p) => p.moduleId === m).length;
      return `<button type="button" class="reward-filter-chip ${active === m ? "active" : ""}" data-reward-filter="${escapeAttr(m)}">${escapeHtml(m)} (${count})</button>`;
    })
  ];
  return `<div class="reward-filter-row">${chips.join("")}</div>`;
}

function renderRewardProgramCard(program) {
  if (!program) return "";
  const ul = (arr) => (arr || []).length === 0
    ? `<li class="muted">—</li>`
    : (arr || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  return `
    <article class="reward-program-card" data-program-id="${escapeAttr(program.id || "")}">
      <header class="reward-program-header">
        <h4 class="reward-program-title">${escapeHtml(program.title || "")}</h4>
        <div class="reward-program-meta">
          <span class="badge muted">${escapeHtml(program.moduleId || "")}</span>
          <span class="reward-program-agency">${escapeHtml(program.agencyName || "")}</span>
        </div>
        <p class="reward-program-dept muted">${escapeHtml(program.departmentHint || "")}</p>
      </header>

      <details class="reward-program-block" open>
        <summary>수집할 자료</summary>
        <ul class="reward-program-list">${ul(program.whatToCollect)}</ul>
      </details>

      <details class="reward-program-block">
        <summary>필요 증거 체크리스트</summary>
        <ul class="reward-program-list">${ul(program.evidenceChecklist)}</ul>
      </details>

      <details class="reward-program-block">
        <summary>지급 기준 요약 (공식 기준 확인 필요)</summary>
        <p class="reward-program-summary-text">${escapeHtml(program.rewardBasisSummary || "")}</p>
        <p class="reward-program-amount"><strong>금액/한도 안내:</strong> ${escapeHtml(program.amountGuide || "")}</p>
      </details>

      <details class="reward-program-block">
        <summary>제외사유 · 주의사항</summary>
        <ul class="reward-program-list">${ul(program.exclusionNotes)}</ul>
        ${(program.cautionRules || []).length ? `<ul class="reward-program-list reward-program-caution-list">${(program.cautionRules || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>` : ""}
      </details>

      <footer class="reward-program-footer">
        <a class="reward-program-link" href="${escapeAttr(program.officialUrl || "")}" target="_blank" rel="noopener noreferrer">
          공식 페이지 열기 ↗
        </a>
        <span class="reward-program-reviewed muted">최종 점검일 <code>${escapeHtml(program.lastReviewedAt || "")}</code></span>
      </footer>

      <p class="reward-program-caution">⚠ 본 안내는 참고용이며, 포상금 수령을 보장하지 않습니다. 공식 URL에서 최신 기준을 사람이 직접 확인하세요.</p>
    </article>
  `;
}

function renderRewardPrograms(payload) {
  const root = document.getElementById("rewardRegistryPanel");
  if (!root) return;
  if (!payload || !Array.isArray(payload.programs) || payload.programs.length === 0) {
    if (rewardRegistryState.programs.length === 0) {
      root.innerHTML = REWARD_FALLBACK_HTML;
      return;
    }
    payload = { programs: rewardRegistryState.programs, summary: rewardRegistryState.summary };
  }
  const programs = payload.programs;
  const summary = payload.summary || rewardRegistryState.summary;
  const active = rewardRegistryState.filterModuleId || "ALL";
  const filtered = active === "ALL" ? programs : programs.filter((p) => p.moduleId === active);
  const cards = filtered.map(renderRewardProgramCard).join("") || `<p class="muted">해당 모듈에 등록된 제도가 없습니다.</p>`;

  root.innerHTML = `
    ${renderRewardProgramSummary(summary)}
    ${renderRewardProgramFilter(programs)}
    <div class="reward-program-grid">${cards}</div>
    <p class="muted" style="margin-top:8px;font-size:12px;">신고포상금·보상금은 공식 기준과 처리 결과에 따라 달라지며, 공익레이더는 수령을 보장하지 않습니다.</p>
  `;
}

// ---------- False Ad Practical Guide (실전 재점검 06) ----------
const FALSE_AD_GUIDE_FALLBACK_HTML = `
  <div class="false-ad-guide-card false-ad-guide-fallback">
    <p class="muted">건강기능식품 신고·포상 가이드를 불러오지 못했습니다. 실전 신고 전 식약처 공식 기준을 직접 확인하세요.</p>
  </div>
`;

function bindFalseAdGuide() {
  const btn = document.getElementById("falseAdGuideRefreshBtn");
  if (btn) btn.addEventListener("click", loadFalseAdGuide);
}

async function loadFalseAdGuide() {
  const root = document.getElementById("falseAdGuidePanel");
  if (!root) return;
  try {
    const res = await fetch("/api/modules/false-ad/guide");
    const data = await res.json();
    if (!data.ok || !data.guide) throw new Error(data.message || "false ad guide failed");
    renderFalseAdGuide(data.guide);
  } catch (err) {
    root.innerHTML = FALSE_AD_GUIDE_FALLBACK_HTML + `<p class="muted" style="margin-top:8px;font-size:12px;">[debug] ${escapeHtml(err.message)}</p>`;
  }
}

function renderFalseAdReportingChannels(channels) {
  if (!Array.isArray(channels) || channels.length === 0) {
    return `<p class="muted">신고처 정보가 없습니다.</p>`;
  }
  const items = channels.map((c) => `
    <div class="false-ad-guide-card">
      <div class="false-ad-channel-header">
        <h4 class="false-ad-channel-title">${escapeHtml(c.agencyName || "")}</h4>
        ${c.officialUrl ? `<a class="false-ad-link" href="${escapeAttr(c.officialUrl)}" target="_blank" rel="noopener noreferrer">공식 페이지 ↗</a>` : `<span class="badge muted">관할 지자체 공식 홈페이지 확인</span>`}
      </div>
      <p class="false-ad-channel-desc">${escapeHtml(c.description || "")}</p>
      <p class="false-ad-warning">⚠ ${escapeHtml(c.caution || "")}</p>
    </div>
  `).join("");
  return `<div class="false-ad-guide-grid">${items}</div>`;
}

function renderFalseAdClaimTypes(types) {
  if (!Array.isArray(types) || types.length === 0) {
    return `<p class="muted">금지/검토 표현 유형이 없습니다.</p>`;
  }
  const levelLabel = (lv) => lv === "HIGH" ? '<span class="badge danger">HIGH 검토</span>'
    : lv === "MEDIUM" ? '<span class="badge warn">MEDIUM 검토</span>'
    : '<span class="badge muted">LOW 검토</span>';
  const items = types.map((t) => `
    <div class="false-ad-guide-card">
      <div class="false-ad-claim-header">
        <h4 class="false-ad-claim-title">${escapeHtml(t.category || "")}</h4>
        ${levelLabel(t.reviewLevel || "MEDIUM")}
      </div>
      <ul class="false-ad-example-list">
        ${(t.examples || []).map((ex) => `<li><code>${escapeHtml(ex)}</code></li>`).join("")}
      </ul>
      <p class="false-ad-why">${escapeHtml(t.whyItMatters || "")}</p>
    </div>
  `).join("");
  return `<div class="false-ad-guide-grid">${items}</div>`;
}

function renderFalseAdEvidenceChecklist(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="muted">증거 체크리스트가 없습니다.</p>`;
  }
  return `
    <ul class="false-ad-checklist">
      ${items.map((it) => `
        <li class="${it.required ? "required" : "optional"}">
          <span class="false-ad-check-badge">${it.required ? "필수" : "선택"}</span>
          <div>
            <div class="false-ad-check-label">${escapeHtml(it.label || "")}</div>
            ${it.hint ? `<div class="false-ad-check-hint muted">${escapeHtml(it.hint)}</div>` : ""}
          </div>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderFalseAdPreReportChecklist(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="muted">신고 전 확인사항이 없습니다.</p>`;
  }
  return `
    <ul class="false-ad-checklist">
      ${items.map((it) => `
        <li class="${it.required ? "required" : "optional"}">
          <span class="false-ad-check-badge">${it.required ? "필수" : "선택"}</span>
          <div class="false-ad-check-label">${escapeHtml(it.label || "")}</div>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderFalseAdRewardCaution(caution) {
  if (!caution) return "";
  const notes = (caution.notes || []).map((n) => `<li>${escapeHtml(n)}</li>`).join("");
  return `
    <div class="false-ad-guide-card false-ad-reward-caution">
      <h4 class="false-ad-claim-title">${escapeHtml(caution.title || "신고포상금 지급 기준 안내")}</h4>
      <p>${escapeHtml(caution.summary || "")}</p>
      <ul class="false-ad-example-list">${notes}</ul>
      <p class="false-ad-warning">⚠ 포상금 수령을 보장하지 않습니다. 공식 기준 확인 필요.</p>
    </div>
  `;
}

function renderFalseAdExamples(examples) {
  if (!Array.isArray(examples) || examples.length === 0) {
    return `<p class="muted">예시가 없습니다.</p>`;
  }
  const groups = { suspicious: [], normal: [], needs_review: [] };
  for (const e of examples) {
    const cat = e.category || "needs_review";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(e);
  }
  const groupLabel = { suspicious: "검토 후보 (의심)", normal: "허용 범위 예시", needs_review: "맥락 확인 필요" };
  const cards = Object.keys(groups).map((cat) => `
    <div class="false-ad-guide-card false-ad-example-card false-ad-example-${cat}">
      <h4 class="false-ad-claim-title">${escapeHtml(groupLabel[cat] || cat)}</h4>
      <ul class="false-ad-example-list">
        ${groups[cat].map((e) => `
          <li>
            <code>${escapeHtml(e.text || "")}</code>
            ${e.explanation ? `<div class="false-ad-check-hint muted">${escapeHtml(e.explanation)}</div>` : ""}
          </li>
        `).join("")}
      </ul>
    </div>
  `).join("");
  return `<div class="false-ad-guide-grid">${cards}</div>`;
}

function renderFalseAdOfficialLinks(links) {
  if (!Array.isArray(links) || links.length === 0) {
    return `<p class="muted">공식 링크가 없습니다.</p>`;
  }
  return `
    <div class="false-ad-guide-grid">
      ${links.map((l) => `
        <div class="false-ad-guide-card">
          <a class="false-ad-link" href="${escapeAttr(l.url || "")}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label || l.url || "")} ↗</a>
          <p class="false-ad-warning">⚠ ${escapeHtml(l.caution || "공식 기준은 변경될 수 있으므로 실전 신고 전 사람이 직접 재확인하세요.")}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderFalseAdGuide(guide) {
  const root = document.getElementById("falseAdGuidePanel");
  if (!root) return;
  if (!guide) {
    root.innerHTML = FALSE_AD_GUIDE_FALLBACK_HTML;
    return;
  }
  root.innerHTML = `
    <div class="false-ad-guide-intro">
      <h3 class="false-ad-section-title">${escapeHtml(guide.displayName || "건강기능식품 신고·포상 가이드")}</h3>
      <p class="muted">${escapeHtml(guide.safetyNotice || "이 가이드는 신고지원용이며, 법 위반 또는 포상금 지급을 확정하지 않습니다.")}</p>
    </div>

    <h3 class="false-ad-section-title">신고처</h3>
    ${renderFalseAdReportingChannels(guide.reportingChannels)}

    <h3 class="false-ad-section-title">금지/검토 표현 유형</h3>
    <p class="muted">아래 표현 유형은 위법 확정이 아니라, 사람이 추가 점검해야 할 검토 후보입니다.</p>
    ${renderFalseAdClaimTypes(guide.prohibitedClaimTypes)}

    <h3 class="false-ad-section-title">필요 증거 체크리스트</h3>
    ${renderFalseAdEvidenceChecklist(guide.evidenceChecklist)}

    <h3 class="false-ad-section-title">신고 전 확인사항</h3>
    ${renderFalseAdPreReportChecklist(guide.preReportChecklist)}

    <h3 class="false-ad-section-title">신고포상금 주의사항</h3>
    ${renderFalseAdRewardCaution(guide.rewardCaution)}

    <h3 class="false-ad-section-title">예시 문구</h3>
    ${renderFalseAdExamples(guide.examples)}

    <h3 class="false-ad-section-title">공식 링크</h3>
    ${renderFalseAdOfficialLinks(guide.officialLinks)}
  `;
}

// ---------- Counterfeit Practical Guide (실전 재점검 07) ----------
const COUNTERFEIT_GUIDE_FALLBACK_HTML = `
  <div class="counterfeit-guide-card counterfeit-guide-fallback">
    <p class="muted">위조상품 신고·포상 가이드를 불러오지 못했습니다. 실전 신고 전 특허청과 지식재산침해 원스톱 신고상담센터의 공식 기준을 직접 확인하세요.</p>
  </div>
`;

function bindCounterfeitGuide() {
  const btn = document.getElementById("counterfeitGuideRefreshBtn");
  if (btn) btn.addEventListener("click", loadCounterfeitGuide);
}

async function loadCounterfeitGuide() {
  const root = document.getElementById("counterfeitGuidePanel");
  if (!root) return;
  try {
    const res = await fetch("/api/modules/counterfeit-goods/guide");
    const data = await res.json();
    if (!data.ok || !data.guide) throw new Error(data.message || "counterfeit guide failed");
    renderCounterfeitGuide(data.guide);
  } catch (err) {
    root.innerHTML = COUNTERFEIT_GUIDE_FALLBACK_HTML + `<p class="muted" style="margin-top:8px;font-size:12px;">[debug] ${escapeHtml(err.message)}</p>`;
  }
}

function renderCounterfeitReportingChannels(channels) {
  if (!Array.isArray(channels) || channels.length === 0) {
    return `<p class="muted">신고처 정보가 없습니다.</p>`;
  }
  const items = channels.map((c) => `
    <div class="counterfeit-guide-card">
      <div class="counterfeit-channel-header">
        <h4 class="counterfeit-channel-title">${escapeHtml(c.agencyName || "")}</h4>
        ${c.officialUrl ? `<a class="counterfeit-link" href="${escapeAttr(c.officialUrl)}" target="_blank" rel="noopener noreferrer">공식 페이지 ↗</a>` : `<span class="badge muted">공식 페이지 직접 확인</span>`}
      </div>
      <p class="counterfeit-channel-desc">${escapeHtml(c.description || "")}</p>
      <p class="counterfeit-warning">⚠ ${escapeHtml(c.caution || "")}</p>
    </div>
  `).join("");
  return `<div class="counterfeit-guide-grid">${items}</div>`;
}

function renderCounterfeitSignals(signals) {
  if (!Array.isArray(signals) || signals.length === 0) {
    return `<p class="muted">위조상품 의심 신호가 없습니다.</p>`;
  }
  const levelLabel = (lv) => lv === "HIGH" ? '<span class="badge danger">HIGH 검토</span>'
    : lv === "MEDIUM" ? '<span class="badge warn">MEDIUM 검토</span>'
    : '<span class="badge muted">LOW 검토</span>';
  const items = signals.map((s) => `
    <div class="counterfeit-guide-card">
      <div class="counterfeit-signal-header">
        <h4 class="counterfeit-signal-title">${escapeHtml(s.category || "")}</h4>
        ${levelLabel(s.reviewLevel || "MEDIUM")}
      </div>
      <ul class="counterfeit-example-list">
        ${(s.examples || []).map((ex) => `<li><code>${escapeHtml(ex)}</code></li>`).join("")}
      </ul>
      <p class="counterfeit-why">${escapeHtml(s.whyItMatters || "")}</p>
    </div>
  `).join("");
  return `<div class="counterfeit-guide-grid">${items}</div>`;
}

function renderCounterfeitEvidenceChecklist(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="muted">증거 체크리스트가 없습니다.</p>`;
  }
  return `
    <ul class="counterfeit-checklist">
      ${items.map((it) => `
        <li class="${it.required ? "required" : "optional"}">
          <span class="counterfeit-check-badge">${it.required ? "필수" : "선택"}</span>
          <div>
            <div class="counterfeit-check-label">${escapeHtml(it.label || "")}</div>
            ${it.hint ? `<div class="counterfeit-check-hint muted">${escapeHtml(it.hint)}</div>` : ""}
          </div>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderCounterfeitPreReportChecklist(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="muted">신고 전 확인사항이 없습니다.</p>`;
  }
  return `
    <ul class="counterfeit-checklist">
      ${items.map((it) => `
        <li class="${it.required ? "required" : "optional"}">
          <span class="counterfeit-check-badge">${it.required ? "필수" : "선택"}</span>
          <div class="counterfeit-check-label">${escapeHtml(it.label || "")}</div>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderCounterfeitRewardCaution(caution) {
  if (!caution) return "";
  const notes = (caution.notes || []).map((n) => `<li>${escapeHtml(n)}</li>`).join("");
  return `
    <div class="counterfeit-guide-card counterfeit-reward-caution">
      <h4 class="counterfeit-signal-title">${escapeHtml(caution.title || "위조상품 신고포상금 기준 안내")}</h4>
      <p>${escapeHtml(caution.summary || "")}</p>
      <ul class="counterfeit-example-list">${notes}</ul>
      <p class="counterfeit-warning">⚠ 포상금 수령을 보장하지 않습니다. 위조 여부 확정은 권리자/관계기관 판단이 필요합니다.</p>
    </div>
  `;
}

function renderCounterfeitExamples(examples) {
  if (!Array.isArray(examples) || examples.length === 0) {
    return `<p class="muted">예시가 없습니다.</p>`;
  }
  const groups = { suspicious: [], normal: [], needs_review: [] };
  for (const e of examples) {
    const cat = e.category || "needs_review";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(e);
  }
  const groupLabel = { suspicious: "위조상품 의심 후보", normal: "참고 예시", needs_review: "맥락 확인 필요" };
  const cards = Object.keys(groups).map((cat) => `
    <div class="counterfeit-guide-card counterfeit-example counterfeit-example-${cat}">
      <h4 class="counterfeit-signal-title">${escapeHtml(groupLabel[cat] || cat)}</h4>
      <ul class="counterfeit-example-list">
        ${groups[cat].map((e) => `
          <li>
            <code>${escapeHtml(e.text || "")}</code>
            ${e.explanation ? `<div class="counterfeit-check-hint muted">${escapeHtml(e.explanation)}</div>` : ""}
          </li>
        `).join("")}
      </ul>
    </div>
  `).join("");
  return `<div class="counterfeit-guide-grid">${cards}</div>`;
}

function renderCounterfeitOfficialLinks(links) {
  if (!Array.isArray(links) || links.length === 0) {
    return `<p class="muted">공식 링크가 없습니다.</p>`;
  }
  return `
    <div class="counterfeit-guide-grid">
      ${links.map((l) => `
        <div class="counterfeit-guide-card">
          <a class="counterfeit-link" href="${escapeAttr(l.url || "")}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label || l.url || "")} ↗</a>
          <p class="counterfeit-warning">⚠ ${escapeHtml(l.caution || "공식 기준은 변경될 수 있으므로 실전 신고 전 사람이 직접 재확인하세요.")}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCounterfeitGuide(guide) {
  const root = document.getElementById("counterfeitGuidePanel");
  if (!root) return;
  if (!guide) {
    root.innerHTML = COUNTERFEIT_GUIDE_FALLBACK_HTML;
    return;
  }
  root.innerHTML = `
    <div class="counterfeit-guide-intro">
      <h3 class="counterfeit-section-title">${escapeHtml(guide.displayName || "위조상품 신고·포상 가이드")}</h3>
      <p class="muted">${escapeHtml(guide.safetyNotice || "이 가이드는 신고지원용이며, 위조 여부 또는 포상금 지급을 확정하지 않습니다.")}</p>
    </div>

    <h3 class="counterfeit-section-title">신고처</h3>
    ${renderCounterfeitReportingChannels(guide.reportingChannels)}

    <h3 class="counterfeit-section-title">위조상품 의심 신호</h3>
    <p class="muted">아래 신호는 위조 확정이 아니라, 사람이 추가 점검해야 할 위조상품 의심 후보 분류입니다.</p>
    ${renderCounterfeitSignals(guide.suspiciousSignals)}

    <h3 class="counterfeit-section-title">필요 증거 체크리스트</h3>
    ${renderCounterfeitEvidenceChecklist(guide.evidenceChecklist)}

    <h3 class="counterfeit-section-title">신고 전 확인사항</h3>
    ${renderCounterfeitPreReportChecklist(guide.preReportChecklist)}

    <h3 class="counterfeit-section-title">신고포상금 주의사항</h3>
    ${renderCounterfeitRewardCaution(guide.rewardCaution)}

    <h3 class="counterfeit-section-title">예시 문구</h3>
    ${renderCounterfeitExamples(guide.examples)}

    <h3 class="counterfeit-section-title">공식 링크</h3>
    ${renderCounterfeitOfficialLinks(guide.officialLinks)}
  `;
}

// ---------- Bid Collusion Practical Guide (실전 재점검 08) ----------
const BID_COLLUSION_GUIDE_FALLBACK_HTML = `
  <div class="bid-collusion-guide-card bid-collusion-guide-fallback">
    <p class="muted">공정위 담합 신고·포상 가이드를 불러오지 못했습니다. 실전 신고 전 공정거래위원회 공식 페이지에서 최신 신고서 양식과 포상금 기준을 직접 확인하세요.</p>
  </div>
`;

function bindBidCollusionGuide() {
  const btn = document.getElementById("bidCollusionGuideRefreshBtn");
  if (btn) btn.addEventListener("click", loadBidCollusionGuide);
}

async function loadBidCollusionGuide() {
  const root = document.getElementById("bidCollusionGuidePanel");
  if (!root) return;
  try {
    const res = await fetch("/api/modules/bid-collusion/guide");
    const data = await res.json();
    if (!data.ok || !data.guide) throw new Error(data.message || "bid collusion guide failed");
    renderBidCollusionGuide(data.guide);
  } catch (err) {
    root.innerHTML = BID_COLLUSION_GUIDE_FALLBACK_HTML + `<p class="muted" style="margin-top:8px;font-size:12px;">[debug] ${escapeHtml(err.message)}</p>`;
  }
}

function renderBidCollusionReportingChannels(channels) {
  if (!Array.isArray(channels) || channels.length === 0) {
    return `<p class="muted">신고처 정보가 없습니다.</p>`;
  }
  const items = channels.map((c) => `
    <div class="bid-collusion-guide-card">
      <div class="bid-collusion-channel-header">
        <h4 class="bid-collusion-channel-title">${escapeHtml(c.agencyName || "")}</h4>
        ${c.officialUrl ? `<a class="bid-collusion-link" href="${escapeAttr(c.officialUrl)}" target="_blank" rel="noopener noreferrer">공식 페이지 ↗</a>` : `<span class="badge muted">공식 페이지 직접 확인</span>`}
      </div>
      <p class="bid-collusion-channel-desc">${escapeHtml(c.description || "")}</p>
      <p class="bid-collusion-warning">⚠ ${escapeHtml(c.caution || "")}</p>
    </div>
  `).join("");
  return `<div class="bid-collusion-guide-grid">${items}</div>`;
}

function renderBidCollusionPatterns(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return `<p class="muted">담합 의심 패턴이 없습니다.</p>`;
  }
  const levelLabel = (lv) => lv === "HIGH" ? '<span class="badge danger">HIGH 검토</span>'
    : lv === "MEDIUM" ? '<span class="badge warn">MEDIUM 검토</span>'
    : '<span class="badge muted">LOW 검토</span>';
  const items = patterns.map((p) => `
    <div class="bid-collusion-guide-card">
      <div class="bid-collusion-pattern-header">
        <h4 class="bid-collusion-pattern-title">${escapeHtml(p.category || "")}</h4>
        ${levelLabel(p.reviewLevel || "MEDIUM")}
      </div>
      <ul class="bid-collusion-example-list">
        ${(p.examples || []).map((ex) => `<li><code>${escapeHtml(ex)}</code></li>`).join("")}
      </ul>
      <p class="bid-collusion-why">${escapeHtml(p.whyItMatters || "")}</p>
    </div>
  `).join("");
  return `<div class="bid-collusion-guide-grid">${items}</div>`;
}

function renderBidCollusionEvidenceChecklist(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="muted">증거 체크리스트가 없습니다.</p>`;
  }
  return `
    <ul class="bid-collusion-checklist">
      ${items.map((it) => `
        <li class="${it.required ? "required" : "optional"}">
          <span class="bid-collusion-check-badge">${it.required ? "필수" : "선택"}</span>
          <div>
            <div class="bid-collusion-check-label">${escapeHtml(it.label || "")}</div>
            ${it.hint ? `<div class="bid-collusion-check-hint muted">${escapeHtml(it.hint)}</div>` : ""}
          </div>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderBidCollusionPreReportChecklist(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="muted">신고 전 확인사항이 없습니다.</p>`;
  }
  return `
    <ul class="bid-collusion-checklist">
      ${items.map((it) => `
        <li class="${it.required ? "required" : "optional"}">
          <span class="bid-collusion-check-badge">${it.required ? "필수" : "선택"}</span>
          <div class="bid-collusion-check-label">${escapeHtml(it.label || "")}</div>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderBidCollusionRewardCaution(caution) {
  if (!caution) return "";
  const notes = (caution.notes || []).map((n) => `<li>${escapeHtml(n)}</li>`).join("");
  return `
    <div class="bid-collusion-guide-card bid-collusion-reward-caution">
      <h4 class="bid-collusion-pattern-title">${escapeHtml(caution.title || "공정위 담합 신고포상금 기준 안내")}</h4>
      <p>${escapeHtml(caution.summary || "")}</p>
      <ul class="bid-collusion-example-list">${notes}</ul>
      <p class="bid-collusion-warning">⚠ 포상금 수령을 보장하지 않습니다. 담합 여부와 지급 여부는 공정위 조치 결과에 따라 달라집니다.</p>
    </div>
  `;
}

function renderBidCollusionExamples(examples) {
  if (!Array.isArray(examples) || examples.length === 0) {
    return `<p class="muted">예시가 없습니다.</p>`;
  }
  const groups = { suspicious: [], normal: [], needs_review: [] };
  for (const e of examples) {
    const cat = e.category || "needs_review";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(e);
  }
  const groupLabel = { suspicious: "담합 의심 패턴 후보", normal: "참고 예시", needs_review: "맥락 확인 필요" };
  const cards = Object.keys(groups).map((cat) => `
    <div class="bid-collusion-guide-card bid-collusion-example bid-collusion-example-${cat}">
      <h4 class="bid-collusion-pattern-title">${escapeHtml(groupLabel[cat] || cat)}</h4>
      <ul class="bid-collusion-example-list">
        ${groups[cat].map((e) => `
          <li>
            <code>${escapeHtml(e.text || "")}</code>
            ${e.explanation ? `<div class="bid-collusion-check-hint muted">${escapeHtml(e.explanation)}</div>` : ""}
          </li>
        `).join("")}
      </ul>
    </div>
  `).join("");
  return `<div class="bid-collusion-guide-grid">${cards}</div>`;
}

function renderBidCollusionOfficialLinks(links) {
  if (!Array.isArray(links) || links.length === 0) {
    return `<p class="muted">공식 링크가 없습니다.</p>`;
  }
  return `
    <div class="bid-collusion-guide-grid">
      ${links.map((l) => `
        <div class="bid-collusion-guide-card">
          <a class="bid-collusion-link" href="${escapeAttr(l.url || "")}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label || l.url || "")} ↗</a>
          <p class="bid-collusion-warning">⚠ ${escapeHtml(l.caution || "공식 기준은 변경될 수 있으므로 실전 신고 전 사람이 직접 재확인하세요.")}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderBidCollusionGuide(guide) {
  const root = document.getElementById("bidCollusionGuidePanel");
  if (!root) return;
  if (!guide) {
    root.innerHTML = BID_COLLUSION_GUIDE_FALLBACK_HTML;
    return;
  }
  root.innerHTML = `
    <div class="bid-collusion-guide-intro">
      <h3 class="bid-collusion-section-title">${escapeHtml(guide.displayName || "공정위 담합 신고·포상 가이드")}</h3>
      <p class="muted">${escapeHtml(guide.safetyNotice || "이 가이드는 신고지원용이며, 담합 여부 또는 포상금 지급을 확정하지 않습니다.")}</p>
    </div>

    <h3 class="bid-collusion-section-title">신고처</h3>
    ${renderBidCollusionReportingChannels(guide.reportingChannels)}

    <h3 class="bid-collusion-section-title">담합 의심 패턴</h3>
    <p class="muted">아래 패턴은 담합 단정이 아니라, 사람이 추가 검토할 입찰담합 의심 패턴 후보입니다.</p>
    ${renderBidCollusionPatterns(guide.suspiciousPatterns)}

    <h3 class="bid-collusion-section-title">필요 증거 체크리스트</h3>
    ${renderBidCollusionEvidenceChecklist(guide.evidenceChecklist)}

    <h3 class="bid-collusion-section-title">신고 전 확인사항</h3>
    ${renderBidCollusionPreReportChecklist(guide.preReportChecklist)}

    <h3 class="bid-collusion-section-title">신고포상금 주의사항</h3>
    ${renderBidCollusionRewardCaution(guide.rewardCaution)}

    <h3 class="bid-collusion-section-title">예시 패턴</h3>
    ${renderBidCollusionExamples(guide.examples)}

    <h3 class="bid-collusion-section-title">공식 링크</h3>
    ${renderBidCollusionOfficialLinks(guide.officialLinks)}
  `;
}

// ---------- Subsidy Practical Guide (실전 재점검 09) ----------
const SUBSIDY_GUIDE_FALLBACK_HTML = `
  <div class="subsidy-guide-card subsidy-guide-fallback">
    <p class="muted">보조금/공익신고 보상·포상 가이드를 불러오지 못했습니다. 실전 신고 전 국민권익위원회, 보조금 관리기관, 관할 지자체의 공식 기준을 직접 확인하세요.</p>
  </div>
`;

function bindSubsidyGuide() {
  const btn = document.getElementById("subsidyGuideRefreshBtn");
  if (btn) btn.addEventListener("click", loadSubsidyGuide);
}

async function loadSubsidyGuide() {
  const root = document.getElementById("subsidyGuidePanel");
  if (!root) return;
  try {
    const res = await fetch("/api/modules/subsidy-fraud/guide");
    const data = await res.json();
    if (!data.ok || !data.guide) throw new Error(data.message || "subsidy guide failed");
    renderSubsidyGuide(data.guide);
  } catch (err) {
    root.innerHTML = SUBSIDY_GUIDE_FALLBACK_HTML + `<p class="muted" style="margin-top:8px;font-size:12px;">[debug] ${escapeHtml(err.message)}</p>`;
  }
}

function renderSubsidyReportingChannels(channels) {
  if (!Array.isArray(channels) || channels.length === 0) {
    return `<p class="muted">신고처 정보가 없습니다.</p>`;
  }
  const items = channels.map((c) => `
    <div class="subsidy-guide-card">
      <div class="subsidy-channel-header">
        <h4 class="subsidy-channel-title">${escapeHtml(c.agencyName || "")}</h4>
        ${c.officialUrl ? `<a class="subsidy-link" href="${escapeAttr(c.officialUrl)}" target="_blank" rel="noopener noreferrer">공식 페이지 ↗</a>` : `<span class="badge muted">공식 페이지 직접 확인</span>`}
      </div>
      <p class="subsidy-channel-desc">${escapeHtml(c.description || "")}</p>
      <p class="subsidy-warning">⚠ ${escapeHtml(c.caution || "")}</p>
    </div>
  `).join("");
  return `<div class="subsidy-guide-grid">${items}</div>`;
}

function renderSubsidyPublicDataSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return `<p class="muted">공개자료 소스가 없습니다.</p>`;
  }
  const items = sources.map((s) => `
    <div class="subsidy-guide-card subsidy-source-card">
      <div class="subsidy-channel-header">
        <h4 class="subsidy-channel-title">${escapeHtml(s.name || "")}</h4>
        ${s.officialUrl ? `<a class="subsidy-link" href="${escapeAttr(s.officialUrl)}" target="_blank" rel="noopener noreferrer">공식 페이지 ↗</a>` : `<span class="badge muted">공식 페이지 직접 확인</span>`}
      </div>
      <p class="subsidy-channel-desc"><strong>활용:</strong> ${escapeHtml(s.usage || "")}</p>
      <ul class="subsidy-example-list">
        ${(s.dataTypes || []).map((d) => `<li><code>${escapeHtml(d)}</code></li>`).join("")}
      </ul>
      <p class="subsidy-warning">⚠ ${escapeHtml(s.caution || "")}</p>
    </div>
  `).join("");
  return `<div class="subsidy-guide-grid">${items}</div>`;
}

function renderSubsidySuspiciousSignals(signals) {
  if (!Array.isArray(signals) || signals.length === 0) {
    return `<p class="muted">의심 신호가 없습니다.</p>`;
  }
  const levelLabel = (lv) => lv === "HIGH" ? '<span class="badge danger">HIGH 검토</span>'
    : lv === "MEDIUM" ? '<span class="badge warn">MEDIUM 검토</span>'
    : '<span class="badge muted">LOW 검토</span>';
  const items = signals.map((s) => `
    <div class="subsidy-guide-card">
      <div class="subsidy-signal-header">
        <h4 class="subsidy-signal-title">${escapeHtml(s.category || "")}</h4>
        ${levelLabel(s.reviewLevel || "MEDIUM")}
      </div>
      <ul class="subsidy-example-list">
        ${(s.examples || []).map((ex) => `<li><code>${escapeHtml(ex)}</code></li>`).join("")}
      </ul>
      <p class="subsidy-why">${escapeHtml(s.whyItMatters || "")}</p>
    </div>
  `).join("");
  return `<div class="subsidy-guide-grid">${items}</div>`;
}

function renderSubsidyEvidenceChecklist(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="muted">증거 체크리스트가 없습니다.</p>`;
  }
  return `
    <ul class="subsidy-checklist">
      ${items.map((it) => `
        <li class="${it.required ? "required" : "optional"}">
          <span class="subsidy-check-badge">${it.required ? "필수" : "선택"}</span>
          <div>
            <div class="subsidy-check-label">${escapeHtml(it.label || "")}</div>
            ${it.hint ? `<div class="subsidy-check-hint muted">${escapeHtml(it.hint)}</div>` : ""}
          </div>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderSubsidyPreReportChecklist(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="muted">신고 전 확인사항이 없습니다.</p>`;
  }
  return `
    <ul class="subsidy-checklist">
      ${items.map((it) => `
        <li class="${it.required ? "required" : "optional"}">
          <span class="subsidy-check-badge">${it.required ? "필수" : "선택"}</span>
          <div class="subsidy-check-label">${escapeHtml(it.label || "")}</div>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderSubsidyRewardCaution(caution) {
  if (!caution) return "";
  const notes = (caution.notes || []).map((n) => `<li>${escapeHtml(n)}</li>`).join("");
  return `
    <div class="subsidy-guide-card subsidy-reward-caution">
      <h4 class="subsidy-signal-title">${escapeHtml(caution.title || "보조금·공익신고 보상·포상 기준 안내")}</h4>
      <p>${escapeHtml(caution.summary || "")}</p>
      <ul class="subsidy-example-list">${notes}</ul>
      <p class="subsidy-warning">⚠ 보상금·포상금 수령을 보장하지 않으며, 부정수급 여부 확정은 관계기관 처리 결과에 따라 달라집니다.</p>
    </div>
  `;
}

function renderSubsidyExamples(examples) {
  if (!Array.isArray(examples) || examples.length === 0) {
    return `<p class="muted">예시가 없습니다.</p>`;
  }
  const groups = { suspicious: [], normal: [], needs_review: [] };
  for (const e of examples) {
    const cat = e.category || "needs_review";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(e);
  }
  const groupLabel = { suspicious: "공개자료 기반 검토 후보", normal: "참고 예시", needs_review: "맥락 확인 필요" };
  const cards = Object.keys(groups).map((cat) => `
    <div class="subsidy-guide-card subsidy-example subsidy-example-${cat}">
      <h4 class="subsidy-signal-title">${escapeHtml(groupLabel[cat] || cat)}</h4>
      <ul class="subsidy-example-list">
        ${groups[cat].map((e) => `
          <li>
            <code>${escapeHtml(e.text || "")}</code>
            ${e.explanation ? `<div class="subsidy-check-hint muted">${escapeHtml(e.explanation)}</div>` : ""}
          </li>
        `).join("")}
      </ul>
    </div>
  `).join("");
  return `<div class="subsidy-guide-grid">${cards}</div>`;
}

function renderSubsidyOfficialLinks(links) {
  if (!Array.isArray(links) || links.length === 0) {
    return `<p class="muted">공식 링크가 없습니다.</p>`;
  }
  return `
    <div class="subsidy-guide-grid">
      ${links.map((l) => `
        <div class="subsidy-guide-card">
          <a class="subsidy-link" href="${escapeAttr(l.url || "")}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label || l.url || "")} ↗</a>
          <p class="subsidy-warning">⚠ ${escapeHtml(l.caution || "공식 기준은 변경될 수 있으므로 실전 신고 전 사람이 직접 재확인하세요.")}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSubsidyGuide(guide) {
  const root = document.getElementById("subsidyGuidePanel");
  if (!root) return;
  if (!guide) {
    root.innerHTML = SUBSIDY_GUIDE_FALLBACK_HTML;
    return;
  }
  root.innerHTML = `
    <div class="subsidy-guide-intro">
      <h3 class="subsidy-section-title">${escapeHtml(guide.displayName || "보조금/공익신고 보상·포상 가이드")}</h3>
      <p class="muted">${escapeHtml(guide.safetyNotice || "이 가이드는 신고지원용이며, 부정수급 여부 또는 보상·포상 지급을 확정하지 않습니다.")}</p>
    </div>

    <h3 class="subsidy-section-title">신고처</h3>
    ${renderSubsidyReportingChannels(guide.reportingChannels)}

    <h3 class="subsidy-section-title">공개자료 소스</h3>
    <p class="muted">공익레이더는 아래 공개자료만 활용하며, 로그인 또는 권한이 필요한 비공개 자료는 다루지 않습니다.</p>
    ${renderSubsidyPublicDataSources(guide.publicDataSources)}

    <h3 class="subsidy-section-title">부정수급 의심 신호</h3>
    <p class="muted">아래 신호는 단정이 아니라, 사람이 추가 검토할 공개자료 기반 검토 후보입니다.</p>
    ${renderSubsidySuspiciousSignals(guide.suspiciousSignals)}

    <h3 class="subsidy-section-title">필요 증거 체크리스트</h3>
    ${renderSubsidyEvidenceChecklist(guide.evidenceChecklist)}

    <h3 class="subsidy-section-title">신고 전 확인사항</h3>
    ${renderSubsidyPreReportChecklist(guide.preReportChecklist)}

    <h3 class="subsidy-section-title">보상·포상 주의사항</h3>
    ${renderSubsidyRewardCaution(guide.rewardCaution)}

    <h3 class="subsidy-section-title">예시 패턴</h3>
    ${renderSubsidyExamples(guide.examples)}

    <h3 class="subsidy-section-title">공식 링크</h3>
    ${renderSubsidyOfficialLinks(guide.officialLinks)}
  `;
}

// ---------- 운영 대시보드 (체크리스트 23) ----------
function bindDashboard() {
  const btn = document.getElementById("opsRefreshBtn");
  if (btn) btn.addEventListener("click", loadDashboardSummary);
  // Top candidate 상세 보기
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.matches("[data-dash-open]")) {
      e.preventDefault();
      openQueueDetail(t.getAttribute("data-dash-open"));
    }
  });
}

async function loadDashboardSummary() {
  const root = document.getElementById("opsDashboard");
  const homeRoot = document.getElementById("homeNoticePanel");
  try {
    const res = await fetch("/api/dashboard/summary");
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || "summary failed");
    state.dashboard.summary = data;
    state.dashboard.lastError = null;
    if (root) renderDashboard(root, data);
    renderHomeNotice(data);
    renderNotices(data);
    renderHomeOverview(data);
    renderAppHeaderMeta(data);
  } catch (err) {
    state.dashboard.lastError = err.message;
    if (root) root.innerHTML = `<div class="code">대시보드 데이터를 불러오지 못했습니다: ${escapeHtml(err.message)}</div>`;
    if (homeRoot) homeRoot.innerHTML = `<div class="code">상태 정보를 불러오지 못했습니다: ${escapeHtml(err.message)}</div>`;
    // 공지 카드는 비어도 절대 사라지지 않게 fallback 표시
    renderNotices(null);
    renderHomeOverview(null);
  }
}

function renderDashboard(root, d) {
  const kpis = d.kpis || [];
  const queue = d.queue || { total: 0, counts: {} };
  const top = d.topCandidates || [];
  const modules = d.modules || [];
  const ev = d.evalMetrics || { exists: false };
  const sch = d.scheduler || { enabled: false };
  const dd = d.dedupe || { exists: false };
  const fb = d.feedback || { total: 0, topReasonCategories: [] };

  const kpisHtml = kpis.map((k) => `
    <div class="evi-item ops-kpi ${k.cls ? "kpi-" + k.cls : ""}" title="${escapeAttr(k.hint || "")}">
      <div class="label">${escapeHtml(k.label)}</div>
      <div class="value">${escapeHtml(String(k.value))}</div>
      ${k.hint ? `<div class="muted ops-hint">${escapeHtml(k.hint)}</div>` : ""}
    </div>
  `).join("");

  const QSTATUSES = ["DRAFT","REVIEW","HOLD","APPROVED","REPORT_DRAFT","SUBMITTED","OUTCOME_CHECK","REJECTED"];
  const QLABEL = { DRAFT:"신규", REVIEW:"검토중", HOLD:"보류", APPROVED:"승인", REPORT_DRAFT:"신고초안", SUBMITTED:"제출기록", OUTCOME_CHECK:"결과확인", REJECTED:"폐기" };
  const queueHtml = QSTATUSES.map((s) => `
    <div class="evi-item ops-queue-cell">
      <div class="label">${escapeHtml(QLABEL[s])}</div>
      <div class="value">${queue.counts?.[s] ?? 0}</div>
    </div>
  `).join("");

  const topHtml = top.length
    ? `
      <div class="ops-top-list">
        ${top.map((c, i) => `
          <div class="ops-top-row">
            <div class="ops-top-rank">#${i + 1}</div>
            <div class="ops-top-main">
              <div class="ops-top-title">${escapeHtml(c.title || c.url || c.id)}</div>
              <div class="muted ops-top-meta">
                ${escapeHtml(c.status)} · 점수 ${c.priorityScore} ·
                ${escapeHtml(c.agencyCandidate || "—")} ·
                ${c.hasEvidence ? "증거 ✓" : "증거 —"} · ${c.hasReport ? "신고서 ✓" : "신고서 —"}
              </div>
              <div class="muted ops-top-url">${escapeHtml(c.url || "")}</div>
            </div>
            <div class="ops-top-action">
              <button class="ghost" type="button" data-dash-open="${escapeAttr(c.id)}">상세</button>
            </div>
          </div>
        `).join("")}
      </div>`
    : '<p class="muted">아직 Case가 없습니다.</p>';

  const modulesHtml = modules.length
    ? `
      <table class="ops-modules-table">
        <thead>
          <tr><th>모듈</th><th>상태</th><th>후보</th><th>Case</th><th>신고서 초안</th><th>제출 기록</th></tr>
        </thead>
        <tbody>
          ${modules.map((m) => `
            <tr>
              <td>${escapeHtml(m.name)}</td>
              <td><span class="badge ${m.active ? "ok" : "muted"}">${escapeHtml(m.status)}</span></td>
              <td>${m.candidates}</td>
              <td>${m.cases}</td>
              <td>${m.reportDrafts}</td>
              <td>${m.submittedRecords}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`
    : '<p class="muted">등록된 모듈이 없습니다.</p>';

  const fmtPct = (v) => typeof v === "number" ? (v * 100).toFixed(1) + "%" : "—";
  const fmtScore = (v) => typeof v === "number" ? v.toFixed(3) : "—";
  const evalBars = ev.exists ? `
    <div class="ops-bar-row">
      <span class="label">Precision</span>
      <div class="ops-bar"><div class="ops-bar-fill ok" style="width:${(ev.precision * 100).toFixed(1)}%;"></div></div>
      <span class="value">${fmtScore(ev.precision)}</span>
    </div>
    <div class="ops-bar-row">
      <span class="label">Recall</span>
      <div class="ops-bar"><div class="ops-bar-fill warn" style="width:${(ev.recall * 100).toFixed(1)}%;"></div></div>
      <span class="value">${fmtScore(ev.recall)}</span>
    </div>
    <div class="ops-bar-row">
      <span class="label">F1</span>
      <div class="ops-bar"><div class="ops-bar-fill ok" style="width:${(ev.f1 * 100).toFixed(1)}%;"></div></div>
      <span class="value">${fmtScore(ev.f1)}</span>
    </div>
    <div class="ops-bar-row">
      <span class="label">Accuracy</span>
      <div class="ops-bar"><div class="ops-bar-fill muted" style="width:${(ev.accuracy * 100).toFixed(1)}%;"></div></div>
      <span class="value">${fmtScore(ev.accuracy)}</span>
    </div>
    <p class="muted ops-eval-meta">
      runId <code>${escapeHtml(ev.runId || "")}</code> · ran ${escapeHtml(ev.ranAt || "")} · threshold ${ev.threshold}
      · FP ${ev.confusion?.FP ?? 0} / FN ${ev.confusion?.FN ?? 0}
    </p>
  ` : '<p class="muted">아직 평가 실행 결과가 없습니다.</p>';

  const schRun = sch.latestRun;
  const schHtml = schRun
    ? `<p class="muted">최근 실행: <span class="badge ${schRun.status === "SUCCESS" ? "ok" : (schRun.status === "FAILED" ? "danger" : "muted")}">${escapeHtml(schRun.status)}</span>
       · ${escapeHtml(schRun.startedAt || "")}
       · 수집 ${schRun.totalFound ?? 0} / 저장 ${schRun.totalSaved ?? 0} / 중복제거 ${schRun.duplicatesRemoved ?? 0}</p>`
    : '<p class="muted">아직 스케줄러 실행 기록 없음.</p>';
  const dedupeBar = dd.exists
    ? `<div class="ops-bar-row">
        <span class="label">중복률</span>
        <div class="ops-bar"><div class="ops-bar-fill warn" style="width:${(dd.duplicateRate * 100).toFixed(1)}%;"></div></div>
        <span class="value">${fmtPct(dd.duplicateRate)}</span>
       </div>
       <p class="muted ops-eval-meta">총 ${dd.total} / 유지 ${dd.kept} / 중복 ${dd.duplicates} · ${escapeHtml(dd.generatedAt || "")}</p>`
    : '<p class="muted">아직 Dedupe 리포트가 없습니다.</p>';

  const fbReasons = (fb.topReasonCategories || []).slice(0, 5);
  const fbHtml = `
    <p class="muted">총 ${fb.total} · 오탐 관련 ${fb.falsePositives} · 증거부족 ${fb.evidenceInsufficient} · 중복 ${fb.duplicates}</p>
    <ul class="ops-feedback-reasons">
      ${fbReasons.length ? fbReasons.map((r) => `<li>${escapeHtml(r.code)} · ${r.count}건</li>`).join("") : '<li class="muted">아직 피드백 없음</li>'}
    </ul>
  `;

  root.innerHTML = `
    <p class="muted ops-safety">⚠ ${escapeHtml(d.safetyNotice || "")}</p>
    <p class="muted ops-generated">generatedAt ${escapeHtml(d.generatedAt || "")} · today ${escapeHtml(d.today?.date || "")}</p>

    <h4 class="ops-section-title">KPI</h4>
    <div class="ops-kpi-grid">${kpisHtml}</div>

    <h4 class="ops-section-title">Review Queue 상태</h4>
    <div class="ops-queue-grid">${queueHtml}</div>

    <h4 class="ops-section-title">후보 TOP ${top.length}</h4>
    ${topHtml}

    <h4 class="ops-section-title">모듈별 성과</h4>
    <div class="ops-table-wrap">${modulesHtml}</div>

    <h4 class="ops-section-title">품질 지표 (Eval)</h4>
    ${evalBars}

    <div class="ops-twocol">
      <div>
        <h4 class="ops-section-title">스케줄러</h4>
        ${schHtml}
        <h4 class="ops-section-title">중복 제거</h4>
        ${dedupeBar}
      </div>
      <div>
        <h4 class="ops-section-title">피드백 요약</h4>
        ${fbHtml}
      </div>
    </div>
  `;
}

// ---------- Eval Dashboard (체크리스트 22) ----------
function bindEval() {
  const runBtn = document.getElementById("evalRunBtn");
  const refreshBtn = document.getElementById("evalRefreshBtn");
  const fpFnBtn = document.getElementById("evalFpFnBtn");
  if (runBtn) runBtn.addEventListener("click", onEvalRun);
  if (refreshBtn) refreshBtn.addEventListener("click", loadEvalLatest);
  if (fpFnBtn) fpFnBtn.addEventListener("click", onEvalShowFpFn);
}

async function loadEvalSets() {
  try {
    const res = await fetch("/api/eval/sets");
    const data = await res.json();
    if (!data.ok) return;
    state.eval.sets = data.sets || [];
    state.eval.selectedSetId = data.defaultEvalSetId || (state.eval.sets[0] && state.eval.sets[0].evalSetId) || null;
    state.eval.threshold = data.defaultThreshold ?? 60;
    const sel = document.getElementById("evalSetSelect");
    if (sel) {
      sel.innerHTML = state.eval.sets.map((s) =>
        `<option value="${escapeAttr(s.evalSetId)}" ${s.evalSetId === state.eval.selectedSetId ? "selected" : ""}>${escapeHtml(s.name)} (${s.total})</option>`
      ).join("");
    }
    const thInput = document.getElementById("evalThreshold");
    if (thInput) thInput.value = state.eval.threshold;
  } catch (err) {
    console.warn("loadEvalSets failed", err);
  }
}

async function loadEvalLatest() {
  const root = document.getElementById("evalDashboard");
  if (!root) return;
  try {
    const res = await fetch("/api/eval/latest");
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || "latest failed");
    state.eval.latest = data.latest;
    if (data.latest && data.latest.runId) state.eval.lastRunId = data.latest.runId;
    renderEvalDashboard(root);
  } catch (err) {
    root.innerHTML = `<div class="code">${escapeHtml(err.message)}</div>`;
  }
}

function renderEvalDashboard(root) {
  const r = state.eval.latest;
  if (!r) {
    root.innerHTML = `<p class="muted">아직 평가 실행 결과가 없습니다. 위에서 "평가 실행"을 눌러 첫 결과를 만들어 보세요.</p>`;
    return;
  }
  const m = r.metrics || {};
  const cm = m.confusion || { TP: 0, FP: 0, TN: 0, FN: 0 };
  const cards = [
    { label: "Precision", value: (m.precision ?? 0).toFixed(3), cls: "ok" },
    { label: "Recall", value: (m.recall ?? 0).toFixed(3), cls: "ok" },
    { label: "F1", value: (m.f1 ?? 0).toFixed(3), cls: "ok" },
    { label: "Accuracy", value: (m.accuracy ?? 0).toFixed(3), cls: "ok" },
    { label: "TP", value: cm.TP, cls: "ok" },
    { label: "FP", value: cm.FP, cls: "warn" },
    { label: "TN", value: cm.TN, cls: "muted" },
    { label: "FN", value: cm.FN, cls: "danger" }
  ];
  const cardsHtml = cards.map((c) => `
    <div class="evi-item" style="text-align:center;padding:8px 10px;">
      <div class="label" style="font-size:11px;">${escapeHtml(c.label)}</div>
      <div class="value" style="font-size:18px;">${escapeHtml(String(c.value))}</div>
    </div>
  `).join("");

  root.innerHTML = `
    <p class="muted" style="font-size:12px;margin-bottom:6px;">⚠ ${escapeHtml(r.safetyNotice || "평가셋은 내부 품질 측정용입니다.")}</p>
    <p class="muted" style="margin-bottom:6px;">
      평가셋: <strong>${escapeHtml(r.evalSetId)}</strong> ·
      샘플 ${m.total ?? 0}건 (P ${m.positive ?? 0}/N ${m.negative ?? 0}) ·
      threshold ${m.threshold ?? r.threshold} ·
      ran ${escapeHtml(r.ranAt || "")} ·
      runId <code>${escapeHtml(r.runId)}</code>
    </p>
    <div class="evidence-grid" style="grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));">${cardsHtml}</div>
  `;
}

async function onEvalRun(e) {
  e?.preventDefault?.();
  const root = document.getElementById("evalDashboard");
  if (!root) return;
  const setSel = document.getElementById("evalSetSelect");
  const thInput = document.getElementById("evalThreshold");
  const evalSetId = setSel ? setSel.value : state.eval.selectedSetId;
  const threshold = thInput ? Number(thInput.value) : state.eval.threshold;
  root.innerHTML = '<p class="muted">평가 실행 중... (LLM 미호출, Rule + Score 기반)</p>';
  try {
    const res = await fetch("/api/eval/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ evalSetId, threshold, useLlm: false })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    state.eval.latest = data.run;
    state.eval.lastRunId = data.run?.runId || null;
    renderEvalDashboard(root);
  } catch (err) {
    root.innerHTML = `<div class="code">평가 실행 실패: ${escapeHtml(err.message)}</div>`;
  }
}

function onEvalShowFpFn() {
  const root = document.getElementById("evalFpFn");
  const r = state.eval.latest;
  if (!root) return;
  if (!r) { root.innerHTML = '<p class="muted">먼저 평가를 실행하거나 최신 결과를 불러오세요.</p>'; return; }
  const fps = (r.falsePositives || []).slice(0, 10);
  const fns = (r.falseNegatives || []).slice(0, 10);
  const renderItem = (s) => `
    <li>
      <code>${escapeHtml(s.sampleId)}</code> · 점수 ${s.priorityScore} · 카테고리 ${escapeHtml(s.category)} ·
      매치 ${s.matchCount} (${(s.matchedKeywords || []).slice(0, 4).map(escapeHtml).join(", ") || "—"})
      <div class="muted" style="font-size:12px;">${escapeHtml((s.text || "").slice(0, 120))}${(s.text || "").length > 120 ? "..." : ""}</div>
    </li>`;
  const fpHtml = fps.length ? fps.map(renderItem).join("") : '<li class="muted">FP 없음</li>';
  const fnHtml = fns.length ? fns.map(renderItem).join("") : '<li class="muted">FN 없음</li>';
  const fcs = (r.feedbackCandidates || []).slice(0, 6).map((c) =>
    `<li><code>${escapeHtml(c.sampleId)}</code> · ${escapeHtml((c.feedbackReasonCategories || []).join(", "))}<br/><span class="muted" style="font-size:12px;">${escapeHtml(c.suggestedImprovement)}</span></li>`
  ).join("");
  root.innerHTML = `
    <h4 style="margin:8px 0 4px;">False Positives (오탐, 상위 ${fps.length}개)</h4>
    <ul style="font-size:13px;">${fpHtml}</ul>
    <h4 style="margin:8px 0 4px;">False Negatives (미탐, 상위 ${fns.length}개)</h4>
    <ul style="font-size:13px;">${fnHtml}</ul>
    <h4 style="margin:8px 0 4px;">개선 후보 (사람 검토용)</h4>
    <ul style="font-size:13px;">${fcs || '<li class="muted">개선 후보 없음</li>'}</ul>
    <p class="muted" style="font-size:12px;">⚠ 개선 후보는 자동으로 Feedback DB에 저장되지 않습니다. 사람이 검토한 뒤 Feedback DB에 반영해야 합니다.</p>
  `;
}

// ---------- Modal ----------
function bindModal() {
  const backdrop = document.getElementById("modal");
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop || e.target.dataset.close === "1") {
      backdrop.classList.remove("open");
    }
  });
}
function openModal(title, message) {
  const backdrop = document.getElementById("modal");
  backdrop.querySelector(".modal h3").textContent = title;
  backdrop.querySelector(".modal p").textContent = message;
  backdrop.classList.add("open");
}

// ---------- Utils ----------
// 깨진 한글 (U+FFFD REPLACEMENT CHARACTER) 을 화면에 직접 노출하지 않기 위한 헬퍼.
// data 산출물이 cp949→utf8 잘못 변환되어 baked-in 된 경우, 텍스트를 fallback 으로 대체한다.
// 소스 파일에는 의도치 않은 U+FFFD가 섞이지 않도록 escape sequence 만 사용한다.
const MOJIBAKE_REPLACEMENT_CHAR = String.fromCharCode(0xFFFD);
const MOJIBAKE_FALLBACK = "[원문 손상 — 데이터 재생성 필요]";
function hasMojibake(str) {
  if (str == null) return false;
  const s = typeof str === "string" ? str : String(str);
  return s.indexOf(MOJIBAKE_REPLACEMENT_CHAR) !== -1;
}
function safeDisplayText(str, fallback) {
  if (str == null) return "";
  const s = typeof str === "string" ? str : String(str);
  if (hasMojibake(s)) return fallback == null ? MOJIBAKE_FALLBACK : fallback;
  return s;
}
function escapeHtml(str) {
  const safe = safeDisplayText(str);
  return safe.replace(/[&<>'"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}
