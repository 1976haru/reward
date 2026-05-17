# Reward Agent MVP

이 프로젝트는 "포상금 자동화 프로그램"이 아니라 **공개자료 기반 신고 후보 탐지·증거정리·신고서 초안 생성 도구**입니다.
사용자가 입력한 공개 URL을 수집·분석해 의심 문구를 추출하고 증거를 정리하며 신고서 초안을 만듭니다. 실제 신고 제출은 사람이 직접 수행합니다.

## 실행 순서

```bash
npm install
cp .env.example .env
npm run playwright:install
npm run dev
```

브라우저에서 `http://localhost:3001` 접속 후 URL을 입력합니다.

## 핵심 원칙

- 공개 웹페이지와 사용자가 직접 입력한 URL만 분석합니다.
- 자동 신고 기능은 제공하지 않습니다. 모든 신고는 사람이 검토한 뒤 외부 신고기관에 직접 제출합니다.
- 개인정보, 비공개 자료, 로그인 우회, 약관 위반 크롤링은 수행하지 않습니다.
- 현재 사용 가능 모듈: **건강기능식품 온라인 허위·과대광고 탐지**. 식품·화장품·의료기기 전체를 한 번에 다루지 않으며, 건강기능식품 모듈이 안정화된 뒤 동일 패턴으로 카테고리를 확장합니다.

## MVP Scope

The first MVP module focuses on detecting potentially misleading online advertisements for health functional foods from publicly accessible URLs.
This project currently does not attempt to cover all reporting or bounty categories.
The first module is intentionally limited to health functional food advertising so that the collection, detection, analysis, evidence, and human review workflow can be completed safely before expanding to other modules.

See [`mvp_scope.md`](./mvp_scope.md) for the detailed MVP scope and keyword set.

## Product Scope & Safety Policy

이 도구의 사용 범위, 금지 범위, 사람 검토 원칙, 증거 패키지 기준, AI 한계, 모듈 확장 정책은 [`scope.md`](./scope.md) 문서에 정의되어 있습니다.

핵심 요약:

- **자동 신고 금지**: 외부 신고기관 자동 제출, 자동 민원 제출, 자동 로그인 신고 기능은 만들지 않습니다.
- **공개자료만 수집**: 비공개·로그인 필요·우회 수집 대상은 다루지 않습니다.
- **사람 최종 검토 필수**: AI 분석 결과는 참고자료이며, 최종 신고 여부는 사람이 판단합니다.
- **단정 표현 금지**: 특정 개인·사업자를 위법자로 단정하지 않습니다.
- **책임 사용자**: 신고 여부와 내용에 대한 책임은 본 도구 사용자에게 있습니다.

새 모듈을 추가할 때도 동일한 정책이 적용됩니다. 자세한 내용은 [`scope.md`](./scope.md)를 반드시 확인하세요.

## UI 구성

웹 UI는 다음 영역으로 구성됩니다 (`public/index.html`, `public/styles.css`, `public/app.js`).

1. 히어로 — 제품 정의와 자동 신고 금지·사람 검토 필수 안내
2. 신고 분야 선택 — 모듈 카드 (현재 사용 가능: **건강기능식품 온라인 허위·과대광고 탐지** / 일반 식품·화장품·의료기기·기타 모듈은 준비 중)
3. 선택 모듈 가이드 — 탐지 예시, 신고처, 필요 증거, 포상금 안내, 주의사항
4. 원스톱 프로세스 바 — 자료수집 → 규칙탐지 → AI분석 → 위험평가 → 증거저장 → 신고서초안 → 사람검토
5. 공개 URL 분석 입력 — 입력 전 주의사항 노출
6. 분석 결과 — 위험도/등급, AI 요약, 탐지 문구, 신고기관 후보, 포상금 안내, 다음 행동 추천
7. 증거 패키지 — 원본 URL, 수집일시, 캡처/PDF/텍스트/신고서 초안 보유 여부
8. 최근 케이스 — 모듈명, 위험도, 상태(Draft/Review/Approved/Submitted/Rejected), 신고처, 상세보기

백엔드 API(`/api/cases`, `/api/cases/analyze`, `/api/cases/:id`)는 변경하지 않았습니다.

## 폴더 구조

```text
src/
  agents/       에이전트 분업 로직
  modules/      분야별 탐지 규칙
  services/     저장소, 캡처, 보고서 서비스
  types/        공통 타입
  utils/        유틸리티
public/         단순 웹 UI
data/           로컬 저장소
```

## Claude Code 작업 방식

1. 이 ZIP을 GitHub에 업로드합니다.
2. 엑셀 체크리스트의 순번대로 Claude Code에게 점검시킵니다.
3. 각 단계가 끝나면 `npm run build`, `npm run test`, 실제 URL 분석으로 검증합니다.
