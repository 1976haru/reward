// 예산 집행 이상 패턴 탐지 룰 테스트용 가짜 기준선 데이터 생성기 (체크리스트 20).
//
// 모든 데이터는 가짜(합성)이며 실제 기관명/개인정보가 아니다.
// - 대부분은 항목 비중이 균형적이고 증빙이 충분한 정상 레코드(낮은 점수 → 후보 제외).
// - 의도적으로 인건비/홍보비/용역비/장비구입비 비중 과다 그룹 포함.
// - 동일 항목 반복 지출 / 유사 금액 반복 / 특정 지급처 반복 그룹 포함(지급처는 vendorNameMasked 가짜 값).
// - 증빙 URL 부족 그룹 포함.
// - 최근 2~3년 fiscalYear 분포 포함.
//
// 본 fixture 는 후보 산출 경로/점수 검증용이며 실제 탐지 완료로 간주하지 않는다.

import { BaselineRecord } from "../../src/types/dataQualityBaseline.js";
import { SpendingLineItem } from "../../src/types/spendingAnomalyRisk.js";

function rec(p: Partial<BaselineRecord> & { id: string; projectName: string }): BaselineRecord {
  return {
    sourceType: "fixture",
    sourceName: "fixture-synthetic",
    collectedAt: new Date(Date.UTC(p.fiscalYear ?? 2024, 0, 1)).toISOString(),
    documentType: "settlement",
    privacyDetectedTypes: [],
    ...p
  } as BaselineRecord;
}

export interface SpendingFixtureResult {
  records: BaselineRecord[];
}

