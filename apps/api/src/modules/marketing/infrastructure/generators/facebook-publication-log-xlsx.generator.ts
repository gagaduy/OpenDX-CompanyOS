// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { PublicationAttempt, PublicationRecord } from "../../domain/entities/marketing-campaign";
import { buildZip } from "./zip-builder";

export function generateFacebookPublicationLogXlsx(
  campaignId: string,
  attempts: readonly PublicationAttempt[],
  record: PublicationRecord | null,
): {
  buffer: Buffer;
  filename: string;
  mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
} {
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Publication Log" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const headers = [
    "Attempt ID",
    "Package ID",
    "Target ID",
    "Platform",
    "Execution Mode",
    "Account / Page ID",
    "Status",
    "Started At",
    "Finished At",
    "Error Code",
    "External Post ID",
    "Post URL",
    "Simulated",
  ];

  let rowsXml = `<row r="1">`;
  headers.forEach((h, i) => {
    rowsXml += `<c r="${colName(i + 1)}1" t="inlineStr"><is><t>${escapeXml(h)}</t></is></c>`;
  });
  rowsXml += `</row>`;

  let rowIndex = 2;
  for (const a of attempts) {
    const postUrl = record?.postUrl ?? "";
    const postId = record?.externalPostId ?? "";
    const isSimulated = a.simulated ? "YES" : "NO";

    const values = [
      a.id,
      a.packageId,
      a.targetId ?? "",
      a.platform,
      a.executionMode ?? "live",
      a.pageConfigurationId,
      a.status,
      a.startedAt,
      a.finishedAt ?? "",
      a.errorCode ?? "",
      postId,
      postUrl,
      isSimulated,
    ];

    rowsXml += `<row r="${rowIndex}">`;
    values.forEach((val, i) => {
      rowsXml += `<c r="${colName(i + 1)}${rowIndex}" t="inlineStr"><is><t>${escapeXml(String(val))}</t></is></c>`;
    });
    rowsXml += `</row>`;
    rowIndex++;
  }

  // If no attempts but record exists
  if (attempts.length === 0 && record) {
    const values = [
      "initial-direct",
      record.packageId,
      record.targetId ?? "",
      record.platform,
      record.executionMode ?? "live",
      record.pageId,
      "succeeded",
      record.createdAt,
      record.verifiedAt,
      "",
      record.externalPostId,
      record.postUrl ?? "",
      record.simulated ? "YES" : "NO",
    ];
    rowsXml += `<row r="${rowIndex}">`;
    values.forEach((val, i) => {
      rowsXml += `<c r="${colName(i + 1)}${rowIndex}" t="inlineStr"><is><t>${escapeXml(String(val))}</t></is></c>`;
    });
    rowsXml += `</row>`;
  }

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${rowsXml}
  </sheetData>
</worksheet>`;

  const buffer = buildZip([
    { path: "[Content_Types].xml", content: contentTypesXml },
    { path: "_rels/.rels", content: rootRelsXml },
    { path: "xl/workbook.xml", content: workbookXml },
    { path: "xl/_rels/workbook.xml.rels", content: workbookRelsXml },
    { path: "xl/worksheets/sheet1.xml", content: sheetXml },
  ]);

  return {
    buffer,
    filename: `publication_log_${campaignId.slice(0, 8)}.xlsx`,
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

function colName(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
