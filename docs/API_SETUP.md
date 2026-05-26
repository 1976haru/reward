# OpenAI API 설정 가이드 (초보자용)

이 문서는 **공익레이더 건강기능식품 1차 MVP**에서 OpenAI API를 안전하게 연결하는 방법을 설명합니다.
프로그래밍을 잘 모르는 분도 그대로 따라 할 수 있도록 단계별로 적었습니다.

> ## 가장 먼저 알아둘 점
>
> - **기본값은 Mock 모드입니다.** (`MOCK_AI=true`) — API 키 없이도 모든 화면을 사용할 수 있고, **AI 비용이 발생하지 않습니다.**
> - **Real 모드는 본인이 직접** `OPENAI_API_KEY`를 입력하고 `MOCK_AI=false`로 바꿨을 때만 동작합니다.
> - **실제 API를 호출하면 사용량만큼 비용(요금)이 발생할 수 있습니다.**
> - **API 키는 절대 GitHub에 올리면 안 됩니다.** (`.env` 파일은 커밋되지 않도록 이미 설정되어 있습니다.)
> - 이 프로그램은 자동 신고를 하지 않습니다. AI는 "의심 후보 / 검토 필요" 판단만 돕고, 실제 신고는 사람이 공식 창구에서 직접 합니다.

---

## 1. OpenAI 계정 준비

1. 웹 브라우저에서 <https://platform.openai.com> 에 접속합니다.
2. 계정이 없으면 **Sign up**(회원가입), 있으면 **Log in**(로그인)을 누릅니다.
3. 로그인 후 결제 정보가 필요할 수 있습니다. (실제 호출 시 비용이 청구되므로, 처음에는 **소액 한도(usage limit)** 설정을 권장합니다.)

> 💡 비용이 걱정되면 OpenAI 대시보드의 **Billing → Usage limits**에서 월 사용 한도를 낮게 설정해 두세요.

---

## 2. API Key 생성 위치

1. 로그인한 상태에서 <https://platform.openai.com/api-keys> 로 이동합니다.
   (또는 좌측/우측 상단 메뉴에서 **API keys** 클릭)
2. **Create new secret key**(새 비밀 키 생성) 버튼을 누릅니다.
3. 키 이름(예: `gongik-radar-local`)을 적고 생성합니다.
4. 화면에 표시된 키 문자열(예: `sk-...`로 시작)을 **그 자리에서 복사**합니다.
   - ⚠️ 이 키는 **생성 직후 한 번만** 전체가 보입니다. 창을 닫으면 다시 볼 수 없으니 안전한 곳에 임시 보관하세요.
   - ⚠️ 키를 카카오톡/메일/채팅/스크린샷 등으로 공유하지 마세요.

---

## 3. 생성한 키를 `.env`에 입력하기

1. 프로젝트 폴더에서 `.env` 파일을 엽니다.
   - `.env` 파일이 없다면 `.env.example`을 복사해서 만듭니다.
     - Windows PowerShell: `Copy-Item .env.example .env`
2. 아래 항목을 찾아 값을 채웁니다.

   ```dotenv
   # 기본값(Mock). 실제 호출 전에는 그대로 둡니다.
   MOCK_AI=true

   # 복사한 키를 = 뒤에 붙여넣습니다 (따옴표 없이).
   OPENAI_API_KEY=여기에_본인_키_붙여넣기

   # 사용할 모델 (그대로 두어도 됩니다)
   OPENAI_MODEL=gpt-4.1-mini

   # 답변의 일관성 정도 (0에 가까울수록 일관적). 기본 권장값.
   LLM_TEMPERATURE=0.2
   ```

3. 파일을 저장합니다.

> 🔒 `.env` 파일은 `.gitignore`에 등록되어 있어 **GitHub에 올라가지 않습니다.** 이 파일을 직접 커밋하거나 공유하지 마세요.

---

## 4. Mock 모드 ↔ Real 모드 전환

| 상태 | 설정 | 동작 |
|---|---|---|
| **Mock 모드 (기본값)** | `MOCK_AI=true` | OpenAI를 호출하지 않습니다. 규칙 기반 결과로 동작하며 **비용이 발생하지 않습니다.** |
| **Real 모드** | `MOCK_AI=false` + `OPENAI_API_KEY` 입력됨 | 실제 OpenAI 모델을 호출합니다. **사용량만큼 비용이 발생할 수 있습니다.** |
| 키 없이 Real 시도 | `MOCK_AI=false` + 키 비어있음 | 서버가 죽지 않고 **안전하게 Mock/Fallback 결과**를 반환합니다. |

