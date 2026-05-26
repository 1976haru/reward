// 보조금 룰 5종 API 데모용 합성 레코드 (체크리스트 60).
//
// 합성 데이터이며 실제 단체·개인·사업자와 무관하다. 개인정보 원문(대표자명/연락처/계좌/상세주소)은
// 포함하지 않고 정규화 키만 사용한다. API(/api/subsidy/risk/rules/run) fixture 모드 입력으로 쓴다.
// 외부 API/실데이터가 아니며, 결과는 사람 검토가 필요한 후보다.

import type { SubsidyRiskInputRecord } from "../types/subsidyRisk.js";

/** 5종 룰이 각각 최소 1건 이상 후보를 만들도록 구성한 소규모 데모 레코드. */
export function buildSubsidyRiskDemoRecords(): SubsidyRiskInputRecord[] {
  const records: SubsidyRiskInputRecord[] = [];

  // 정상 잡음
  for (let i = 0; i < 6; i++) {
    records.push({
      recordId: `demo-base-${i + 1}`,
      fiscalYear: 2024,
      projectName: `${i}구역 생활환경 개선사업`,
      projectNameCompactKey: `생활환경개선${i}`,
      recipientName: `정상단체${i}`,
      normalizedRecipientName: `정상단체${i}`,
      addressRegionKey: `서울특별시 가상구 ${i}동`,
      subsidyAmount: 10_000_000 + i * 1_000_000,
      settlementAmount: 9_000_000 + i * 1_000_000,
      hasResultReport: true,
      publicListingUrl: `https://example.org/notice/${i}`,
      sourceFileName: "demo.csv"
    });
  }

  // A. 반복수급
  for (const [k, year] of [[0, 2022], [1, 2023], [2, 2024]] as Array<[number, number]>) {
    records.push({
      recordId: `demo-repeat-${k + 1}`,
      fiscalYear: year,
      projectName: `청년 지원사업 ${k}`,
      projectNameCompactKey: `청년지원${k}`,
      recipientName: "반복수급 검토대상 협회",
      normalizedRecipientName: "반복수급검토대상협회",
      addressRegionKey: "부산광역시 가상구 가상동",
      subsidyAmount: 30_000_000,
      settlementAmount: 29_000_000,
      hasResultReport: true,
      publicListingUrl: `https://example.org/repeat/${k}`,
      sourceFileName: "demo.csv"
    });
  }

  // B. 동일주소 다단체
  for (const n of [1, 2, 3]) {
    records.push({
      recordId: `demo-addr-${n}`,
      fiscalYear: 2024,
      projectName: `마을공동체 활성화사업 ${n}`,
      projectNameCompactKey: `마을공동체${n}`,
      recipientName: `같은주소 단체${n}`,
      normalizedRecipientName: `같은주소단체${n}`,
      addressRegionKey: "대구광역시 가상구 동일로 100",
      subsidyAmount: 15_000_000,
      settlementAmount: 14_000_000,
      hasResultReport: true,
      publicListingUrl: `https://example.org/addr/${n}`,
      sourceFileName: "demo.csv"
    });
  }

  // C. 결과물/정산 누락
  records.push({
    recordId: "demo-missing-1",
    fiscalYear: 2024,
    projectName: "홍보영상 제작 지원사업",
    projectNameCompactKey: "홍보영상제작",
    recipientName: "증빙미확인 단체",
    normalizedRecipientName: "증빙미확인단체",
    addressRegionKey: "인천광역시 가상구 1동",
    subsidyAmount: 20_000_000,
    publicListingUrl: "https://example.org/missing/1",
    sourceFileName: "demo.csv"
  });

  // D. 예산집행 이상치
  records.push({
    recordId: "demo-anomaly-1",
    fiscalYear: 2024,
    projectName: "대규모 축제 운영 지원사업",
    projectNameCompactKey: "축제운영",
    recipientName: "이상치 검토대상 재단",
    normalizedRecipientName: "이상치검토대상재단",
    addressRegionKey: "광주광역시 가상구 가상동",
    subsidyAmount: 800_000_000,
    executionAmount: 900_000_000,
    settlementAmount: 800_000_000,
    hasResultReport: true,
    publicListingUrl: "https://example.org/anomaly/1",
    sourceFileName: "demo.csv"
  });

  // E. 사업명 유사 반복
  for (const [n, year] of [[1, 2022], [2, 2023], [3, 2024]] as Array<[number, number]>) {
    records.push({
      recordId: `demo-similar-${n}`,
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
      sourceFileName: "demo.csv"
    });
  }

  return records;
}
