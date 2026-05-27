// 보조금 수동 실제 신고 연결 — 공식 신고처 링크 안내 (체크리스트 67).
//
// 공식 신고처는 "단순 외부 링크"만 제공한다. 신고서 내용·개인정보·API 키·caseId·candidateId 등을
// 외부로 자동 전송하지 않으며, URL 에 query parameter 로 어떤 식별자도 붙이지 않는다.
// 자동 신고/자동 로그인/자동 양식입력/포상금 자동신청은 제공하지 않는다.

import { readFileSync } from "node:fs";
import path from "node:path";

export interface SubsidyReportingLink {
  agencyId: string;
  agencyName: string;
  category: "subsidy";
  officialUrl: string | null;
  description: string;
  requiredEvidence: string[];
  cautions: string[];
  manualSubmissionOnly: true;
  autoSubmitAvailable: false;
  sourceCheckedAt?: string;
}

export const SUBSIDY_REPORTING_LINKS_NOTICE =
  "공식 신고처 링크만 제공합니다. 실제 신고는 사용자가 공식 창구에서 직접 제출해야 합니다. " +
  "공익레이더는 자동 제출·자동 로그인·자동 양식입력을 하지 않으며, 외부 사이트로 신고서 내용·개인정보·식별자를 자동 전송하지 않습니다. " +
  "신고서 초안은 사용자가 검토·수정한 뒤 참고자료로 사용할 수 있습니다. 포상금 지급을 보장하지 않습니다.";

interface RawAgency {
  agencyId?: string;
  agencyName?: string;
  role?: string;
  officialUrl?: string | null;
  caution?: string;
  label?: string;
  url?: string;
}

interface RawAgencyConfig {
  lastReviewedAt?: string;
  evidenceRequirements?: string[];
  primaryAgencies?: RawAgency[];
  secondaryAgencies?: RawAgency[];
  officialReportingLinks?: RawAgency[];
}

let cached: SubsidyReportingLink[] | null = null;

function loadAgencyConfig(): RawAgencyConfig {
  const p = path.join(process.cwd(), "src/modules/subsidy-fraud/agency_config.json");
  return JSON.parse(readFileSync(p, "utf8")) as RawAgencyConfig;
}

/**
 * agency_config.json 의 공식 기관/신고처를 "단순 링크" 형태로 변환한다.
 * officialUrl 이 null 인 기관(사안별 관할)은 description 으로 안내만 한다.
 */
export function buildSubsidyReportingLinks(): SubsidyReportingLink[] {
  if (cached) return cached;
  const cfg = loadAgencyConfig();
  const evidence = cfg.evidenceRequirements ?? [];
  const sourceCheckedAt = cfg.lastReviewedAt;

  const out: SubsidyReportingLink[] = [];
  const seen = new Set<string>();
  const add = (a: RawAgency, extraCaution: string[] = []) => {
    const agencyId = (a.agencyId ?? a.url ?? a.agencyName ?? "agency").toString();
    if (seen.has(agencyId)) return;
    seen.add(agencyId);
    out.push({
      agencyId,
      agencyName: a.agencyName ?? a.label ?? agencyId,
      category: "subsidy",
      officialUrl: (a.officialUrl ?? a.url) ?? null,
      description: a.role ?? a.label ?? "공식 신고/안내 채널",
      requiredEvidence: evidence,
      cautions: [a.caution, ...extraCaution].filter((c): c is string => Boolean(c)),
      manualSubmissionOnly: true,
      autoSubmitAvailable: false,
      sourceCheckedAt
    });
  };

  for (const a of cfg.officialReportingLinks ?? []) add(a);
  for (const a of cfg.primaryAgencies ?? []) add(a);
  for (const a of cfg.secondaryAgencies ?? [])
    add(a, ["이 시스템은 신고 채널이 아니라 공개자료 확인용입니다. 신고는 1차 기관에서 진행하세요."]);

  cached = out;
  return out;
}

/** 외부 링크에 식별자/내용을 붙이지 않았는지 자체 점검(테스트/안전용). */
export function reportingLinkHasNoIdentifiers(link: SubsidyReportingLink): boolean {
  const url = link.officialUrl ?? "";
  if (!url) return true;
  // query string / fragment 에 candidateId·caseId·token 등 식별자가 없어야 한다.
  return !/[?#]/.test(url);
}
