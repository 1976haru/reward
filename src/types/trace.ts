// Trace Log (체크리스트 27)
//
// 본 trace 시스템은 내부 감사·디버깅·품질개선 목적이다.
// 법적 판단 확정 근거가 아니다.
// API 키, 개인정보, 민감정보, 전체 HTML, 증거파일 내용, 외부 신고기관 로그인 정보는 저장하지 않는다.
// 전체 prompt 저장은 기본 비활성 (TRACE_STORE_FULL_PROMPT=false).

export const TRACE_EVENT_TYPES = [
  "agent_start",
  "agent_end",
  "agent_error",
  "tool_call",
  "service_call",
  "llm_prompt",
  "llm_output",
  "guardrail",
  "human_action",
  "state_change",
  "http_request",
  "http_response"
] as const;
export type TraceEventType = typeof TRACE_EVENT_TYPES[number];

export const TRACE_SEVERITIES = ["debug", "info", "warn", "error"] as const;
export type TraceSeverity = typeof TRACE_SEVERITIES[number];

export interface TraceContextFields {
  traceId: string;             // 요청/체인 단위
  runId?: string;              // batch / scheduler run 등
  caseId?: string;
  candidateId?: string;
  moduleId?: string;
  agentName?: string;
}

export interface TraceEvent extends TraceContextFields {
  schemaVersion: "1.0.0";
  id: string;                  // 이벤트 자체 id
  ts: string;                  // ISO timestamp
  eventType: TraceEventType;
  severity: TraceSeverity;
  message?: string;
  // 요약된 입력/출력 (마스킹/트렁케이트 적용)
  inputSummary?: unknown;
  outputSummary?: unknown;
  // 메타 (실행 시간, 호출 대상, 결과 코드 등)
  meta?: Record<string, unknown>;
  durationMs?: number;
  // 어떤 사용자가 한 액션인지 (human_action 일 때만)
  actor?: string;
  // 자동 마스킹 발생 여부
  sensitiveMasked?: boolean;
  // 안전 고지 — trace 가 판단 확정 근거가 아님을 응답에서 명시
  safetyNotice?: string;
}

export interface TraceListQuery {
  traceId?: string;
  runId?: string;
  caseId?: string;
  candidateId?: string;
  moduleId?: string;
  agentName?: string;
  eventType?: TraceEventType;
  severity?: TraceSeverity;
  limit?: number;
  // 날짜 범위 (yyyy-mm-dd). 둘 다 없으면 오늘.
  from?: string;
  to?: string;
}

export interface TraceSummary {
  total: number;
  byAgent: Record<string, number>;
  byEventType: Record<string, number>;
  bySeverity: Record<string, number>;
  byModule: Record<string, number>;
  // 최근 에러 5건
  recentErrors: TraceEvent[];
  // 안전 고지
  safetyNotice: string;
}

export const TRACE_SAFETY_NOTICE =
  "Trace Log 는 내부 디버깅·감사용 기록입니다. 개인정보·API 키·전체 prompt 는 저장하지 않으며, 마스킹 정책이 적용됩니다. 본 기록은 법적 판단 확정 근거가 아닙니다.";
