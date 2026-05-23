// 동일 주소 다수 단체 탐지 룰 테스트용 가짜 기준선 데이터 생성기 (체크리스트 18).
//
// 모든 데이터는 가짜(합성)이며 실제 기관명/개인정보/실제 상세주소가 아니다.
// - 대부분은 주소 키가 겹치지 않는 무관 레코드(후보가 되지 않아야 함).
// - 일부는 동일 normalizedAddressKey 에 여러 단체가 있는 그룹(high/medium 기대).
// - 일부는 addressRegionKey 만 같은 그룹(낮은 점수 기대).
// - 일부는 공유오피스/복지관/공공시설 힌트 그룹(cautionNotes 기대).
// - 상세주소 원문은 사용하지 않으며 결과 키에는 정규화 키만 남는다.
//
// 본 fixture 는 후보 산출 경로/점수 검증용이며 실제 탐지 완료로 간주하지 않는다.

import { BaselineRecord } from "../../src/types/dataQualityBaseline.js";

function rec(p: Partial<BaselineRecord> & { id: string; projectName: string }): BaselineRecord {
  return {
    sourceType: "fixture",
    sourceName: "fixture-synthetic",
    collectedAt: new Date(Date.UTC(p.fiscalYear ?? 2024, 0, 1)).toISOString(),
    documentType: "subsidy_notice",
    privacyDetectedTypes: [],
    ...p
  } as BaselineRecord;
}

export interface AddressClusterFixtureResult {
  records: BaselineRecord[];
  plantedAddressKeys: string[];
  plantedRegionKeys: string[];
  facilityAddressKey: string;
}

export function createAddressClusterRiskFixtures(count = 1000): AddressClusterFixtureResult {
  const records: BaselineRecord[] = [];
  // 심은 클러스터 레코드 수(A4 + R3 + F3 + PII1 = 11)를 제외해 총합이 count 가 되게 한다.
  const PLANTED = 11;
  const baseCount = Math.max(0, count - PLANTED);

  // --- 무관 base: 각자 고유한 주소/단체 키 (그룹화되지 않음) ---
  for (let i = 0; i < baseCount; i++) {
    const year = 2023 + (i % 3);
    records.push(
      rec({
        id: `base_${i}`,
        fiscalYear: year,
        localGovName: `표본시 ${i % 9}구`,
        projectName: `독립 보조사업 ${i}`,
        projectNameCompactKey: `독립보조사업키${i}`,
        recipientName: `독립단체 ${i}`,
        normalizedRecipientName: `독립단체키${i}`,
        normalizedAddressKey: `표본시${i % 9}구독립로${i}`, // 고유 주소 키
        addressRegionKey: `표본시${i % 9}구독립로${i}`, // 고유 지역 키(무관 그룹화 방지)
        subsidyAmount: 2_000_000 + i * 111,
        sourceUrl: `https://example.go.kr/s/${i}`,
        evidenceUrl: `https://example.go.kr/e/${i}`
      })
    );
  }

  const plantedAddressKeys: string[] = [];
  const plantedRegionKeys: string[] = [];

  // --- 그룹 A: 동일 normalizedAddressKey + 단체 4개 + 여러 연도 + 유사 사업 + 큰 총액 → high ---
  const addrA = "경기도수원시팔달구효원로1";
  plantedAddressKeys.push(addrA);
  const recipsA = ["행복나눔", "미래복지", "두드림", "새빛"];
  recipsA.forEach((rname, k) => {
    records.push(
      rec({
        id: `clusterA_${k}`,
        fiscalYear: 2023 + (k % 3),
        localGovName: "경기도 수원시 팔달구",
        projectName: `청년 문화활동 지원사업`,
        projectNameCompactKey: "청년문화활동지원사업",
        recipientName: `${rname}협동조합`,
        normalizedRecipientName: rname,
        normalizedAddressKey: addrA,
        addressRegionKey: "경기도수원시팔달구효원로",
        subsidyAmount: 30_000_000 + k * 1_000_000,
        sourceUrl: `https://example.go.kr/a/${k}`,
        evidenceUrl: `https://example.go.kr/ae/${k}`
      })
    );
  });

  // --- 그룹 R: addressRegionKey 만 같음(서로 다른 normalizedAddressKey) → 낮은 점수 ---
  const regionR = "경기도성남시분당구정자로";
  plantedRegionKeys.push(regionR);
  const recipsR = ["가온누리", "빛고을", "참좋은"];
  recipsR.forEach((rname, k) => {
    records.push(
      rec({
        id: `clusterR_${k}`,
        fiscalYear: 2023 + (k % 3), // 여러 회계연도
        localGovName: "경기도 성남시 분당구",
        projectName: `${rname} 돌봄 지원사업`,
        projectNameCompactKey: `돌봄지원사업R${k}`,
        recipientName: `${rname}단체`,
        normalizedRecipientName: rname,
        normalizedAddressKey: `${regionR}${10 + k}`, // 서로 다른 상세 도로번호 → 다른 주소 키
        addressRegionKey: regionR,
        subsidyAmount: 4_000_000 + k * 500_000, // 총액 >= 1천만
        sourceUrl: `https://example.go.kr/r/${k}`
      })
    );
  });

  // --- 그룹 F: 동일 주소 + 다수 단체이지만 공공시설(복지관/주민센터) 힌트 → cautionNotes ---
  const addrF = "경기도고양시일산동구중앙로100";
  plantedAddressKeys.push(addrF);
  const recipsF = ["일산복지관", "마을회관운영회", "행정복지센터협의회"];
  recipsF.forEach((rname, k) => {
    records.push(
      rec({
        id: `clusterF_${k}`,
        fiscalYear: 2024 + (k % 2),
        localGovName: "경기도 고양시 일산동구",
        projectName: `${rname} 주민 프로그램 지원사업`,
        projectNameCompactKey: `주민프로그램지원사업F${k}`,
        recipientName: rname, // 복지관/회관/센터 키워드 포함
        normalizedRecipientName: `시설단체${k}`,
        normalizedAddressKey: addrF,
        addressRegionKey: "경기도고양시일산동구중앙로",
        subsidyAmount: 5_000_000 + k * 500_000,
        sourceUrl: `https://example.go.kr/f/${k}`,
        evidenceUrl: `https://example.go.kr/fe/${k}`
      })
    );
  });

  // --- 마스킹 검증용: 동일 주소 그룹에 합성 PII 가 recipientName 에 섞인 레코드 ---
  records.push(
    rec({
      id: "clusterA_pii",
      fiscalYear: 2024,
      localGovName: "경기도 수원시 팔달구",
      projectName: "청년 문화활동 지원사업 (담당 010-1234-5678 test@example.com)",
      projectNameCompactKey: "청년문화활동지원사업",
      recipientName: "한울타리 (대표 010-9876-5432, 900101-1234567)",
      normalizedRecipientName: "한울타리",
      normalizedAddressKey: addrA,
      addressRegionKey: "경기도수원시팔달구효원로",
      subsidyAmount: 31_000_000,
      sourceUrl: "https://example.go.kr/a/pii",
      evidenceUrl: "https://example.go.kr/ae/pii"
    })
  );

  return { records, plantedAddressKeys, plantedRegionKeys, facilityAddressKey: addrF };
}