export function createSpendingAnomalyRiskFixtures(count = 1000): SpendingFixtureResult {
  const records: BaselineRecord[] = [];
  const PLANTED = 36; // 6개 그룹 × 6건
  const baseCount = Math.max(0, count - PLANTED);

  // --- 정상 base: 항목 비중 균형 + 증빙 충분 → minimal(후보 제외) ---
  for (let i = 0; i < baseCount; i++) {
    const year = 2023 + (i % 3);
    const total = 10_000_000;
    records.push(
      rec({
        id: `base_${i}`,
        fiscalYear: year,
        localGovName: `표본시 ${i % 9}구`,
        projectName: `균형 보조사업 ${i}`,
        projectNameCompactKey: `균형보조사업키${i}`,
        normalizedRecipientName: `정상단체키${i}`,
        executionAmount: total,
        laborCostAmount: 3_000_000, // 30%
        promotionCostAmount: 1_000_000, // 10%
        serviceCostAmount: 2_000_000, // 20%
        equipmentCostAmount: 1_500_000, // 15%
        materialCostAmount: 2_500_000, // 25%
        hasSpendingBreakdown: true,
        spendingEvidenceUrls: [`https://example.go.kr/receipt/${i}-1`],
        sourceUrl: `https://example.go.kr/s/${i}`,
        evidenceUrl: `https://example.go.kr/e/${i}`
      })
    );
  }

  // --- 그룹 LABOR: 인건비 비중 과다 + 단일 지출 과다 + 증빙 부족 ---
  for (let k = 0; k < 6; k++) {
    records.push(
      rec({
        id: `labor_${k}`,
        fiscalYear: 2024,
        localGovName: "경기도 수원시 팔달구",
        projectName: `청년 활동 지원사업 ${k}`,
        projectNameCompactKey: `청년활동지원사업노무${k}`,
        normalizedRecipientName: `인건비단체키${k}`,
        executionAmount: 10_000_000,
        hasSpendingBreakdown: true,
        spendingLineItems: [
          { category: "labor", label: "인건비", amount: 8_000_000, vendorNameMasked: "급여대상-A***" }, // 80%
          { category: "other", label: "기타", amount: 2_000_000 }
        ]
        // 증빙 URL 없음 → missingReceiptEvidence
      })
    );
  }

  // --- 그룹 PROMOTION: 홍보비 비중 과다 + 단일 지출 과다 + 증빙 부족 ---
  for (let k = 0; k < 6; k++) {
    records.push(
      rec({
        id: `promo_${k}`,
        fiscalYear: 2023,
        localGovName: "경기도 성남시 분당구",
        projectName: `지역 홍보 캠페인 ${k}`,
        projectNameCompactKey: `지역홍보캠페인${k}`,
        normalizedRecipientName: `홍보비단체키${k}`,
        executionAmount: 10_000_000,
        hasSpendingBreakdown: true,
        spendingLineItems: [
          { category: "promotion", label: "홍보비", amount: 6_500_000, vendorNameMasked: "광고업체-P***" }, // 65%
          { category: "other", label: "기타", amount: 3_500_000 }
        ]
        // 증빙 URL 없음 → missingReceiptEvidence
      })
    );
  }

  // --- 그룹 SERVICE: 용역비 비중 과다 + 단일 지출 과다 + 증빙 부족 ---
  for (let k = 0; k < 6; k++) {
    records.push(
      rec({
        id: `svc_${k}`,
        fiscalYear: 2024,
        localGovName: "경기도 고양시 일산동구",
        projectName: `정책 연구 용역 ${k}`,
        projectNameCompactKey: `정책연구용역${k}`,
        normalizedRecipientName: `용역비단체키${k}`,
        executionAmount: 10_000_000,
        hasSpendingBreakdown: true,
        spendingLineItems: [
          { category: "service", label: "용역비", amount: 7_000_000, vendorNameMasked: "용역업체-S***" }, // 70%
          { category: "other", label: "기타", amount: 3_000_000 }
        ]
        // 증빙 URL 없음 → missingReceiptEvidence
      })
    );
  }

  // --- 그룹 EQUIPMENT: 장비구입비 비중 과다 + 단일 지출 과다 + 증빙 부족 ---
  for (let k = 0; k < 6; k++) {
    records.push(
      rec({
        id: `equip_${k}`,
        fiscalYear: 2023,
        localGovName: "경기도 용인시 기흥구",
        projectName: `스마트팜 장비 지원 ${k}`,
        projectNameCompactKey: `스마트팜장비지원${k}`,
        normalizedRecipientName: `장비단체키${k}`,
        executionAmount: 10_000_000,
        hasSpendingBreakdown: true,
        spendingLineItems: [
          { category: "equipment", label: "고가 장비", amount: 7_000_000, vendorNameMasked: "업체-A***" }, // 70%
          { category: "other", label: "기타", amount: 3_000_000, vendorNameMasked: "업체-B***" }
        ]
        // 증빙 URL 없음 → missingReceiptEvidence
      })
    );
  }

  // --- 그룹 REPEAT: 동일 항목 반복 + 유사 금액 반복 + 특정 지급처 반복 ---
  for (let k = 0; k < 6; k++) {
    const items: SpendingLineItem[] = [
      { category: "service", label: "월 용역", amount: 1_000_000, vendorNameMasked: "용역업체-X***" },
      { category: "service", label: "월 용역", amount: 1_010_000, vendorNameMasked: "용역업체-X***" },
      { category: "service", label: "월 용역", amount: 990_000, vendorNameMasked: "용역업체-X***" },
      { category: "service", label: "월 용역", amount: 1_005_000, vendorNameMasked: "용역업체-X***" }
    ];
    records.push(
      rec({
        id: `repeat_${k}`,
        fiscalYear: 2024,
        localGovName: "경기도 안양시 동안구",
        projectName: `정기 운영 용역 ${k}`,
        projectNameCompactKey: `정기운영용역${k}`,
        normalizedRecipientName: `반복지급단체키${k}`,
        executionAmount: 4_005_000,
        hasSpendingBreakdown: true,
        spendingEvidenceUrls: [`https://example.go.kr/rp/${k}`],
        spendingLineItems: items
      })
    );
  }

  // --- 그룹 NOBREAKDOWN(+합성 PII): 세부내역/증빙 없음 + recipientName 합성 PII ---
  for (let k = 0; k < 6; k++) {
    records.push(
      rec({
        id: `nobreak_${k}`,
        fiscalYear: 2023,
        localGovName: "경기도 수원시 영통구",
        projectName: `세부내역 미상 사업 ${k}`,
        projectNameCompactKey: `세부내역미상사업${k}`,
        recipientName:
          k === 0 ? "한울타리 (담당 010-1234-5678 test@example.com 900101-1234567)" : `미상단체${k}`,
        normalizedRecipientName: `미상단체키${k}`,
        executionAmount: 10_000_000
        // 카테고리 금액/라인아이템/증빙 모두 없음 → missingBreakdown + missingReceiptEvidence
      })
    );
  }

  return { records };
}
