// apps/api/src/modules/support/infrastructure/generators/support-report-docx.generator.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { buildZip } from "../../../marketing/infrastructure/generators/zip-builder";
import type { AiSupportProposalDto } from "../../application/dtos/ai-support-response.dto";

function escapeXml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateSupportReportDocx(proposal: AiSupportProposalDto): {
  buffer: Buffer;
  filename: string;
  mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
} {
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const ticketRowsXml = proposal.tickets
    .map(
      (item) => `
    <w:tr>
      <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="0284C7"/></w:rPr><w:t>${escapeXml(item.customerName)}</w:t></w:r><w:p><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr><w:t>${escapeXml(item.customerEmail)}</w:t></w:r></w:p></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="2600" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(item.subject)}</w:t></w:r><w:p><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="D97706"/></w:rPr><w:t>Phân loại: ${escapeXml(item.issueCategory)}</w:t></w:r></w:p></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${item.sentiment === "angry" || item.sentiment === "frustrated" ? "DC2626" : "16A34A"}"/></w:rPr><w:t>${escapeXml(item.sentiment.toUpperCase())}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${item.churnRisk === "high" ? "DC2626" : item.churnRisk === "medium" ? "D97706" : "16A34A"}"/></w:rPr><w:t>${escapeXml(item.churnRisk.toUpperCase())}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="334155"/></w:rPr><w:t>${escapeXml(item.proposedResponse)}</w:t></w:r><w:p><w:r><w:rPr><w:sz w:val="18"/><w:b/><w:color w:val="059669"/></w:rPr><w:t>Đề xuất đền bù: ${escapeXml(item.suggestedCompensation)}</w:t></w:r></w:p></w:p></w:tc>
    </w:tr>`,
    )
    .join("\n");

  const vipRowsXml = proposal.vipCustomers
    .map(
      (vip) => `
    <w:tr>
      <w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="0F172A"/></w:rPr><w:t>${escapeXml(vip.customerName)}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="D97706"/></w:rPr><w:t>${escapeXml(vip.segment)}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="059669"/></w:rPr><w:t>${vip.totalSpentVnd.toLocaleString("vi-VN")} đ</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="3600" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="334155"/></w:rPr><w:t>${escapeXml(vip.engagementRecommendation)}</w:t></w:r></w:p></w:tc>
    </w:tr>`,
    )
    .join("\n");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="0F172A"/></w:rPr><w:t>BÁO CÁO KIỂM TOÁN DỊCH VỤ CSKH &amp; TRẢI NGHIỆM KHÁCH HÀNG</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="20"/><w:color w:val="64748B"/></w:rPr><w:t>Mã Báo Cáo: CRM-DOCX-${proposal.id.slice(0, 8).toUpperCase()} | Thời gian lập: ${escapeXml(proposal.createdAt)}</w:t></w:r></w:p>
    
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="0284C7"/></w:rPr><w:t>1. MỤC TIÊU &amp; YÊU CẦU CHỈ ĐẠO CỦA BAN GIÁM ĐỐC</w:t></w:r></w:p>
    <w:p><w:r><w:t>${escapeXml(proposal.prompt)}</w:t></w:r></w:p>

    <w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="0284C7"/></w:rPr><w:t>2. TỔNG QUAN SỨC KHỎE CSKH &amp; PHÂN TÍCH CSAT</w:t></w:r></w:p>
    <w:p><w:r><w:t>${escapeXml(proposal.overallSentimentSummary)}</w:t></w:r></w:p>

    <w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="DC2626"/></w:rPr><w:t>3. PHÂN TÍCH NGUY CƠ RỜI BỎ (CHURN RISK)</w:t></w:r></w:p>
    <w:p><w:r><w:t>${escapeXml(proposal.churnRiskAssessment)}</w:t></w:r></w:p>

    <w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="0284C7"/></w:rPr><w:t>4. BẢNG XỬ LÝ SỰ CỐ &amp; KỊCH BẢN PHẢN HỒI (${proposal.tickets.length} Ticket)</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr><w:tblW w:w="10800" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/></w:tblBorders></w:tblPr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Khách hàng</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Sự cố &amp; Phân loại</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Tâm lý</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Rủi ro Churn</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Kịch bản &amp; Đền bù</w:t></w:r></w:p></w:tc>
      </w:tr>
      ${ticketRowsXml}
    </w:tbl>

    <w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="0284C7"/></w:rPr><w:t>5. BẢNG PHÂN KHÚC KHÁCH HÀNG VIP &amp; RETENTION (${proposal.vipCustomers.length} Khách hàng)</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr><w:tblW w:w="10800" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/></w:tblBorders></w:tblPr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Tên Khách Hàng</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Phân Khúc</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Tổng Chi Tiêu</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Chiến Lược Chăm Sóc</w:t></w:r></w:p></w:tc>
      </w:tr>
      ${vipRowsXml}
    </w:tbl>

    <w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="059669"/></w:rPr><w:t>6. KIẾN NGHỊ HÀNH ĐỘNG PHÊ DUYỆT</w:t></w:r></w:p>
    <w:p><w:r><w:t>${escapeXml(proposal.recommendedAction)}</w:t></w:r></w:p>

    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr><w:tblW w:w="10800" w:type="dxa"/></w:tblPr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="3600" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>QUẢN GIA CSKH</w:t></w:r><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>(Đã rà soát &amp; soạn kịch bản)</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3600" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>CHUYÊN VIÊN CRM</w:t></w:r><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>(Đã phân tích VIP &amp; Churn)</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3600" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>BAN GIÁM ĐỐC</w:t></w:r><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>(Ký duyệt xử lý)</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

  const buffer = buildZip([
    { path: "[Content_Types].xml", content: Buffer.from(contentTypesXml, "utf8") },
    { path: "_rels/.rels", content: Buffer.from(rootRelsXml, "utf8") },
    { path: "word/document.xml", content: Buffer.from(documentXml, "utf8") },
  ]);

  return {
    buffer,
    filename: proposal.docxFilename || `bao_cao_cham_soc_khach_hang_${proposal.id.slice(0, 8)}.docx`,
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}
