// 반복 수급 탐지 룰 테스트용 가짜 기준선 데이터 생성기 (체크리스트 17).
//
// 모든 데이터는 가짜(합성)이며 실제 기관명/개인정보가 아니다.
// - 대부분은 키가 겹치지 않는 무관 레코드(반복 후보가 되지 않아야 함).
// - 일부는 의도적으로 심은 반복 클러스터(동일 기관/주소/유사 사업명/연도/금액).
// - 일부는 마스킹 검증용 합성 PII 를 recipientName 에 포함(결과 키/사유에 원문이 남으면 안 됨).
//
// 본 fixture 는 TOP 50 산출 경로/점수 검증용이며 실제 탐지 완료로 간주하지 않는다.

import { BaselineRecord } from "../../src/types/dataQualityBaseline.js";

function rec(partial: Partial<BaselineRecord> & { id: string; projectName: string }): BaselineRecord {
  return {
    sourceType: "fixture",
    sourceName: "fixture-synthetic",
    collectedAt: new Date(Date.UTC(partial.fiscalYear ?? 2024, 0, 1)).toISOString(),
    documentType: "subsidy_notice",
    privacyDetectedTypes: [],
    ...partial
  } as BaselineRecord;
}

export interface RepeatFixtureResult {
  records: BaselineRecord[];
  /** 의도적으로 심은 반복 클러스터의 groupKey 힌트(테스트 참고용). */
  plantedRecipientKeys: string[];
  plantedAddressKeys: string[];
}

export function createRepeatRiskFixtures(count = 1000): RepeatFixtureResult {
  const records: BaselineRecord[] = [];

  // --- 무관 base 레코드 (키가 서로 겹치지 않음 → 반복 후보 미생성) ---
  // 심은 클러스터 레코드 수(클러스터 A5 + B4 + C4 + PII1 = 14)를 제외해 총합이 count 가 되게 한다.
  const PLANTED_COUNT = 14;
  const baseCount = Math.max(0, count - PLANTED_COUNT);
  for (let i = 0; i < baseCount; i++) {
    const year = 2023 + (i % 3);
    records.push(
      rec({
        id: `base_${i}`,
        fiscalYear: year,
        localGovName: `표본시 ${i % 9}구`,
        projectName: `독립 보조사업 ${i}`,
        projectNameCompactKey: `독립보조사업키${i}`, // 고유 → 사업명 블록 미공유
        recipientName: `독립단체 ${i}`,
        normalizedRecipientName: `독립단체키${i}`, // 고유 → 기관 블록 미공유
        subsidyAmount: 1_000_000 + i * 137,
        sourceUrl: `https://example.go.kr/s/${i}`,
        evidenceUrl: `https://example.go.kr/e/${i}`
      })
    );
  }

  const plantedRecipientKeys: string[] = [];
  const plantedAddressKeys: string[] = [];

  // --- 클러스터 A: 동일 기관 + 동일 주소 + 유사 사업명 + 인접 연도 + 유사 금액 → high ---
  const recipA = "행복나눔";
  const addrA = "경기도수원시팔달구효원로1";
  plantedRecipientKeys.push(recipA);
  plantedAddressKeys.push(addrA);
  const projA = ["청년문화활동지원사업", "청년문화예술활동지원사업", "청년문화활동지원사업"];
  for (let k = 0; k < 5; k++) {
    records.push(
      rec({
        id: `clusterA_${k}`,
        fiscalYear: 2023 + (k % 3),
        localGovName: "경기도 수원시 팔달구",
        projectName: `${2023 + (k % 3)}년 청년 문화활동 지원사업`,
        projectNameCompactKey: projA[k % projA.length],
        recipientName: "주식회사 행복나눔",
        normalizedRecipientName: recipA,
        normalizedAddressKey: addrA,
        addressRegionKey: "경기도수원시팔달구효원로",
        subsidyAmount: 5_000_000 + (k % 2) * 100_000, // 차이 ≤10%
        documentType: "subsidy_notice",
        sourceUrl: `https://example.go.kr/a/${k}`,
        evidenceUrl: `https://example.go.kr/ae/${k}`
      })
    );
  }

  // --- 클러스터 B: 동일 주소(공유오피스) + 서로 다른 기관 → medium ---
  const addrB = "경기도성남시분당구정자로5";
  plantedAddressKeys.push(addrB);
  const recipsB = ["미래복지", "두드림", "새빛", "다온누리"];
  for (let k = 0; k < recipsB.length; k++) {
    records.push(
      rec({
        id: `clusterB_${k}`,
        fiscalYear: 2024,
        localGovName: "경기도 성남시 분당구",
        projectName: `${recipsB[k]} 돌봄 지원사업`,
        projectNameCompactKey: `돌봄지원사업${k}`,
        recipientName: `${recipsB[k]}협동조합`,
        normalizedRecipientName: recipsB[k],
        normalizedAddressKey: addrB,
        addressRegionKey: "경기도성남시분당구정자로",
        subsidyAmount: 3_000_000 + k * 400_000,
        documentType: "settlement",
        sourceUrl: `https://example.go.kr/b/${k}`
      })
    );
  }

  // --- 클러스터 C: 동일 기관 + 유사 사업명 + 같은 연도(주소 없음) → medium 정도 ---
  const recipC = "푸른솔";
  plantedRecipientKeys.push(recipC);
  for (let k = 0; k < 4; k++) {
    records.push(
      rec({
        id: `clusterC_${k}`,
        fiscalYear: 2025,
        localGovName: "예시군",
        projectName: `농업 기술 교육사업 ${k}유형`,
        projectNameCompactKey: "농업기술교육사업",
        recipientName: "푸른솔영농조합법인",
        normalizedRecipientName: recipC,
        subsidyAmount: 8_000_000,
        documentType: "selection_result",
        sourceUrl: `https://example.go.kr/c/${k}`,
        evidenceUrl: `https://example.go.kr/ce/${k}`
      })
    );
  }

  // --- 마스킹 검증용: 동일 기관 클러스터에 합성 PII 가 recipientName 에 섞인 레코드 ---
  records.push(
    rec({
      id: "clusterA_pii",
      fiscalYear: 2024,
      localGovName: "경기도 수원시 팔달구",
      projectName: "청년 문화활동 지원사업 (담당 010-1234-5678 test@example.com)",
      projectNameCompactKey: "청년문화활동지원사업",
      recipientName: "주식회사 행복나눔 (대표 010-9876-5432, 900101-1234567)",
      normalizedRecipientName: recipA,
      normalizedAddressKey: addrA,
      addressRegionKey: "경기도수원시팔달구효원로",
      subsidyAmount: 5_050_000,
      sourceUrl: "https://example.go.kr/a/pii",
      evidenceUrl: "https://example.go.kr/ae/pii"
    })
  );

  return { records, plantedRecipientKeys, plantedAddressKeys };
}
