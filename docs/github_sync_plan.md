# GitHub 저장소 동기화 기준

> 확인일: 2026-05-26
> 이번 단계 원칙: 원격 변경·저장소 이전·force push 없이 현재 상태와 안전한 절차만 기록한다.

## 현재 기준 저장소

| 항목 | 현재 확인값 |
|---|---|
| 로컬 프로젝트 | `reward-agent-mvp` |
| 현재 기준 GitHub 저장소 | `1976haru/reward` |
| 현재 브랜치 | `master` |
| 현재 원격 이름 | `origin` |
| 현재 원격 URL | `https://github.com/1976haru/reward` |
| 원격 기본 브랜치 | `master` |
| 비교 대상 public 저장소 | `1976haru/public` |
| public 원격 URL | `https://github.com/1976haru/public.git` |
| public 상태 | GitHub 저장소 정보상 `size: 0`, 기본 브랜치 `main`; 빈 저장소로 보이므로 배포 전에 재확인 필요 |

현재 로컬 checkout은 `origin/master`와 동기화된 `1976haru/reward`를 기준으로 유지한다. 이번 작업에서는 `origin`을 `public`으로 바꾸지 않는다.

## public 저장소 사용 여부

`1976haru/public`을 공식 배포 저장소로 사용할지는 **아직 확정하지 않는다.** 공개 이름, 공개 범위, 기본 브랜치(`main`), 기존 `reward` 히스토리 유지 방식에 대한 사용자의 결정을 먼저 받아야 한다.

공식 배포 저장소로 정하기 전 확인할 항목:

1. `public` 저장소가 실제로 빈 저장소인지 GitHub 화면과 API에서 다시 확인한다.
2. `reward`의 전체 커밋 히스토리를 그대로 공개할지 확인한다.
3. `public`의 기본 브랜치를 `main`으로 유지할지, 기존 `master` 기준과 어떻게 맞출지 정한다.
4. `.env`, API 키, 토큰, 개인정보, `data/*` 산출물, `dist`, `node_modules`가 포함되지 않는지 확인한다.
5. 승인된 방법으로만 최초 push 또는 별도 배포 절차를 수행한다.

## 현재 원격과 일치시키는 기본 절차

현재 기준 저장소 `origin`(`1976haru/reward`)에서 작업을 게시할 때는 다음 순서를 사용한다.

```powershell
git branch --show-current
git remote -v
git fetch origin
git status --ignored

# 변경 파일에 .env, data 산출물, dist, node_modules가 없는지 확인한 뒤
git add .
git commit -m "<변경 내용>"
git push origin master

git fetch origin
git status
git log --oneline -1
git rev-parse HEAD
git rev-parse origin/master
```

`git rev-parse HEAD`와 `git rev-parse origin/master`가 같으면 현재 로컬과 기준 원격이 일치한다.

## public 배포를 검토할 때의 안전 원칙

- 기존 `origin` URL을 임의로 변경하지 않는다.
- `git push --force` 또는 `--force-with-lease`를 사용하지 않는다.
- 빈 저장소 확인과 브랜치 정책 결정 전에는 `public`에 push하지 않는다.
- 필요하면 `public`을 별도 원격 이름(예: `public`)으로 추가하는 방식을 검토하되, 실제 추가·push는 별도 승인 작업으로 분리한다.
- 두 저장소 사이에 충돌이나 기존 커밋이 발견되면 덮어쓰지 않고 차이를 먼저 보고한다.

## 커밋 제외 대상

다음 파일과 산출물은 어느 GitHub 저장소에도 커밋하지 않는다.

- `.env`, API 키, 토큰, 개인정보
- `data/evidence`, `data/reports`, `data/cases` 및 기타 실행 산출물
- `dist`, `node_modules`

현재 `.gitignore`는 위 실행 산출물과 비밀값 파일을 무시하며, `data/*` 폴더의 `.gitkeep`만 저장소 구조 유지를 위해 추적한다.
