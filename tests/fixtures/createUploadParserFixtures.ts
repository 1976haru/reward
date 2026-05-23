// 업로드 파서 테스트용 가짜 fixture 생성기 (체크리스트 12 — 필수 작업 5).
//
// 모든 데이터는 가짜(합성)이며 실제 개인정보가 아니다.
// 일부 fixture 는 "마스킹 동작 검증" 목적으로 개인정보처럼 보이는 패턴(전화/이메일/주민번호/계좌)을
// 포함한다. 이 값들은 합성값이며, parser 통과 후 결과는 반드시 마스킹되어야 한다.
// 본 파일은 정책 검사 화이트리스트에 등록되어 있으며, 생성된 fixture 는 임시 폴더에만 쓰고
// git 에 커밋하지 않는다.

import path from "node:path";
import { writeFile } from "node:fs/promises";
import { ensureDir } from "../../src/utils/fs.js";

export interface FixturePaths {
  csv: string[];
  xlsx: string[];
  pdf: string[];
  unsupported: string[];
  /** 지원 형식 전체 (csv+xlsx+pdf). */
  supported: string[];
}

// ---------- CSV ----------

function toCsv(rows: string[][]): string {
  return rows
    .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","))
    .join("\n");
}

// ---------- 텍스트 기반 PDF 생성 ----------

