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

// 신 enum (DRAFT/REVIEW/...)과 레거시 enum 모두 처리한다.
const STATUS_LABEL = {
  DRAFT: "Draft",
  REVIEW: "Review",
  APPROVED: "Approved",
  SUBMITTED: "Submitted",
  REJECTED: "Rejected",
  // 레거시
  draft: "Draft",
  needs_review: "Review",
  ready_to_report: "Approved",
  reported: "Submitted",
  rejected: "Rejected",
  archived: "Rejected"
};

const STATUS_BADGE = {
  DRAFT: "muted",
  REVIEW: "warn",
  APPROVED: "ok",
  SUBMITTED: "ok",
  REJECTED: "danger",
  // 레거시
  draft: "muted",
  needs_review: "warn",
  ready_to_report: "ok",
  reported: "ok",
  rejected: "danger",
  archived: "muted"
};

const state = {
  selectedModuleId: "false_ad",
  cases: [],
  topics: [],
  selectedTopicIds: new Set(),
  candidates: []
};

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", async () => {
  await loadModuleRegistry();
  renderModules();
  renderGuide();
  renderProcess("pending");
  bindForm();
  bindModal();
  bindDiscovery();
  await loadTopics();
  await loadCandidates();
  loadCases();
});

// /api/modules에서 받은 ModuleDefinition을 UI MODULES 형태로 변환
function toUiModule(m) {
  return {
    id: m.id,
    name: m.name,
    available: m.status === "active",
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
      await loadCases();
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

  const reportUrl = c.reportPath ? `/data/reports/${c.id}.md` : "#";

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

    <div class="result-section">
      <h4>탐지된 의심 문구</h4>
      <ul>${hitsHtml}</ul>
    </div>

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
      <a href="${reportUrl}" target="_blank" rel="noreferrer">신고서 초안/증거 요약 열기 →</a>
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
  const evidenceListLink = c.id
    ? `<p class="muted" style="margin-top:8px;">
         증거 파일 목록(JSON): <a href="/api/cases/${escapeAttr(c.id)}/evidence" target="_blank" rel="noreferrer">/api/cases/${escapeHtml(c.id)}/evidence</a>
         · manifest: <a href="/api/cases/${escapeAttr(c.id)}/evidence/manifest.json" target="_blank" rel="noreferrer">manifest.json</a>
       </p>`
    : "";
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
    ${evidenceListLink}
  `;
}

// ---------- Recent cases ----------
async function loadCases() {
  const root = document.getElementById("caseList");
  try {
    const res = await fetch("/api/cases");
    const payload = await res.json();
    // 신 API는 {ok, cases, page}, 레거시는 RewardCase[] — 둘 다 처리
    const cases = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.cases) ? payload.cases : []);
    state.cases = cases;
    if (!cases.length) {
      root.innerHTML = '<p class="muted">저장된 케이스가 없습니다. 위에서 URL을 입력해 첫 분석을 실행해 보세요.</p>';
      return;
    }
    root.innerHTML = cases.slice(0, 10).map((c) => {
      const mod = MODULES.find((m) => m.id === c.moduleId);
      const grade = gradeFromScore(c.riskScore ?? c.score);
      const statusKey = c.status || "DRAFT";
      return `
        <div class="case">
          <div>
            <div class="title">${escapeHtml(c.title || c.url)}</div>
            <div class="meta">
              ${escapeHtml(mod ? mod.name : c.moduleId)} ·
              신고처: ${escapeHtml(c.aiFinding && c.aiFinding.recommendedAgency || (mod && mod.agency) || "—")} ·
              ${escapeHtml(c.createdAt)}
            </div>
          </div>
          <div class="badges">
            <span class="badge ${grade.cls.replace("grade-", "")}">위험도 ${c.riskScore ?? c.score ?? 0}</span>
            <span class="badge ${STATUS_BADGE[statusKey] || "muted"}">${escapeHtml(STATUS_LABEL[statusKey] || statusKey)}</span>
            <button class="ghost" data-id="${escapeAttr(c.id)}">상세보기</button>
          </div>
        </div>
      `;
    }).join("");

    root.querySelectorAll("button.ghost[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => showCaseDetail(btn.getAttribute("data-id")));
    });
  } catch (err) {
    root.innerHTML = `<div class="code">${escapeHtml(err.message)}</div>`;
  }
}

function showCaseDetail(id) {
  const c = state.cases.find((x) => x.id === id);
  if (!c) return;
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
    banner.textContent = `발굴 모드: ${data.discoveryMode} · 신규 추가 ${data.added}건 (기존 후보와 중복 제외). 본문 분석과 사람 검토가 필요합니다.`;
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
          </div>
        </div>
      `;
    }).join("");
    root.querySelectorAll("button[data-analyze]").forEach((btn) => {
      btn.addEventListener("click", () => analyzeCandidate(btn.getAttribute("data-analyze"), btn));
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