실제 호출을 하려면 `.env`에서 다음과 같이 바꿉니다.

```dotenv
MOCK_AI=false
OPENAI_API_KEY=sk-...(본인 키)
```

변경 후 서버를 다시 시작합니다. (`npm run dev`)

> ⚠️ `MOCK_AI=false`로 바꾸는 순간부터 분석 실행 시 실제 비용이 청구될 수 있습니다. 검증·시연 단계에서는 `MOCK_AI=true`를 유지하세요.

---

## 5. 연결 상태 확인 방법

서버 실행 후 브라우저에서 `http://localhost:3001` → **설정 점검 카드**를 보면:

- OpenAI API 키가 **"설정됨 / 미설정"** 으로만 표시됩니다. (키 원문, 일부 문자열, 앞뒤 일부도 표시하지 않습니다.)
- 현재 실행 모드(Mock/Real)와 안전 안내가 보입니다.

API로도 확인할 수 있습니다. (키 원문은 응답에 포함되지 않습니다.)

```bash
curl http://localhost:3001/api/settings
```

분석 경로 확인:

```bash
curl -X POST http://localhost:3001/api/analyze/llm \
  -H "content-type: application/json" \
  -d "{\"moduleId\":\"false_ad\",\"title\":\"테스트\",\"ruleDetectionResult\":{\"riskScore\":90,\"matches\":[{\"keyword\":\"당뇨 완치\",\"riskLevel\":\"HIGH\"}]}}"
```

응답에서 다음 값을 확인하세요.

- `analysisMode`: `"mock"` | `"real"` | `"fallback"`
- `usedExternalApi`: 기본값(Mock)에서는 `false`
- `notLegalConclusion`: `true`
- `rewardGuaranteed`: `false`
- `humanReviewRequired`: `true`

---

## 6. 안전 수칙 요약

- ✅ 기본값은 Mock 모드입니다. 검증은 Mock으로 먼저 하세요.
- ✅ Real 모드는 사용자가 직접 키를 설정하고 `MOCK_AI=false`로 바꾼 경우에만 사용됩니다.
- ✅ API 사용 시 비용이 발생할 수 있습니다.
- ✅ API 키 원문은 화면·API 응답·로그·trace·신고서 어디에도 표시되지 않습니다.
- 🚫 API 키를 코드/문서/스크린샷/채팅으로 공유하지 마세요.
- 🚫 `.env` 파일을 GitHub에 커밋하지 마세요.
- ℹ️ AI 결과는 법 위반 확정이 아니며, 신고 전 사람이 공식 기준과 증거를 직접 검토해야 합니다. 포상금 지급은 보장되지 않습니다.

---

# Naver Search API 설정 가이드 (초보자용)

Naver Search API는 **공개 웹 검색 결과로 "분석 후보 URL"을 찾는 용도**입니다.
**자동 신고용이 아닙니다.** 찾은 후보는 사람이 직접 선택한 뒤 분석 단계로 넘어갑니다.

> ## 먼저 알아둘 점
>
> - **기본값은 mock 후보 발굴입니다.** (`MOCK_SCOUT=true`) — 키 없이도 화면이 동작하며 외부 호출이 없습니다.
> - **Naver API는 본인이 직접** `NAVER_CLIENT_ID`와 `NAVER_CLIENT_SECRET`을 **둘 다** 입력했을 때만 활성화됩니다.
> - 키가 없으면 서버가 죽지 않고 **mock 후보 발굴**로 안전하게 동작합니다.
> - **API 키는 절대 GitHub에 올리면 안 됩니다.** (`.env`는 커밋되지 않도록 설정되어 있습니다.)
> - **과도한 호출을 하면 네이버 정책상 제한될 수 있습니다.** 공식 API만 사용하며, 검색 결과 HTML 스크래핑·대량 크롤링·CAPTCHA 우회는 하지 않습니다.
> - 검색 결과는 **신고 대상 확정이 아니라 "분석 후보"**입니다.

---

## 1. 네이버 개발자센터 접속

1. 웹 브라우저에서 <https://developers.naver.com> 에 접속합니다.
2. 네이버 계정으로 로그인합니다. (없으면 네이버 회원가입 후 진행)

## 2. 애플리케이션 등록

