// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { OperationsProposalDto } from "../../application/dtos/ai-operations-response.dto";
import { buildZip } from "../../../marketing/infrastructure/generators/zip-builder";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateOperationsReportDocx(proposal: OperationsProposalDto): {
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

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  // Build table rows XML for inventory items
  let tableRowsXml = `
    <w:tr>
      <w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/><w:shd w:fill="0F172A"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>SKU</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/><w:shd w:fill="0F172A"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Tên Sản Phẩm</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:fill="0F172A"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Tồn Kho</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:fill="0F172A"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Giữ Chỗ</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/><w:shd w:fill="0F172A"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Khả Dụng</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/><w:shd w:fill="0F172A"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Đề Xuất Nhập</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/><w:shd w:fill="0F172A"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Ngân Sách (VND)</w:t></w:r></w:p></w:tc>
    </w:tr>
  `;

  for (const item of proposal.items) {
    const statusLabel =
      item.stockStatus === "critical_low"
        ? "🔴 Thiếu hàng"
        : item.stockStatus === "slow_moving"
          ? "🟡 Tồn lâu"
          : "🟢 Cân bằng";

    tableRowsXml += `
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(item.sku)}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${escapeXml(item.productName)}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${item.currentOnHand}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${item.currentReserved}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${item.availableQuantity} (${statusLabel})</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="0284C7"/></w:rPr><w:t>+${item.recommendedRestockQuantity} đơn vị</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${item.estimatedTotalCostVnd.toLocaleString("vi-VN")} đ</w:t></w:r></w:p></w:tc>
      </w:tr>
    `;
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <!-- Header Banner -->
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="40"/><w:color w:val="0F172A"/></w:rPr><w:t>NOVACOMMERCE — OPENDX COMPANYOS</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="0284C7"/></w:rPr><w:t>BÁO CÁO KIỂM TOÁN VẬN HÀNH &amp; ĐỀ XUẤT BỔ SUNG KHO HÀNG</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:i/><w:color w:val="64748B"/></w:rPr><w:t>Mã báo cáo: OPS-${escapeXml(proposal.id.slice(0, 8).toUpperCase())} | Ngày lập: ${escapeXml(proposal.createdAt.slice(0, 10))}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>

    <!-- Section 1: Context -->
    <w:p>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="0F172A"/></w:rPr><w:t>1. BỐI CẢNH &amp; CHỈ ĐẠO CỦA BAN GIÁM ĐỐC</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>• Yêu cầu chiến lược: </w:t></w:r>
      <w:r><w:t>${escapeXml(proposal.prompt)}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>• Đơn vị thực hiện: </w:t></w:r>
      <w:r><w:t>Phòng Vận hành &amp; Kho vận (Kỹ sư Tồn kho &amp; Điều phối Đơn hàng AI)</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>• Nguồn dữ liệu: </w:t></w:r>
      <w:r><w:t>Trích xuất thời gian thực từ cơ sở dữ liệu PostgreSQL NovaCommerce</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>

    <!-- Section 2: Table -->
    <w:p>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="0F172A"/></w:rPr><w:t>2. BẢNG THỐNG KÊ TỒN KHO &amp; ĐỀ XUẤT BỔ SUNG CHI TIẾT</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="10200" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        </w:tblBorders>
      </w:tblPr>
      ${tableRowsXml}
    </w:tbl>
    <w:p><w:r><w:t></w:t></w:r></w:p>

    <!-- Section 3: Risk Assessment -->
    <w:p>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="0F172A"/></w:rPr><w:t>3. ĐÁNH GIÁ SỨC KHỎE KHO &amp; RỦI RO CHUỖI CUNG ỨNG</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>• Tổng quan sức khỏe kho: </w:t></w:r>
      <w:r><w:t>${escapeXml(proposal.inventoryHealthSummary)}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>• Phân tích rủi ro &amp; Cảnh báo: </w:t></w:r>
      <w:r><w:t>${escapeXml(proposal.riskAssessment)}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>

    <!-- Section 4: Budget & Recommended Action -->
    <w:p>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="0F172A"/></w:rPr><w:t>4. KẾ HOẠCH ĐỀ XUẤT NHẬP HÀNG &amp; DỰ TOÁN NGÂN SÁCH</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>• Tổng số lượng đề xuất nhập thêm: </w:t></w:r>
      <w:r><w:rPr><w:b/><w:color w:val="0284C7"/></w:rPr><w:t>${proposal.totalRestockUnits} sản phẩm</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>• Tổng ngân sách nhập hàng dự kiến: </w:t></w:r>
      <w:r><w:rPr><w:b/><w:color w:val="059669"/></w:rPr><w:t>${proposal.totalEstimatedBudgetVnd.toLocaleString("vi-VN")} VND</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>• Đề xuất hành động: </w:t></w:r>
      <w:r><w:t>${escapeXml(proposal.recommendedAction)}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>

    <!-- Section 5: Signatures -->
    <w:p>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="0F172A"/></w:rPr><w:t>5. XÁC NHẬN &amp; PHÊ DUYỆT</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tblPr><w:tblW w:w="10200" w:type="dxa"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/></w:tblBorders></w:tblPr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="5100" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>NGƯỜI LẬP BÁO CÁO</w:t></w:r></w:p><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>Kỹ sư Tồn kho AI</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="5100" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>CHỦ TỊCH / BAN GIÁM ĐỐC DUYỆT</w:t></w:r></w:p><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>(Ký, ghi rõ họ tên &amp; Phê duyệt trên hệ thống)</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

  const buffer = buildZip([
    { path: "[Content_Types].xml", content: contentTypesXml },
    { path: "_rels/.rels", content: relsXml },
    { path: "word/document.xml", content: documentXml },
  ]);

  return {
    buffer,
    filename: `bao_cao_kiem_toan_kho_van_${proposal.id.slice(0, 8)}.docx`,
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}
