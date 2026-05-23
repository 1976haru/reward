// 결과물 부족·정산 확인 필요 탐지 룰 테스트용 가짜 기준선 데이터 생성기 (체크리스트 19).
//
// 모든 데이터는 가짜(합성)이며 실제 기관명/개인정보가 아니다.
// - 대부분은 원문·증빙·정산자료가 충분한 정상 레코드(낮은 점수 → 후보 제외).
// - 일부는 의도적으로 성과보고서/정산서/결과보고서/결과물 URL/증빙/첨부파일이 부족한 그룹.
// - 일부는 정산액/집행액이 없는 그룹.
// - 일부는 환수/반납 문맥은 있으나 금액이 없는 그룹.
// - 최근 2~3년 fiscalYear 분포 포함.
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

export interface OutputSettlementFixtureResult {
  records: BaselineRecord[];
}

export function createOutputSettlementRiskFixtures(count = 1000): OutputSettlementFixtureResult {
  const records: BaselineRecord[] = [];
  const PLANTED = 24; // 4개 그룹 × 6건
  const baseCount = Math.max(0, count - PLANTED);

  // --- 정상 base: 모든 근거·정산자료 충분 → 누락 신호 없음 → minimal(후보 제외) ---
  for (let i = 0; i < baseCount; i++) {
    const year = 2024 + (i % 2); // 최근(경과 미만)
    records.push(
      rec({
        id: `base_${i}`,
        fiscalYear: year,
        localGovName: `표본시 ${i % 9}구`,
        projectName: `정상 보조사업 ${i}`,
        projectNameCompactKey: `정상보조사업키${i}`,
        recipientName: `정상단체 ${i}`,
        normalizedRecipientName: `정상단체키${i}`,
        documentType: "settlement",
        subsidyAmount: 5_000_000 + i * 137,
        executionAmount: 4_800_000 + i * 100,
        settlementAmount: 4_700_000 + i * 90,
        returnAmount: 0,
        sourceUrl: `https://example.go.kr/s/${i}`,
        evidenceUrl: `https://example.go.kr/e/${i}`,
        performanceReportUrl: `https://example.go.kr/perf/${i}`,
        settlementDocumentUrl: `https://example.go.kr/settle/${i}`,
        resultReportUrl: `https://example.go.kr/result/${i}`,
        resultUrl: `https://example.go.kr/output/${i}`,
        attachmentCount: 2,
        hasPerformanceReport: true,
        hasSettlementDocument: true,
        hasResultReport: true,
        hasResultUrl: true,
        hasAttachment: true
      })
    );
  }

  // --- 그룹 FULL: 결과물/정산/증빙/첨부 전부 누락 + 오래된 사업 → high ---
  for (let k = 0; k < 6; k++) {
    records.push(
      rec({
        id: `missAll_${k}`,
        fiscalYear: 2022, // 2년 이상 경과
        localGovName: "경기도 수원시 팔달구",
        projectName: `청년 문화활동 지원사업 ${k}`,
        projectNameCompactKey: `청년문화활동지원사업누락${k}`,
        recipientName: `누락단체${k}`,
        normalizedRecipientName: `누락단체키${k}`,
        documentType: "settlement"
        // URL/금액/첨부 모두 없음 → 다수 누락 신호 + projectEndedLongAgo
      })
    );
  }

  // --- 그룹 SETTLE: 결과물·증빙은 있으나 정산서/정산액 없음 → 정산 확인 필요(medium/low) ---
  for (let k = 0; k < 6; k++) {
    records.push(
      rec({
        id: `missSettle_${k}`,
        fiscalYear: 2022,
        localGovName: "경기도 성남시 분당구",
        projectName: `아동 돌봄 지원사업 ${k}`,
        projectNameCompactKey: `아동돌봄지원사업정산${k}`,
        recipientName: `정산미확인단체${k}`,
        normalizedRecipientName: `정산미확인키${k}`,
        documentType: "settlement",
        subsidyAmount: 8_000_000,
        executionAmount: 7_500_000,
        sourceUrl: `https://example.go.kr/ss/${k}`,
        evidenceUrl: `https://example.go.kr/se/${k}`,
        performanceReportUrl: `https://example.go.kr/sp/${k}`,
        resultReportUrl: `https://example.go.kr/sr/${k}`,
        resultUrl: `https://example.go.kr/so/${k}`,
        attachmentCount: 1,
        hasPerformanceReport: true,
        hasResultReport: true,
        hasResultUrl: true,
        hasAttachment: true
        // settlementDocumentUrl 없음 + settlementAmount 없음 → missingSettlement*
      })
    );
  }

  // --- 그룹 RETURN: 환수/반납 문맥은 있으나 환수액 없음 → missingReturnAmountAfterIssue ---
  for (let k = 0; k < 6; k++) {
    records.push(
      rec({
        id: `missReturn_${k}`,
        fiscalYear: 2022,
        localGovName: "경기도 고양시 일산동구",
        projectName: `노인 일자리 지원사업 환수 ${k}`,
        projectNameCompactKey: `노인일자리지원사업환수${k}`,
        recipientName: `환수문맥단체${k}`,
        normalizedRecipientName: `환수문맥키${k}`,
        documentType: "recovery_return",
        subsidyAmount: 6_000_000,
        executionAmount: 5_800_000,
        settlementAmount: 5_700_000,
        sourceUrl: `https://example.go.kr/rr/${k}`,
        evidenceUrl: `https://example.go.kr/re/${k}`,
        performanceReportUrl: `https://example.go.kr/rp/${k}`,
        resultReportUrl: `https://example.go.kr/rrp/${k}`,
        resultUrl: `https://example.go.kr/ro/${k}`,
        attachmentCount: 1,
        hasPerformanceReport: true,
        hasResultReport: true,
        hasResultUrl: true,
        hasAttachment: true
        // returnAmount 없음 (환수 문맥) → missingReturnAmountAfterIssue
      })
    );
  }

  // --- 그룹 NOEVIDENCE(+합성 PII): 증빙/결과물 없음 + recipientName 에 합성 PII → 마스킹 검증 ---
  for (let k = 0; k < 6; k++) {
    records.push(
      rec({
        id: `missEvidence_${k}`,
        fiscalYear: 2022,
        localGovName: "경기도 수원시 영통구",
        projectName: `마을 공동체 지원사업 ${k}`,
        projectNameCompactKey: `마을공동체지원사업누락${k}`,
        recipientName:
          k === 0 ? "한울타리 (담당 010-1234-5678 test@example.com 900101-1234567)" : `증빙없음단체${k}`,
        normalizedRecipientName: `증빙없음키${k}`,
        documentType: "selection_result",
        subsidyAmount: 4_000_000
        // sourceUrl/evidenceUrl/결과물/정산/첨부/금액 다수 없음
      })
    );
  }

  return { records };
}