1. 상단 메뉴 **Application → 애플리케이션 등록**으로 이동합니다.
   (또는 <https://developers.naver.com/apps/#/register> 로 직접 이동)
2. **애플리케이션 이름**을 적습니다. (예: `gongik-radar`)
3. **사용 API**에서 **검색**을 선택합니다.
4. **환경 추가**에서 **WEB 설정**을 선택하고, 서비스 URL은 로컬 테스트면 `http://localhost:3001` 을 입력합니다.
5. **등록하기**를 누릅니다.

## 3. 검색 API 사용 설정

- 위 2번에서 **사용 API = 검색**을 반드시 선택해야 검색 API를 호출할 수 있습니다.
- 등록 후 **내 애플리케이션** 화면에서 검색 API가 추가되어 있는지 확인합니다.

## 4. Client ID 확인 / 5. Client Secret 확인

1. **Application → 내 애플리케이션 → (등록한 앱 선택)** 으로 이동합니다.
2. **개요(Overview)** 화면에 다음 두 값이 보입니다.
   - **Client ID** → `NAVER_CLIENT_ID`에 넣을 값
   - **Client Secret** → `NAVER_CLIENT_SECRET`에 넣을 값 (**보안 비밀**이므로 공유 금지)

## 6. `.env`에 입력하기

`.env` 파일을 열어 아래 값을 채웁니다. (없으면 `.env.example`을 복사: `Copy-Item .env.example .env`)

```dotenv
# 둘 다 채워야 Naver adapter 가 활성화됩니다.
NAVER_CLIENT_ID=여기에_Client_ID
NAVER_CLIENT_SECRET=여기에_Client_Secret

# 실제 Naver 검색을 쓰려면 mock 끄기 (기본값은 true 유지 권장)
MOCK_SCOUT=false

# 과도한 호출 방지용 최소 대기(ms)
SCOUT_REQUEST_DELAY_MS=1000

# 후보 발굴 기본 mock 스위치 (안전 기본값 true)
MOCK_DISCOVERY=true
```

저장 후 서버를 다시 시작합니다. (`npm run dev`)

> 🔒 `.env`는 `.gitignore`에 등록되어 있어 **GitHub에 올라가지 않습니다.** 직접 커밋·공유하지 마세요.

## 7. 후보 URL 발굴 동작 확인

서버 실행 후:

```bash
curl -X POST http://localhost:3001/api/scout/discover \
  -H "content-type: application/json" \
  -d "{\"moduleId\":\"false_ad\",\"topic\":\"건강기능식품 당뇨 완치 광고\",\"sourceTypes\":[\"naver\"]}"
```

응답에서 다음을 확인하세요. (키 원문은 절대 표시되지 않습니다.)

- `sourceType`: `"naver"`(키 설정+사용 시) 또는 `"mock"`
- `usedExternalApi`: 키가 없으면 `false`
- `apiKeyConfigured`: `true` / `false` 상태값만 표시
- `discoveryCandidates[].status`: `"needs_review"` (자동 분석/자동 신고로 이어지지 않음)
- `humanReviewRequired`: `true`
- `warnings`: 키 미설정 시 "mock 모드 동작" 안내 포함

브라우저에서는 **후보 찾기 화면**에서 Naver 키 상태("설정됨/미설정")와 안전 안내를 볼 수 있습니다.

## 8. 안전 수칙 요약 (Naver)

- ✅ 기본값은 mock 후보 발굴입니다. 검증은 mock으로 먼저 하세요.
- ✅ Naver adapter는 `NAVER_CLIENT_ID` + `NAVER_CLIENT_SECRET`을 둘 다 설정한 경우에만 활성화됩니다.
- ✅ 후보 URL은 신고 대상 확정이 아니라 "분석 후보"이며, 사람이 선택해야 분석으로 진행됩니다.
- ✅ API 키 원문은 화면·API 응답·로그·trace 어디에도 표시되지 않습니다.
- 🚫 키를 코드/문서/스크린샷/채팅으로 공유하거나 `.env`를 커밋하지 마세요.
- 🚫 대량 검색·대량 크롤링·검색 HTML 스크래핑·CAPTCHA 우회는 하지 않습니다. 공식 API만 사용합니다.

---

## 관련 문서

- 환경변수 전체 목록: [`.env.example`](../.env.example)
- 안전 정책(자동 신고 금지): [`docs/approval_gate.md`](./approval_gate.md)
- 운영 정책: [`docs/OPERATING_POLICY.md`](./OPERATING_POLICY.md)
- 개인정보 처리: [`docs/privacy_policy.md`](./privacy_policy.md)

> 공식 신고처 URL Registry, API 키 안전검사 전체 확장, 실패 fallback 고도화는 **다음 단계**에서 진행합니다. 본 문서는 OpenAI · Naver Search API 연결까지 다룹니다.
