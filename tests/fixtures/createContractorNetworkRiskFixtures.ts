import { ContractorNetworkEdge } from "../../src/types/contractorNetworkRisk.js";

export interface ContractorNetworkFixtureResult {
  edges: ContractorNetworkEdge[];
}

function edge(p: Partial<ContractorNetworkEdge> & { edgeId: string; subsidyRecordId: string; contractorName: string }): ContractorNetworkEdge {
  const contractorKey = p.contractorKey ?? `name:${(p.normalizedContractorName ?? p.contractorName).replace(/[^a-zA-Z0-9가-힣]/g, "").toLowerCase()}`;
  return {
    contractRecordId: p.contractRecordId,
    recipientKey: p.recipientKey ?? `recipient:${(p.normalizedRecipientName ?? p.recipientName ?? p.subsidyRecordId).replace(/[^a-zA-Z0-9가-힣]/g, "").toLowerCase()}`,
    contractorKey,
    sourceUrl: `https://example.go.kr/source/${p.edgeId}`,
    evidenceUrl: `https://example.go.kr/evidence/${p.edgeId}`,
    ...p
  };
}

export function createContractorNetworkRiskFixtures(count = 1000): ContractorNetworkFixtureResult {
  const edges: ContractorNetworkEdge[] = [];
  const planted = 60;
  const baseCount = Math.max(0, count - planted);

  for (let i = 0; i < baseCount; i++) {
    edges.push(
      edge({
        edgeId: `base_${i}`,
        subsidyRecordId: `base_subsidy_${i}`,
        contractRecordId: `base_contract_${i}`,
        recipientKey: `recipient:base${i}`,
        contractorKey: `name:basevendor${i}`,
        recipientName: `검증수급단체 ${i}`,
        normalizedRecipientName: `base-recipient-${i}`,
        contractorName: `검증계약업체 ${i}`,
        normalizedContractorName: `base-vendor-${i}`,
        subsidyProjectName: `일반 보조사업 ${i}`,
        projectNameCompactKey: `generalproject${i}`,
        contractTitle: `일반 계약 ${i}`,
        contractTitleCompactKey: `generalcontract${i}`,
        contractAmount: 1_000_000 + i * 137,
        subsidyAmount: 3_000_000 + i * 211,
        fiscalYear: 2021 + (i % 5),
        contractDate: `${2021 + (i % 5)}-05-15`,
        orderingAgencyName: `검증기관 ${i % 37}`,
        recipientAddressRegionKey: `region-${i % 41}`,
        contractorAddressRegionKey: `region-${(i + 7) % 41}`
      })
    );
  }

  for (let i = 0; i < 12; i++) {
    edges.push(
      edge({
        edgeId: `pair_repeat_${i}`,
        subsidyRecordId: `pair_subsidy_${i}`,
        contractRecordId: `pair_contract_${i}`,
        recipientKey: "recipient:planted-a",
        contractorKey: "bizhash:hash-planted-vendor-a",
        recipientName: "반복검증 수급단체A",
        normalizedRecipientName: "plantedrecipienta",
        contractorName: "반복검증 용역업체A",
        normalizedContractorName: "plantedvendora",
        subsidyProjectName: `청년 교육 운영 사업 ${i % 3}`,
        projectNameCompactKey: `청년교육운영사업${i % 3}`,
        contractTitle: `청년 교육 운영 용역 ${i % 3}`,
        contractTitleCompactKey: `청년교육운영용역${i % 3}`,
        contractAmount: 12_000_000 + (i % 3) * 50_000,
        subsidyAmount: 20_000_000,
        fiscalYear: 2023 + (i % 2),
        contractDate: `${2023 + (i % 2)}-04-01`,
        orderingAgencyName: "검증발주기관A",
        recipientAddressRegionKey: "gg-suwon",
        contractorAddressRegionKey: "gg-suwon",
        businessRegistrationNumberHash: "hash-planted-vendor-a",
        corporateRegistrationNumberHash: "corp-hash-planted-vendor-a"
      })
    );
  }

  for (let i = 0; i < 12; i++) {
    edges.push(
      edge({
        edgeId: `project_repeat_${i}`,
        subsidyRecordId: `project_subsidy_${i}`,
        contractRecordId: `project_contract_${i}`,
        recipientKey: "recipient:project-repeat",
        contractorKey: "name:multprojectvendor",
        recipientName: "다사업검증 수급단체",
        normalizedRecipientName: "projectrecipient",
        contractorName: "다사업검증 계약업체",
        normalizedContractorName: "multprojectvendor",
        subsidyProjectName: `지역 돌봄 프로그램 ${i}`,
        projectNameCompactKey: `지역돌봄프로그램${i}`,
        contractTitle: `지역 돌봄 운영 계약 ${i}`,
        contractTitleCompactKey: `지역돌봄운영계약${i}`,
        contractAmount: 8_000_000 + (i % 2) * 10_000,
        fiscalYear: 2024,
        contractDate: "2024-06-10",
        orderingAgencyName: "검증발주기관B",
        recipientAddressRegionKey: "gg-seongnam",
        contractorAddressRegionKey: "gg-seongnam"
      })
    );
  }

  for (let i = 0; i < 12; i++) {
    edges.push(
      edge({
        edgeId: `recipient_repeat_${i}`,
        subsidyRecordId: `recipient_subsidy_${i}`,
        contractRecordId: `recipient_contract_${i}`,
        recipientKey: `recipient:many-${i % 6}`,
        contractorKey: "corphash:corp-many-recipient",
        recipientName: `다수급단체 ${i % 6}`,
        normalizedRecipientName: `manyrecipient${i % 6}`,
        contractorName: "다수급검증 용역업체",
        normalizedContractorName: "manyrecipientvendor",
        subsidyProjectName: `마을 활동 지원 ${i % 4}`,
        projectNameCompactKey: `마을활동지원${i % 4}`,
        contractTitle: `마을 활동 지원 용역 ${i % 4}`,
        contractTitleCompactKey: `마을활동지원용역${i % 4}`,
        contractAmount: 5_500_000,
        fiscalYear: 2022 + (i % 2),
        contractDate: `${2022 + (i % 2)}-09-20`,
        orderingAgencyName: "검증발주기관C",
        recipientAddressRegionKey: `gg-region-${i % 2}`,
        contractorAddressRegionKey: `gg-region-${i % 2}`,
        corporateRegistrationNumberHash: "corp-many-recipient"
      })
    );
  }

  for (let i = 0; i < 12; i++) {
    edges.push(
      edge({
        edgeId: `title_amount_${i}`,
        subsidyRecordId: `title_subsidy_${i}`,
        contractRecordId: `title_contract_${i}`,
        recipientKey: "recipient:title-amount",
        contractorKey: "name:titleamountvendor",
        recipientName: "명칭금액검증 수급단체",
        normalizedRecipientName: "titleamountrecipient",
        contractorName: "명칭금액검증 계약업체",
        normalizedContractorName: "titleamountvendor",
        subsidyProjectName: "소상공인 디지털 교육 지원",
        projectNameCompactKey: "소상공인디지털교육지원",
        contractTitle: "소상공인 디지털 교육 운영 용역",
        contractTitleCompactKey: "소상공인디지털교육운영용역",
        contractAmount: 9_900_000 + (i % 2) * 20_000,
        fiscalYear: 2025,
        contractDate: "2025-02-10",
        orderingAgencyName: "검증발주기관D",
        recipientAddressRegionKey: "gg-ansan",
        contractorAddressRegionKey: "gg-ansan",
        businessRegistrationNumberHash: "hash-title-amount"
      })
    );
  }

  for (let i = 0; i < 12; i++) {
    edges.push(
      edge({
        edgeId: `agency_repeat_${i}`,
        subsidyRecordId: `agency_subsidy_${i}`,
        contractRecordId: `agency_contract_${i}`,
        recipientKey: `recipient:agency-${i % 3}`,
        contractorKey: "name:agencyvendor",
        recipientName: `기관반복 수급단체 ${i % 3}`,
        normalizedRecipientName: `agencyrecipient${i % 3}`,
        contractorName: "기관반복 계약업체",
        normalizedContractorName: "agencyvendor",
        subsidyProjectName: `문화 행사 지원 ${i % 3}`,
        projectNameCompactKey: `문화행사지원${i % 3}`,
        contractTitle: `문화 행사 운영 계약 ${i % 3}`,
        contractTitleCompactKey: `문화행사운영계약${i % 3}`,
        contractAmount: 7_000_000 + (i % 4) * 15_000,
        fiscalYear: 2023 + (i % 2),
        contractDate: `${2023 + (i % 2)}-07-01`,
        orderingAgencyName: "검증발주기관E",
        recipientAddressRegionKey: "gg-yongin",
        contractorAddressRegionKey: "gg-yongin"
      })
    );
  }

  return { edges: edges.slice(0, count) };
}