/** 줄 단위 텍스트를 담은 최소 텍스트 기반 PDF(비압축)를 만든다. OCR 대상 아님. */
export function buildTextPdf(lines: string[]): Buffer {
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  let content = "BT\n/F1 10 Tf\n50 760 Td\n";
  lines.forEach((ln, i) => {
    if (i > 0) content += "0 -16 Td\n";
    content += `(${escape(ln)}) Tj\n`;
  });
  content += "ET";
  const contentByteLen = Buffer.byteLength(content, "utf8");

  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${contentByteLen}>>\nstream\n${content}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>"
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += String(off).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

// ---------- 생성기 ----------

export async function createUploadParserFixtures(targetDir: string): Promise<FixturePaths> {
  await ensureDir(targetDir);
  const mod = await import("xlsx");
  const XLSX = ((mod as unknown as { default?: typeof import("xlsx") }).default ?? mod) as typeof import("xlsx");

  const csv: string[] = [];
  const xlsx: string[] = [];
  const pdf: string[] = [];
  const unsupported: string[] = [];

  const writeText = async (name: string, text: string): Promise<string> => {
    const fp = path.join(targetDir, name);
    await writeFile(fp, text, "utf8");
    return fp;
  };
  const writeBuf = async (name: string, buf: Buffer): Promise<string> => {
    const fp = path.join(targetDir, name);
    await writeFile(fp, buf);
    return fp;
  };
  const writeXlsx = async (name: string, rows: string[][]): Promise<string> => {
    const fp = path.join(targetDir, name);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, fp);
    return fp;
  };

  // --- CSV 1: 공고 (clean) ---
  csv.push(
    await writeText(
      "csv01_보조금_공고.csv",
      toCsv([
        ["사업명", "보조사업자", "보조금액", "담당부서", "공고일", "회계연도"],
        ["청년창업 지원사업", "가나다 창업지원센터", "5,000,000원", "일자리경제과", "2025-03-02", "2025"],
        ["전통시장 활성화 지원", "라마바 상인회", "12,000,000원", "지역경제과", "2025.03.10", "2025"],
        ["소상공인 디지털 전환", "사아자 협동조합", "8,500,000원", "소상공인과", "2025년 4월 1일", "2025"]
      ])
    )
  );

  // --- CSV 2: 정산/환수 ---
  csv.push(
    await writeText(
      "csv02_보조금_정산.csv",
      toCsv([
        ["보조사업명", "수급기관", "정산액", "환수액", "회계연도", "지자체"],
        ["다문화가족 지원", "차카타 복지재단", "30,000,000원", "1,500,000원", "2024", "예시시"],
        ["아동급식 지원", "파하 종합사회복지관", "45,000,000원", "0원", "2024", "예시시"]
      ])
    )
  );

  // --- CSV 3: 개인정보 마스킹 검증용 (비고 컬럼에 합성 PII) ---
  // 아래 값들은 모두 합성(가짜) 값이며, 결과 저장 시 마스킹되어야 한다.
  csv.push(
    await writeText(
      "csv03_수급기관_연락.csv",
      toCsv([
        ["사업명", "단체명", "보조금액", "비고"],
        [
          "노인돌봄 종합서비스",
          "행복드림 복지센터",
          "20,000,000원",
          "담당자 연락처 010-1234-5678 / 이메일 test@example.com / 계좌번호 123-456-789012 / 주민등록번호 900101-1234567"
        ]
      ])
    )
  );

  // --- CSV 4: 선정결과 + 단위 다양 + projectName 누락 행(partial) ---
  csv.push(
    await writeText(
      "csv04_사업_선정결과.csv",
      toCsv([
        ["지원사업명", "보조사업자", "지원금액", "사업시작일", "사업종료일"],
        ["스마트팜 보급", "마바사 영농조합", "1,200천원", "2025-01-01", "2025-12-31"],
        ["청년 주거 지원", "아자차 주거복지", "3백만원", "2025-02-01", "2025-11-30"],
        ["", "타파하 단체", "2,000,000원", "2025-03-01", "2025-10-31"]
      ])
    )
  );

  // --- XLSX 1~4 ---
  xlsx.push(
    await writeXlsx("xlsx01_보조금_공고.xlsx", [
      ["사업명", "보조사업자", "교부액", "담당부서", "공고일"],
      ["문화예술 창작지원", "가나다 예술협회", "7,000,000원", "문화관광과", "2025-03-05"],
      ["체육시설 운영지원", "라마바 체육회", "9,500,000원", "체육진흥과", "2025-03-12"],
      ["환경정화 활동지원", "사아자 환경단체", "4,200,000원", "환경과", "2025-03-20"]
    ])
  );
  xlsx.push(
    await writeXlsx("xlsx02_보조금_정산.xlsx", [
      ["보조사업명", "수급기관", "집행액", "정산액", "반납액", "회계연도"],
      ["저소득층 의료지원", "차카타 의료재단", "50,000,000원", "48,000,000원", "2,000,000원", "2024"],
      ["장애인 이동지원", "파하 복지센터", "33,000,000원", "33,000,000원", "0원", "2024"]
    ])
  );
  xlsx.push(
    await writeXlsx("xlsx03_현장_점검.xlsx", [
      ["사업명", "수행기관", "보조금", "담당과"],
      ["다함께돌봄 운영", "가나 돌봄센터", "15,000,000원", "보육정책과"],
      ["지역아동센터 지원", "다라 아동센터", "18,000,000원", "아동복지과"]
    ])
  );
  xlsx.push(
    await writeXlsx("xlsx04_보조사업_감사.xlsx", [
      ["지원사업명", "보조사업자명", "지원액", "환수금"],
      ["귀농귀촌 정착지원", "마바 귀농지원", "25,000,000원", "5,000,000원"],
      ["농산물 가공지원", "사아 영농법인", "22,000,000원", "0원"]
    ])
  );

  // --- PDF 1: 공고 (텍스트 기반) ---
  pdf.push(
    await writeBuf(
      "pdf01_보조금_공고.pdf",
      buildTextPdf([
        "지자체: 예시군 | 회계연도: 2025",
        "사업명: 농촌 일손돕기 지원 | 보조사업자: 가나다 영농회 | 보조금액: 6,000,000원 | 공고일: 2025-03-08",
        "사업명: 마을공동체 활성화 | 보조사업자: 라마바 마을회 | 보조금액: 4,500,000원 | 공고일: 2025-03-15",
        "사업명: 청소년 문화지원 | 보조사업자: 사아자 청소년단체 | 보조금액: 3,200,000원 | 공고일: 2025-03-22"
      ])
    )
  );

  // --- PDF 2: 환수/반납 (텍스트 기반) + projectName 누락 줄(partial) ---
  pdf.push(
    await writeBuf(
      "pdf02_보조금_환수.pdf",
      buildTextPdf([
        "지자체: 예시시 | 회계연도: 2024",
        "사업명: 노인일자리 사업 | 수급기관: 차카타 노인회 | 정산액: 40,000,000원 | 환수액: 3,000,000원",
        "수급기관: 파하 복지관 | 환수액: 1,000,000원"
      ])
    )
  );

  // --- 지원하지 않는 파일 (오류 로그 검증용) ---
  unsupported.push(await writeText("unsupported01_안내문.hwp", "한글 문서 — 이번 범위 제외 (가짜)"));

  return { csv, xlsx, pdf, unsupported, supported: [...csv, ...xlsx, ...pdf] };
}
