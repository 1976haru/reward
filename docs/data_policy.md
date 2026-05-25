# 로컬 데이터와 Git 제외 정책

공익레이더의 실행 결과는 GitHub에 올리는 소스 코드가 아니라 **로컬 산출물**이다. 증거 파일이나 신고 기록에는 민감한 내용이 포함될 수 있으므로 저장소에 커밋하지 않는다.

## GitHub에 올리지 않는 항목

| 경로 | 내용 | 이유 |
|---|---|---|
| `.env` | API 키·실행 환경값이 들어갈 수 있는 파일 | 비밀값 노출 방지 |
| `data/evidence/` | HTML, 텍스트, 스크린샷, PDF 증거 | 민감한 신고 자료 포함 가능 |
| `data/reports/` | 신고서 초안 | 신고 내용 포함 가능 |
| `data/cases/` | 사례 상태·검토 기록 | 신고 관련 기록 포함 가능 |
| `data/raw/` | 수집 원본 | 원문·민감자료 포함 가능 |
| `data/collector/` | 수집기 실행 산출물 | 원문·로그 포함 가능 |
| `data/baseline/` | 데이터 기준선 실행 결과 | 분석 대상 자료 포함 가능 |
| `data/risk/` | 위험도 분석 결과 | 후보 평가 내용 포함 가능 |
| `data/traces/`, `data/feedback/`, `data/outcomes/` | 실행 로그·검토 피드백·접수번호/처리결과 기록 | 운영·신고 정보 포함 가능 |
| `data/eval/runs/` | 평가 실행 결과 | 실행 산출물 |
| `dist/`, `node_modules/` | 빌드/의존성 산출물 | 재생성 가능, 저장 불필요 |

폴더 구조를 유지하기 위한 `.gitkeep` 파일만 추적할 수 있다. `data/collector/sample/`의 합성 예제 자료는 개발용으로 명시적으로 허용된 자료이며, 실제 수집 결과를 넣지 않는다.

## 확인 방법

실행 전후에 다음 명령으로 ignored 상태를 확인한다.

```powershell
git status --ignored
git check-ignore -v .env
git check-ignore -v --no-index data/evidence/__policy_check__.tmp
git check-ignore -v --no-index data/reports/__policy_check__.tmp
git check-ignore -v --no-index data/cases/__policy_check__.tmp
git check-ignore -v --no-index data/raw/__policy_check__.tmp
git check-ignore -v --no-index data/collector/__policy_check__.tmp
git check-ignore -v --no-index data/baseline/__policy_check__.tmp
git check-ignore -v --no-index data/risk/__policy_check__.tmp
git check-ignore -v --no-index data/traces/__policy_check__.tmp
git check-ignore -v --no-index data/feedback/__policy_check__.tmp
git check-ignore -v --no-index data/outcomes/__policy_check__.tmp
git check-ignore -v --no-index data/eval/runs/__policy_check__.tmp
git check-ignore -v --no-index dist/__policy_check__.js
git check-ignore -v --no-index node_modules/__policy_check__.js
```

`data/evidence` 같은 폴더 자체에는 추적 대상인 `.gitkeep`이 있으므로, 폴더 내부의 가상 산출물 경로로 규칙을 확인한다. 위 명령은 실제 샘플 파일을 만들지 않는다.

## 커밋 전 실수 대응

`git status`의 staged 목록에 `.env` 또는 `data/*` 산출물이 보이면 커밋하지 않는다. 해당 파일은 Git stage에서 먼저 제거하고, `.gitignore` 규칙이 누락되었는지 확인한다. 이미 민감한 파일이 원격에 올라간 경우에는 단순 삭제 커밋만으로 비밀값이 보호되지 않으므로, 키 폐기·재발급과 히스토리 처리 계획을 별도로 세운다.

## Playwright 증거 파일

Playwright 캡처를 사용하면 스크린샷과 PDF는 `data/evidence/{caseId}/` 아래에 저장된다. 해당 폴더의 산출물은 로컬 확인에만 사용하고 GitHub에는 올리지 않는다.
