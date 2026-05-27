// 일일 운영 루틴 (체크리스트 70).
//
// 하루 단위로 반복 가능한 10단계 운영 루틴을 정의하고, 각 단계의 수동 체크 상태를 저장한다.
// 실제 외부 신고 자동 제출은 구현하지 않는다. 산출물은 data/operations/ (gitignore).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface DailyRoutineStep {
  stepId: number;
  title: string;
  hint: string;
}

/** 10단계 일일 루틴 정의(고정). */
export const DAILY_ROUTINE_STEPS: DailyRoutineStep[] = [
  { stepId: 1, title: "오늘 후보 10건 수집", hint: "공개자료 기준으로만 수집합니다." },
  { stepId: 2, title: "상위 5건 분석", hint: "룰/점수/설명형 분석으로 우선순위를 봅니다." },
  { stepId: 3, title: "상위 2건 증거 패키지 생성", hint: "공개 URL·캡처·수집일시를 정리합니다." },
  { stepId: 4, title: "1건 신고서 초안 생성", hint: "사실점검 11항목 통과 후보만 가능합니다." },
  { stepId: 5, title: "사람 검토", hint: "근거·개인정보·표현을 직접 확인합니다." },
  { stepId: 6, title: "공식 신고처 링크 확인", hint: "단순 외부 링크만 확인합니다." },
  { stepId: 7, title: "사용자가 직접 신고 여부 결정", hint: "자동 신고는 하지 않습니다." },
  { stepId: 8, title: "수동 제출 시 접수번호 기록", hint: "직접 제출 후 접수번호를 남깁니다." },
  { stepId: 9, title: "처리결과/피드백 기록", hint: "처리상태·반려·오탐 등을 기록합니다." },
  { stepId: 10, title: "다음 개선 후보 확인", hint: "피드백 개선 후보를 살펴봅니다." }
];

export const DAILY_ROUTINE_NOTES = [
  "처음에는 하루 1건만 완주해도 충분합니다.",
  "수집보다 검토 품질이 중요합니다.",
  "자동신고는 하지 않습니다."
];

export interface DailyRoutineStepState {
  stepId: number;
  done: boolean;
  note?: string;
}

export interface DailyRoutineState {
  date: string;
  steps: DailyRoutineStepState[];
  updatedAt: string;
}

const DEFAULT_DIR = "data/operations";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function statePath(baseDir: string, date: string): string {
  return path.join(baseDir, `routine-${date}.json`);
}

function emptyState(date: string): DailyRoutineState {
  return {
    date,
    steps: DAILY_ROUTINE_STEPS.map((s) => ({ stepId: s.stepId, done: false })),
    updatedAt: new Date().toISOString()
  };
}

export async function getDailyRoutineState(
  date: string = todayStr(),
  baseDir: string = DEFAULT_DIR
): Promise<DailyRoutineState> {
  if (!isValidDate(date)) return emptyState(todayStr());
  try {
    const raw = await readFile(statePath(baseDir, date), "utf8");
    const parsed = JSON.parse(raw) as DailyRoutineState;
    // 정의된 10단계로 정규화(누락 단계 보강).
    const byId = new Map(parsed.steps?.map((s) => [s.stepId, s]) ?? []);
    return {
      date,
      steps: DAILY_ROUTINE_STEPS.map((s) => ({
        stepId: s.stepId,
        done: Boolean(byId.get(s.stepId)?.done),
        note: byId.get(s.stepId)?.note
      })),
      updatedAt: parsed.updatedAt ?? new Date().toISOString()
    };
  } catch {
    return emptyState(date);
  }
}

export async function setDailyRoutineStep(
  stepId: number,
  done: boolean,
  options: { date?: string; note?: string; baseDir?: string } = {}
): Promise<DailyRoutineState> {
  const date = options.date && isValidDate(options.date) ? options.date : todayStr();
  const baseDir = options.baseDir ?? DEFAULT_DIR;
  if (!DAILY_ROUTINE_STEPS.some((s) => s.stepId === stepId)) {
    throw new Error(`유효하지 않은 stepId: ${stepId}`);
  }
  const state = await getDailyRoutineState(date, baseDir);
  state.steps = state.steps.map((s) =>
    s.stepId === stepId ? { stepId, done, note: options.note ?? s.note } : s
  );
  state.updatedAt = new Date().toISOString();
  await mkdir(path.resolve(baseDir), { recursive: true });
  await writeFile(statePath(baseDir, date), JSON.stringify(state, null, 2), "utf8");
  return state;
}

export function getDailyRoutineDefinition() {
  return { steps: DAILY_ROUTINE_STEPS, notes: DAILY_ROUTINE_NOTES };
}
