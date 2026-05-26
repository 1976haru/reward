// 보조금 룰 5종 통합 실행용 합성 fixture (체크리스트 60).
//
// 합성 데이터이며 실제 단체·개인·사업자와 무관하다. 개인정보 원문(대표자명/연락처/계좌/상세주소)은
// 포함하지 않으며, 정규화 키만 사용한다. 각 룰이 최소 1건 이상 후보를 만들도록 설계되어 있다.

import type { SubsidyRiskInputRecord } from "../../src/types/subsidyRisk.js";

export interface SubsidyRiskFixtureSet {
  records: SubsidyRiskInputRecord[];
  /** 합성 의도(검증용). */
  expectations: {
    repeatRecipient: boolean;
    sameAddress: boolean;
    missingOutputSettlement: boolean;
    budgetAnomaly: boolean;
    similarProjectRepeat: boolean;
  };
}

/**
 * baseCount(기본 12) 정상 레코드 + 각 룰 트리거용 레코드를 합쳐 생성한다.
 * 합성이므로 실제 탐지 완료가 아니다.
 */
export function createSubsidyRiskFixtures(baseCount = 12): SubsidyRiskFixtureSet {
  const records: SubsidyRiskInputRecord[] = [];
  let seq = 0;
  const id = (tag: string) => `fx-${tag}-${String(++seq).padStart(3, "0")}`;

  // --- 정상 잡음 레코드(룰을 트리거하지 않도록 분산) ---
  for (let i = 0; i < baseCount; i++) {
    records.push({
      recordId: id("base"),
      fiscalYear: 2024,
      projectName: `${i}구역 생활환경 개선사업`,
      projectNameCompactKey: `생활환경개선${i}`,
      recipientName: `정상단체${i}`,
      normalizedRecipientName: `정상단체${i}`,
      addressRegionKey: `서울특별시 가상구 ${i}동`,
      subsidyAmount: 10_000_000 + i * 1_000_000,
      settlementAmount: 9_000_000 + i * 1_000_000,
      hasResultReport: true,
      resultEvidenceUrl: `https://example.org/result/${i}`,
      publicListingUrl: `https://example.org/notice/${i}`,
      sourceFileName: "fixture.csv"
    });
  }

  // --- A. 반복수급: 같은 기관이 3개 연도/사업으로 반복 ---
  for (const [k, year, proj] of [
    [0, 2022, "청년 문화예술 지원사업"],
    [1, 2023, "청년 창업 지원사업"],
    [2, 2024, "청년 일자리 지원사업"]
  ] as Array<[number, number, string]>) {
    records.push({
      recordId: id("repeat"),
      fiscalYear: year,
      projectName: proj,
      projectNameCompactKey: `청년지원${k}`,
      recipientName: "반복수급 검토대상 협회",
      normalizedRecipientName: "반복수급검토대상협회",
      addressRegionKey: "부산광역시 가상구 가상동",
      subsidyAmount: 30_000_000,
      settlementAmount: 29_000_000,
      hasResultReport: true,
      publicListingUrl: `https://example.org/repeat/${k}`,
      sourceFileName: "fixture.csv"
    });
  }

  // --- B. 동일주소 다단체: 같은 주소키에 서로 다른 단체 3곳 ---
  for (const n of [1, 2, 3]) {
    records.push({
      recordId: id("addr"),
      fiscalYear: 2024,
      projectName: `마을공동체 활성화사업 ${n}`,
      projectNameCompactKey: `마을공동체${n}`,
      recipientName: `같은주소 단체${n}`,
      normalizedRecipientName: `같은주소단체${n}`,
      addressRegionKey: "대구광역시 가상구 동일로 100",
      normalizedAddressKey: "대구광역시 가상구 동일로 100",
      subsidyAmount: 15_000_000,
      settlementAmount: 14_000_000,
      hasResultReport: true,
      publicListingUrl: `https://example.org/addr/${n}`,
      sourceFileName: "fixture.csv"
    });
  }

  // --- C. 결과물/정산 누락: 교부는 있으나 정산/결과물 없음 ---
  for (const n of [1, 2]) {
    records.push({
      recordId: id("missing"),
      fiscalYear: 2024,
      projectName: `홍보영상 제작 지원사업 ${n}`,
      projectNameCompactKey: `홍보영상제작${n}`,
      recipientName: `증빙미확인 단체${n}`,
      normalizedRecipientName: `증빙미확인단체${n}`,
      addressRegionKey: `인천광역시 가상구 ${n}동`,
      subsidyAmount: 20_000_000,
      // settlementAmount 없음, hasResultReport 없음, resultEvidenceUrl 없음
      publicListingUrl: `https://example.org/missing/${n}`,
      sourceFileName: "fixture.csv"
    });
  }

  // --- D. 예산집행 이상치: 절대 임계값 초과 + 집행액 역전 ---
  records.push({
    recordId: id("anomaly"),
    fiscalYear: 2024,
    projectName: "대규모 축제 운영 지원사업",
    projectNameCompactKey: "축제운영",
    recipientName: "이상치 검토대상 재단",
    normalizedRecipientName: "이상치검토대상재단",
    addressRegionKey: "광주광역시 가상구 가상동",
    subsidyAmount: 800_000_000, // 절대 임계값(5억) 초과
    executionAmount: 900_000_000, // 집행액 > 교부액 역전
    settlementAmount: 800_000_000,
    hasResultReport: true,
    publicListingUrl: "https://example.org/anomaly/1",
    sourceFileName: "fixture.csv"
  });

  // --- E. 사업명 유사 반복: 거의 같은 사업명 3건(연도/차수만 다름) ---
  for (const [n, year] of [
    [1, 2022],
    [2, 2023],
    [3, 2024]
  ] as Array<[number, number]>) {
    records.push({
      recordId: id("similar"),
      fiscalYear: year,
      projectName: `전통시장 활성화 컨설팅 운영사업 (${year}년 ${n}차)`,
      projectNameCompactKey: "전통시장활성화컨설팅운영",
      recipientName: `유사사업 단체${n}`,
      normalizedRecipientName: `유사사업단체${n}`,
      addressRegionKey: `대전광역시 가상구 ${n}동`,
      subsidyAmount: 25_000_000,
      settlementAmount: 24_000_000,
      hasResultReport: true,
      publicListingUrl: `https://example.org/similar/${n}`,
      sourceFileName: "fixture.csv"
    });
  }

  return {
    records,
    expectations: {
      repeatRecipient: true,
      sameAddress: true,
      missingOutputSettlement: true,
      budgetAnomaly: true,
      similarProjectRepeat: true
    }
  };
}
