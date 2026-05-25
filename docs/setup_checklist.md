# Setup Checklist

처음 이 프로젝트를 받아 실행할 때 위에서 아래로 따라가며 체크하세요. (Windows PowerShell 기준)

## 1. 사전 환경

- [ ] Node.js 18 이상 설치 — `node -v`
- [ ] npm 9 이상 — `npm -v`
- [ ] git 설치 — `git --version`

## 2. 저장소

- [ ] `git clone https://github.com/1976haru/reward.git`
- [ ] `cd reward`

## 3. 의존성 설치

- [ ] `npm install` 성공 (warning은 무시 가능, error만 확인)

## 4. 환경 변수

- [ ] `Copy-Item .env.example .env`
- [ ] `.env` 파일을 열어 `PORT=3001` 확인
- [ ] `MOCK_AI=true` 유지 (OpenAI 키 없이도 시연 가능)
- [ ] `EVIDENCE_ENABLE_SCREENSHOT=false`, `EVIDENCE_ENABLE_PDF=false` 유지 (최소 실행 기본값)
- [ ] 실제 모델을 쓸 때만 `MOCK_AI=false` + `OPENAI_API_KEY` 입력
- [ ] `.env`가 `.gitignore`에 포함되어 있는지 확인 (`git check-ignore .env`)

## 5. Playwright 캡처 준비

- [ ] 캡처를 사용할 PC에서 최초 1회 `npm run playwright:install` 실행
- [ ] 기본 실행에서는 `.env`의 `EVIDENCE_ENABLE_SCREENSHOT=false`, `EVIDENCE_ENABLE_PDF=false` 유지
- [ ] 캡처 확인 시에만 두 값을 `true`로 설정하고 로그인 없는 공개 테스트 URL 1개를 수동 확인
- [ ] `data/evidence/{caseId}/` 산출물이 `git status --ignored`에서 ignored 상태인지 확인

## 6. 빌드 및 테스트

- [ ] `npm run build` 성공 — `dist/` 폴더 생성
- [ ] `npm run test` 성공 — `SMOKE_TEST_OK` 출력
- [ ] (선택) `npm run check` 성공 — build + test 일괄

## 7. 개발 서버

- [ ] `npm run dev` 실행
- [ ] 콘솔에 `Reward Agent MVP running at http://localhost:3001` 출력
- [ ] 브라우저로 `http://localhost:3001` 접속 — 히어로/모듈 카드/프로세스 바 정상 표시
- [ ] `curl http://localhost:3001/api/health` 응답 확인
  ```json
  {
    "ok": true,
    "service": "reward-agent-mvp",
    "module": "false_ad",
    "category": "health_functional_food",
    "environment": "development",
    "port": 3001,
    "mockAi": true,
    "timestamp": "..."
  }
  ```
- [ ] `curl http://localhost:3001/api/cases` 응답이 `[]` (빈 배열) 또는 기존 케이스 목록

## 8. 분석 동작 확인

- [ ] UI에서 공개 URL을 입력하고 "수집·탐지·증거화 시작" 클릭
- [ ] 프로세스 바가 단계별로 진행되고 완료 시 done 상태로 변함
- [ ] 분석 결과 카드에 위험도/등급/AI 요약/탐지 문구가 표시됨
- [ ] 증거 패키지 카드에 원본 URL/수집일시/캡처/PDF/텍스트/신고서 초안 표시
- [ ] `data/cases/{id}.json`, `data/evidence/{id}/*`, `data/reports/{id}.md` 파일이 생성됨

## 9. 안전 점검

- [ ] UI에 "자동 신고 없음 · 사람 검토 필수 · 공개자료만 분석" 배너가 보이는지 확인
- [ ] 결과 카드에 "포상금 가능성 확인 필요" 문구가 보이는지 확인
- [ ] `data/cases/*.json` 같은 분석 결과 파일이 git에 staged 되지 않는지 (`git status`)
- [ ] `.env`가 staged 되지 않는지 (`git status`)

## 10. GitHub Push

- [ ] `git status` — staged 목록에 `.env`, `node_modules/`, `dist/`, `data/cases/*.json`, `data/evidence/*`, `data/reports/*` 가 **포함되어 있지 않은지** 확인
- [ ] `git add .`
- [ ] `git commit -m "<설명>"`
- [ ] `git push`

문제가 생기면 [`README.md`의 Troubleshooting 표](../README.md#troubleshooting)를 먼저 확인하세요.
