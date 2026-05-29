# L2 — Forensic Evidence Capture · 통합 가이드

이 패키지를 본인 `reward` repo 에 그대로 드롭하면 됩니다.

## 1. 파일 구조 (zip 안)

```
src/types/forensics.ts
src/forensics/
  index.ts
  hashChain.ts          ← 변조 감지 해시체인 (append-only JSONL)
  warc.ts               ← Pure-TS WARC 1.1 writer (ISO 28500)
  manifest.ts           ← 매니페스트 생성·검증 + canonical JSON
  openTimestamps.ts     ← Bitcoin 블록체인 타임스탬프
  attestation.ts        ← 11점 사실관계 진술서 강제
tests/forensics/
  hashChain.test.ts     ← 6 tests
  warc.test.ts          ← 5 tests
  manifest.test.ts      ← 6 tests
  attestation.test.ts   ← 5 tests
scripts/
  forensics-verify-chain.ts
  forensics-ots-verify.ts
  forensics-bundle.ts
```

총 테스트 22개.

## 2. 본인 repo 에 떨어뜨리기

```bash
# 본인 reward repo 루트에서:
unzip /path/to/L2-forensics.zip
# 또는: tar xzf L2-forensics.tar.gz
```

이미 같은 경로에 파일이 있으면 덮어쓰지 말고 diff 부터 확인.

## 3. 의존성 추가

```bash
npm i javascript-opentimestamps
npm i -D archiver @types/archiver tsx
```

`tsx` 는 TypeScript 를 컴파일 없이 실행해주는 도구입니다. 기존에 `ts-node` 쓰고 계시면 둘 중 하나만 있어도 됩니다.

## 4. package.json 의 scripts 에 추가

```json
{
  "scripts": {
    "test:forensics": "tsx --test tests/forensics/*.test.ts",
    "forensics:chain:verify": "tsx scripts/forensics-verify-chain.ts",
    "forensics:ots:verify": "tsx scripts/forensics-ots-verify.ts",
    "forensics:bundle": "tsx scripts/forensics-bundle.ts"
  }
}
```

## 5. 즉시 검증 (API 키 불필요)

```bash
npm install
npm run test:forensics
# → 22 passing
npm run forensics:chain:verify
# → "chain OK — 0 entries verified"
```

22개가 다 초록불이면 L2 정상.

## 6. 기존 케이스 파이프라인에 연결하는 법

분석·증거수집이 끝난 직후 다음 코드 한 토막을 호출하면 됩니다:

```ts
import {
  buildAndWriteManifest,
  fileEntry,
  stampFile,
  writeAttestation,
  blankAttestationChecks,
} from './forensics';

const caseDir = `data/evidence/${caseId}`;

// 이미 caseDir 안에 page.html, screenshot.png, archive.warc 등이 저장돼 있다고 가정
const files = [
  await fileEntry({ caseDir, relativePath: 'page.html',     mime: 'text/html',           tool: 'cheerio' }),
  await fileEntry({ caseDir, relativePath: 'screenshot.png',mime: 'image/png',           tool: 'playwright' }),
  await fileEntry({ caseDir, relativePath: 'page.pdf',      mime: 'application/pdf',     tool: 'playwright' }),
  await fileEntry({ caseDir, relativePath: 'archive.warc',  mime: 'application/warc',    tool: 'warc-writer' }),
];

// 본인 진술서 (실제 운영에서는 11개 항목을 본인이 직접 yes/no/na 로 응답)
const attestation = await writeAttestation({
  caseDir,
  caseId,
  reviewerId: process.env.REVIEWER_NAME ?? 'unknown',
  statement: '본인이 2026-01-01 21:30 KST 에 위 URL 을 직접 브라우저로 확인함.',
  checks: blankAttestationChecks(), // ⚠ 운영에서는 본인 응답으로 교체
});

const { manifestPath } = await buildAndWriteManifest(
  {
    caseId,
    sourceUrl:       'https://example.com/...',
    canonicalUrl:    'https://example.com/...',
    collectedAt:     new Date().toISOString(),
    collectorVersion:'gongik-radar/2.0',
    files,
    attestation,
  },
  { caseDir, chainLogPath: 'data/audit/chain.jsonl' }
);

// 매니페스트를 Bitcoin 블록체인에 anchoring (무료, 비동기)
await stampFile({ targetFile: manifestPath });
// 24~48 시간 뒤 npm run forensics:ots:verify 로 confirmed 확인
```

## 7. L2 Definition of Done

이 4개 다 통과하면 L2 끝.

- [ ] `npm run test:forensics` — 22 passing
- [ ] `npm run forensics:chain:verify` — exit 0
- [ ] 실제 케이스 1건에 `manifest.json`, `manifest.json.ots`, `attestation.json`, `submission-bundle.zip` 모두 생김
- [ ] 24~48시간 뒤 `npm run forensics:ots:verify` 에서 "confirmed @ block N" 메시지 확인

## 8. 의도적으로 안 넣은 것 (L2 범위 밖)

- **Playwright 다중모달 캡처** — 본인 기존 Playwright 셋업과 직접 통합해야 해서 이 묶음에 안 넣었음. L2 다음 차례.
- **24시간 자동 재수집** — Scheduler 와 결합해야 해서 별도.
- **Defense Pack 6종 PDF 생성** — 매니페스트가 굳어진 다음 단계 (L8 cross-cutting).

이 3개는 다음에 본인이 "L2 완료" 라고 하시면 같이 만들거나 L3 가기 전에 마저 만듭니다.

## 9. 결정사항 메모 (왜 이렇게 만들었는지)

- **WARC pure-TS impl**: `node-warc` 같은 외부 패키지 의존성 추가 안 하려고 직접 짰음. ISO 28500 1.1 호환. warcio/jwarc 가 읽을 수 있음.
- **Canonical JSON**: JCS (RFC 8785) 와 비슷하지만 더 단순하게 — 키 정렬 + undefined drop. 매니페스트 자기서명에 필수.
- **Hash chain in JSONL**: 1인 운영에 DB 가 과합. 파일 append 가 가장 단순하고 git 친화적. 깨지면 `verify` 가 즉시 잡음.
- **OTS lazy import**: peer dep 가 없어도 모듈 로드는 됨. `stampFile` 호출할 때만 에러.
- **Attestation 강제 검증**: 11개 모두 응답 안 하면 `writeAttestation` 이 throw. 코드 레벨에서 막아둠.
- **import 에 `.js` 확장자 없음**: 본인 repo 의 모듈 해석 설정 모름. NodeNext 쓰시면 `.js` 추가 (sed 한 줄).

## 10. 막히면

테스트 실패 메시지를 그대로 가져오시면 핀포인트로 잡습니다.
