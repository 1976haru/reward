// Reward Agent MVP — Frontend
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
  }
};

const LS_KEYS = { queueTab: "rewardAgent.queueTab", queueSort: "rewardAgent.queueSort" };
function readLS(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writeLS(key, val) { try { localStorage.setItem(key, val); } catch { /* ignore */ } }

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", async () => {
  await loadModuleRegistry();
  renderModules();
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
  bindDashboard();
  await loadTopics();
  await loadCandidates();
  await loadQueue();
  await loadSchedulerStatus();
  await loadFeedbackMeta();
  await loadFeedbackStats();
  await loadEvalSets();
  await loadEvalLatest();
  await loadDashboardSummary();
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

// /api/modules에서 받은 ModuleDefinition을 UI MODULES 형태로 변환
function toUiModule(m) {
  // "active" = 풀 파이프라인 / "ready" = 최소 룰·스카웃·리포트 연결 (counterfeit_goods)
  // 둘 다 UI에서 선택 가능으로 처리한다.
  return {
    id: m.id,
    name: m.name,
    available: m.status === "active" || m.status === "ready",
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
    MODULES.splice(0, MODULES.length, ...mapped);
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
    const statusBadge = m.available
      ? '<span class="badge ok">사용 가능</span>'
      : '<span class="badge muted">준비 중</span>';
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

  result.innerHTML = `
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

    ${renderScoringPanel(c.scoringResult)}

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

function renderScoringPanel(s) {
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

  return `
    <div class="result-section">
      <h4>AI 문맥 판단 (Analyzer Agent)</h4>
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
  const top = matches.slice(0, 15);
  const matchCards = top.length
    ? top.map((m) => `
      <div class="evi-item" style="border-left:4px solid ${m.riskLevel === "HIGH" ? "#b91c1c" : m.riskLevel === "MEDIUM" ? "#b45309" : "#6b7280"};">
        <div class="label">
          <span class="badge ${riskBadgeClass(m.riskLevel)}">${escapeHtml(m.riskLevel)}</span>
          <span style="margin-left:6px;">${escapeHtml(m.keyword)}</span>
          <span class="muted" style="margin-left:6px;">(${escapeHtml(m.category)} · ${escapeHtml(m.sourceSection || "main")})</span>
        </div>
        <div class="value" style="font-weight:500;">${escapeHtml(m.sentence)}</div>
        <div class="muted" style="margin-top:4px;font-size:12px;">${escapeHtml(m.reason)}</div>
      </div>
    `).join("")
    : '<p class="muted">매치된 룰이 없습니다.</p>';

  const highlightChips = segments.slice(0, 10).map((s) => `
    <div class="evi-item" style="background:#fff7ed;border-color:#fed7aa;">
      <div class="label"><span class="badge ${riskBadgeClass(s.riskLevel)}">${escapeHtml(s.riskLevel)}</span> <span class="muted">${escapeHtml(s.sourceSection || "main")}</span></div>
      <div class="value">${escapeHtml(s.sentence)}</div>
      <div class="muted" style="margin-top:4px;font-size:12px;">키워드: ${(s.keywords || []).map(escapeHtml).join(" · ")}</div>
    </div>
  `).join("");

  return `
    <div class="result-section">
      <h4>위반 의심 문구 탐지 (Rule Agent)</h4>
      <p class="muted">위험도 점수 ${rd.riskScore || 0}/100 · 등급 ${escapeHtml(rd.riskLevel || "")} · HIGH ${counts.HIGH} / MEDIUM ${counts.MEDIUM} / LOW ${counts.LOW} / 조합 ${counts.combo} (총 ${counts.total}건)</p>
      <p class="muted" style="margin:4px 0 8px;">${escapeHtml(rd.safetyNotice || "이 결과는 법 위반 확정이 아니라 신고 후보 검토용입니다.")}</p>
      <h4 style="margin:10px 0 6px;">매치된 룰</h4>
      <div class="evidence-grid">${matchCards}</div>
      ${segments.length ? `
        <h4 style="margin:14px 0 6px;">하이라이트 문장</h4>
        <div class="evidence-grid">${highlightChips}</div>
      ` : ""}
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
    <p class="muted" style="font-size:12px;margin:4px 0;">아래 링크는 단순 외부 링크입니다. 시스템은 자동 입력·자동 로그인·자동 제출을 수행하지 않습니다. 사용자가 공식 양식에 따라 직접 제출해야 합니다.</p>

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
    if (!data.ok || !Array.isArray(data.officialLinks)) {
      root.textContent = "공식 링크를 불러오지 못했습니다.";
      return;
    }
    if (data.officialLinks.length === 0) {
      root.textContent = "공식 링크 데이터가 등록되어 있지 않습니다.";
      return;
    }
    root.innerHTML = data.officialLinks.map((l) => `
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
    candidateList.innerHTML = `<div class="code">${escapeHtml(err.message)}</div>`;
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
  if (!root) return;
  try {
    const res = await fetch("/api/dashboard/summary");
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || "summary failed");
    state.dashboard.summary = data;
    state.dashboard.lastError = null;
    renderDashboard(root, data);
  } catch (err) {
    state.dashboard.lastError = err.message;
    root.innerHTML = `<div class="code">대시보드 데이터를 불러오지 못했습니다: ${escapeHtml(err.message)}</div>`;
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
function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>'"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}
