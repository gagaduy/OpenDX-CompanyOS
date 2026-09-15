// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { buildZip } from "../../../marketing/infrastructure/generators/zip-builder";
import type { SupportEmailCampaignProposal } from "../../domain/entities/email-campaign.entity";

function escapeXml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateSupportEmailCampaignDocx(
  proposal: SupportEmailCampaignProposal,
): {
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

  const productRowsXml = (proposal.featuredProducts || [])
    .map(
      (p) => `
    <w:tr>
      <w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="0284C7"/></w:rPr><w:t>${escapeXml(p.sku)}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="3800" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(p.name)}</w:t></w:r><w:p><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr><w:t>${escapeXml(p.categoryName || "Sản phẩm")}</w:t></w:r></w:p></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:color w:val="0F172A"/></w:rPr><w:t>${p.regularPriceVnd.toLocaleString("vi-VN")} đ</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="DC2626"/></w:rPr><w:t>${p.salePriceVnd ? `${p.salePriceVnd.toLocaleString("vi-VN")} đ` : "N/A"}</w:t></w:r></w:p></w:tc>
    </w:tr>`,
    )
    .join("\n");

  const recipientRowsXml = proposal.recipients
    .slice(0, 30)
    .map(
      (r) => `
    <w:tr>
      <w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="0F172A"/></w:rPr><w:t>${escapeXml(r.fullName)}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="3400" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:color w:val="64748B"/></w:rPr><w:t>${escapeXml(r.email)}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="0284C7"/></w:rPr><w:t>${r.orderCount} đơn</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="059669"/></w:rPr><w:t>${r.totalSpentVnd.toLocaleString("vi-VN")} đ</w:t></w:r></w:p></w:tc>
    </w:tr>`,
    )
    .join("\n");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Title"/>
        <w:jc w:val="center"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="1E293B"/></w:rPr>
        <w:t>BÁO CÁO KẾ HOẠCH CHIẾN DỊCH EMAIL MARKETING</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="22"/><w:color w:val="64748B"/></w:rPr>
        <w:t>Bộ phận CSKH &amp; Trải nghiệm • Phòng ban NovaCommerce OS</w:t>
      </w:r>
    </w:p>

    <!-- Tóm tắt chiến dịch -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="0F172A"/></w:rPr><w:t>1. Tổng quan Chiến dịch</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Tên chiến dịch: </w:t></w:r><w:r><w:t>${escapeXml(proposal.title)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Tiêu đề Email: </w:t></w:r><w:r><w:t>${escapeXml(proposal.emailSubject)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Phân khúc Khách hàng: </w:t></w:r><w:r><w:t>${escapeXml(proposal.targetSegment)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Số lượng người nhận dự kiến: </w:t></w:r><w:r><w:t>${proposal.totalRecipients} khách hàng</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Thời gian khởi tạo: </w:t></w:r><w:r><w:t>${new Date(proposal.createdAt).toLocaleString("vi-VN")}</w:t></w:r></w:p>

    ${proposal.promotionDetails ? `
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="0F172A"/></w:rPr><w:t>2. Thông tin Khuyến mãi &amp; Voucher</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Tên ưu đãi: </w:t></w:r><w:r><w:t>${escapeXml(proposal.promotionDetails.campaignName)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Mức chiết khấu: </w:t></w:r><w:r><w:t>Giảm ${proposal.promotionDetails.discountPercent || 0}%</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Mã Voucher: </w:t></w:r><w:r><w:rPr><w:b/><w:color w:val="DC2626"/></w:rPr><w:t>${escapeXml(proposal.promotionDetails.voucherCode || "N/A")}</w:t></w:r></w:p>
    ` : ""}

    <!-- Bảng sản phẩm -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="0F172A"/></w:rPr><w:t>3. Danh mục Sản phẩm Trọng tâm</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr><w:tblW w:w="9800" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:color="E2E8F0"/></w:tblBorders></w:tblPr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>SKU</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Tên Sản Phẩm</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Giá Niêm Yết</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Giá Ưu Đãi</w:t></w:r></w:p></w:tc>
      </w:tr>
      ${productRowsXml}
    </w:tbl>

    <!-- Bảng người nhận -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="0F172A"/></w:rPr><w:t>4. Danh sách Khách hàng Nhận Email (Trích xuất 30 khách đầu)</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr><w:tblW w:w="9800" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:color="E2E8F0"/></w:tblBorders></w:tblPr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Khách Hàng</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3400" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Email</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Đơn Hàng</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Tổng Chi Tiêu</w:t></w:r></w:p></w:tc>
      </w:tr>
      ${recipientRowsXml}
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
    filename: proposal.docxFilename || `ke_hoach_email_${proposal.id.slice(0, 8)}.docx`,
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}
