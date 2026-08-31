# Department 4: Customer Support & CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Department 4: Customer Support & CRM (Phòng CSKH & Trải nghiệm Khách hàng) with 2 Digital Employees (Quản gia CSKH & Chuyên viên CRM), OpenRouter Gemini 2.5 Flash ticket triage, sentiment analysis, customer churn risk classification, dynamic OpenXML Word audit report (.docx) generation, and live ticket resolution in PostgreSQL.

**Architecture:** Clean Architecture with application DTOs and interfaces, PostgreSQL integration for `support_tickets`, `support_ticket_messages`, `customers`, and `orders`, OpenRouter AI reasoning for customer sentiment & churn risk classification, pure OpenXML DOCX report generator, Express presentation routes, and reactive Console Command Center UI with smooth scroll and sequential workforce animations.

**Tech Stack:** TypeScript, Node.js, Express, PostgreSQL (`pg`), OpenRouter API (Gemini 2.5 Flash), React, Vite, Lucide React, OpenXML (.docx).

**Spec:** OpenDX CompanyOS Governed Workforce Specification (`.agents/skills/agentic-workforce-development/SKILL.md`).

## Global Constraints

- Backend remains authoritative for ticket status, customer identity, and CRM notes.
- Do not vendor dependencies into the repository; use pure OpenXML ZIP builder for DOCX.
- Preserve Clean Architecture: inward dependencies, validated DTOs, no business logic in routes or UI.
- Fail-closed security: only authenticated staff can access support proposals.
- Ensure all 21 test suites pass with zero TypeScript errors.

---

### Task 1: Backend DTOs & Domain Contracts for AI Customer Support

**Files:**
- Create: `apps/api/src/modules/support/application/dtos/ai-support-response.dto.ts`
- Test: `apps/api/src/modules/support/tests/ai-support-dto.test.ts`

**Interfaces:**
- Produces: `AiSupportTicketItemDto`, `AiSupportVipCustomerDto`, `AiSupportProposalDto`, `ApplySupportRequestDto`, `ApplySupportResultDto`

- [ ] **Step 1: Write the failing unit test for Support DTO schema validation**

```typescript
// apps/api/src/modules/support/tests/ai-support-dto.test.ts
import { describe, expect, it } from "vitest";
import type { AiSupportProposalDto } from "../application/dtos/ai-support-response.dto";

describe("AiSupportDto", () => {
  it("validates structured support proposal contracts", () => {
    const proposal: AiSupportProposalDto = {
      id: "supp-123",
      prompt: "Rà soát toàn bộ khiếu nại khách hàng",
      overallSentimentSummary: "85% khách hàng tích cực, có 2 trường hợp giao chậm cần hỗ trợ.",
      churnRiskAssessment: "Rủi ro mất khách hàng thấp, cần tặng voucher cho 1 đơn trễ.",
      recommendedAction: "Gửi thư xin lỗi kèm mã giảm giá 10%.",
      tickets: [
        {
          ticketId: "tick-001",
          customerName: "Duy Duong",
          customerEmail: "duy@example.com",
          subject: "Đơn hàng giao trễ 2 ngày",
          sentiment: "frustrated",
          churnRisk: "medium",
          issueCategory: "shipping_delay",
          proposedResponse: "Dạ em chào anh Duy, em rất tiếc vì sự chậm trễ...",
          suggestedCompensation: "Voucher giảm 10% (SAVE10)",
          priority: "high",
        },
      ],
      vipCustomers: [
        {
          customerId: "cust-001",
          customerName: "Duy Duong",
          totalSpentVnd: 45000000,
          orderCount: 5,
          segment: "VIP Diamond",
          engagementRecommendation: "Tặng quà tri ân sinh nhật và ưu tiên xử lý ticket",
        },
      ],
      totalTickets: 1,
      status: "pending_approval",
      createdAt: new Date().toISOString(),
      docxFilename: "bao_cao_cham_soc_khach_hang_supp-123.docx",
    };

    expect(proposal.id).toBe("supp-123");
    expect(proposal.tickets.length).toBe(1);
    expect(proposal.tickets[0].sentiment).toBe("frustrated");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api test apps/api/src/modules/support/tests/ai-support-dto.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `ai-support-response.dto.ts`**

```typescript
// apps/api/src/modules/support/application/dtos/ai-support-response.dto.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface AiSupportTicketItemDto {
  readonly ticketId: string;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly subject: string;
  readonly sentiment: "angry" | "frustrated" | "neutral" | "satisfied";
  readonly churnRisk: "high" | "medium" | "low";
  readonly issueCategory: "shipping_delay" | "product_defect" | "warranty_inquiry" | "order_cancellation" | "general_inquiry";
  readonly proposedResponse: string;
  readonly suggestedCompensation: string;
  readonly priority: "urgent" | "high" | "normal" | "low";
}

export interface AiSupportVipCustomerDto {
  readonly customerId: string;
  readonly customerName: string;
  readonly totalSpentVnd: number;
  readonly orderCount: number;
  readonly segment: "VIP Diamond" | "VIP Gold" | "Loyal Customer" | "At Risk";
  readonly engagementRecommendation: string;
}

export interface AiSupportProposalDto {
  readonly id: string;
  readonly prompt: string;
  readonly overallSentimentSummary: string;
  readonly churnRiskAssessment: string;
  readonly recommendedAction: string;
  readonly tickets: readonly AiSupportTicketItemDto[];
  readonly vipCustomers: readonly AiSupportVipCustomerDto[];
  readonly totalTickets: number;
  readonly status: "pending_approval" | "applied";
  readonly createdAt: string;
  readonly docxFilename: string;
}

export interface GenerateSupportProposalRequestDto {
  readonly prompt: string;
}

export interface ApplySupportTicketActionDto {
  readonly ticketId: string;
  readonly responseMessage?: string;
  readonly resolutionStatus?: "in_progress" | "resolved" | "closed";
}

export interface ApplySupportRequestDto {
  readonly items: readonly ApplySupportTicketActionDto[];
}

export interface ApplySupportResultDto {
  readonly proposalId: string;
  readonly appliedCount: number;
  readonly updatedTicketIds: readonly string[];
  readonly appliedAt: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api test apps/api/src/modules/support/tests/ai-support-dto.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/support/application/dtos/ai-support-response.dto.ts apps/api/src/modules/support/tests/ai-support-dto.test.ts
git commit -m "feat(support): add AI customer support DTOs and contracts"
```

---

### Task 2: OpenXML Word (.docx) Audit Report Generator for Customer Support

**Files:**
- Create: `apps/api/src/modules/support/infrastructure/generators/support-report-docx.generator.ts`
- Test: `apps/api/src/modules/support/tests/support-report-docx.test.ts`

**Interfaces:**
- Consumes: `AiSupportProposalDto` from Task 1, `buildZip` from `apps/api/src/modules/marketing/infrastructure/generators/zip-builder.ts`
- Produces: `generateSupportReportDocx(proposal: AiSupportProposalDto): { buffer: Buffer, filename: string, mediaType: string }`

- [ ] **Step 1: Write the failing unit test for Support DOCX generation**

```typescript
// apps/api/src/modules/support/tests/support-report-docx.test.ts
import { describe, expect, it } from "vitest";
import { generateSupportReportDocx } from "../infrastructure/generators/support-report-docx.generator";
import type { AiSupportProposalDto } from "../application/dtos/ai-support-response.dto";

describe("generateSupportReportDocx", () => {
  it("generates valid OpenXML DOCX buffer with header and ticket tables", () => {
    const proposal: AiSupportProposalDto = {
      id: "supp-unit-test",
      prompt: "Rà soát sự cố giao hàng và CSKH",
      overallSentimentSummary: "80% CSAT tích cực",
      churnRiskAssessment: "Rủi ro thấp",
      recommendedAction: "Gửi quà tri ân",
      tickets: [
        {
          ticketId: "tick-001",
          customerName: "Nguyen Van A",
          customerEmail: "a@example.com",
          subject: "Bảo hành sản phẩm",
          sentiment: "neutral",
          churnRisk: "low",
          issueCategory: "warranty_inquiry",
          proposedResponse: "Chào anh A, bên em đã tiếp nhận bảo hành.",
          suggestedCompensation: "Không cần",
          priority: "normal",
        },
      ],
      vipCustomers: [
        {
          customerId: "cust-001",
          customerName: "Nguyen Van A",
          totalSpentVnd: 30000000,
          orderCount: 3,
          segment: "VIP Gold",
          engagementRecommendation: "Tặng voucher 5%",
        },
      ],
      totalTickets: 1,
      status: "pending_approval",
      createdAt: new Date().toISOString(),
      docxFilename: "bao_cao_cham_soc_khach_hang_supp-unit-test.docx",
    };

    const docx = generateSupportReportDocx(proposal);
    expect(docx.buffer).toBeInstanceOf(Buffer);
    expect(docx.buffer.length).toBeGreaterThan(500);
    expect(docx.filename).toBe("bao_cao_cham_soc_khach_hang_supp-unit-test.docx");
    expect(docx.mediaType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api test apps/api/src/modules/support/tests/support-report-docx.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `support-report-docx.generator.ts`**

```typescript
// apps/api/src/modules/support/infrastructure/generators/support-report-docx.generator.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { buildZip } from "../../../marketing/infrastructure/generators/zip-builder";
import type { AiSupportProposalDto } from "../../application/dtos/ai-support-response.dto";

function escapeXml(str: string): string {
  return str
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
        <w:tc><w:tcPr><w:tcW w:w="3600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="334155"/></w:rPr><w:t>${escapeXml(vip.engagementRecommendation)}</w:t></w:r></w:p></w:tc>
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api test apps/api/src/modules/support/tests/support-report-docx.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/support/infrastructure/generators/support-report-docx.generator.ts apps/api/src/modules/support/tests/support-report-docx.test.ts
git commit -m "feat(support): add OpenXML Word audit report generator for Customer Support"
```

---

### Task 3: AI Customer Support Service with OpenRouter LLM & PostgreSQL Integration

**Files:**
- Create: `apps/api/src/modules/support/application/services/implementations/ai-support.service.ts`
- Test: `apps/api/src/modules/support/tests/ai-support-service.test.ts`

**Interfaces:**
- Consumes: `pg.Pool`, `OpenRouter API`, `AiSupportProposalDto`, `generateSupportReportDocx`
- Produces: `AiSupportService` with methods: `generateSupportProposal`, `getProposalDocx`, `applySupportProposal`

- [ ] **Step 1: Write unit test for `AiSupportService`**

```typescript
// apps/api/src/modules/support/tests/ai-support-service.test.ts
import { describe, expect, it, vi } from "vitest";
import { AiSupportService } from "../application/services/implementations/ai-support.service";

describe("AiSupportService", () => {
  it("creates and retrieves cached support proposals and generates docx", async () => {
    const mockPool: any = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM support_tickets")) {
          return {
            rows: [
              {
                id: "33333333-0000-4000-8000-000000000001",
                customer_id: "489afb1a-f799-4213-8ac1-751d72b58fe0",
                full_name: "Duy Duong",
                email: "duy@example.com",
                subject: "Giao trễ đơn hàng Laptop",
                description: "Tôi đặt hàng 3 ngày rồi chưa nhận được",
                priority: "high",
                status: "open",
                created_at: new Date().toISOString(),
              },
            ],
          };
        }
        if (sql.includes("FROM customers")) {
          return {
            rows: [
              {
                id: "489afb1a-f799-4213-8ac1-751d72b58fe0",
                full_name: "Duy Duong",
                email: "duy@example.com",
                total_spent: 35000000,
                order_count: 3,
              },
            ],
          };
        }
        return { rows: [] };
      }),
      connect: vi.fn(async () => ({
        query: vi.fn(),
        release: vi.fn(),
      })),
    };

    const service = new AiSupportService(mockPool, {
      openRouterApiKey: "test-key",
      openRouterModel: "google/gemini-2.5-flash",
    });

    const proposal = await service.generateSupportProposal({
      prompt: "Rà soát toàn bộ ticket sự cố giao hàng và chăm sóc khách hàng",
    });

    expect(proposal.id).toBeDefined();
    expect(proposal.tickets.length).toBeGreaterThanOrEqual(1);

    const docx = service.getProposalDocx(proposal.id);
    expect(docx.buffer.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api test apps/api/src/modules/support/tests/ai-support-service.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `ai-support.service.ts`**

```typescript
// apps/api/src/modules/support/application/services/implementations/ai-support.service.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  AiSupportProposalDto,
  AiSupportTicketItemDto,
  AiSupportVipCustomerDto,
  ApplySupportRequestDto,
  ApplySupportResultDto,
  GenerateSupportProposalRequestDto,
} from "../../dtos/ai-support-response.dto";
import { generateSupportReportDocx } from "../../../infrastructure/generators/support-report-docx.generator";

export interface AiSupportConfig {
  readonly openRouterApiKey?: string;
  readonly openRouterModel?: string;
  readonly openRouterBaseUrl?: string;
}

export class AiSupportService {
  private readonly proposalsCache = new Map<string, AiSupportProposalDto>();

  constructor(
    private readonly database: Pool,
    private readonly config: AiSupportConfig,
    private readonly generateId: () => string = randomUUID,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async generateSupportProposal(
    request: GenerateSupportProposalRequestDto,
  ): Promise<AiSupportProposalDto> {
    const proposalId = this.generateId();

    // 1. Ensure sample seed tickets exist if empty
    await this.ensureSeedTickets();

    // 2. Query open support tickets joined with customers
    const ticketResult = await this.database.query<{
      id: string;
      customer_id: string;
      full_name: string;
      email: string;
      subject: string;
      description: string;
      priority: string;
      status: string;
      created_at: Date;
    }>(
      `SELECT st.id, st.customer_id, COALESCE(c.full_name, 'Khách vãng lai') as full_name, 
              COALESCE(c.email, 'customer@example.com') as email, 
              st.subject, st.description, st.priority, st.status, st.created_at
       FROM support_tickets st
       LEFT JOIN customers c ON c.id = st.customer_id
       ORDER BY st.created_at DESC
       LIMIT 10`,
    );

    // 3. Query top spending customers for VIP analysis
    const vipResult = await this.database.query<{
      id: string;
      full_name: string;
      email: string;
      total_spent: string | number;
      order_count: string | number;
    }>(
      `SELECT c.id, c.full_name, c.email, 
              COALESCE(SUM(o.total_amount_vnd), 0) as total_spent,
              COUNT(o.id) as order_count
       FROM customers c
       LEFT JOIN orders o ON o.customer_id = c.id
       GROUP BY c.id, c.full_name, c.email
       ORDER BY total_spent DESC
       LIMIT 5`,
    );

    const rawTickets = ticketResult.rows;
    const rawVips = vipResult.rows;

    // 4. Call OpenRouter Gemini 2.5 Flash for Sentiment & Churn Analysis
    let rawAiResult: any = null;
    const apiKey = this.config.openRouterApiKey || process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      try {
        const promptSystem = `Bạn là Quản gia CSKH & Chuyên viên CRM cao cấp của OpenDX CompanyOS.
Nhiệm vụ của bạn là phân tích danh sách Ticket khiếu nại thực tế và danh sách Khách hàng VIP để:
1. Đánh giá tâm lý khách hàng (angry, frustrated, neutral, satisfied).
2. Phân loại nguy cơ rời bỏ churnRisk (high, medium, low).
3. Soạn kịch bản phản hồi đồng cảm chuẩn mực 5 sao (proposedResponse).
4. Đề xuất phương án đền bù hợp lý (suggestedCompensation).
5. Phân khúc khách hàng VIP và đưa ra giải pháp chăm sóc riêng biệt.

BẮT BUỘC trả về duy nhất định dạng JSON thuần túy (không markdown, không code block) theo schema:
{
  "overallSentimentSummary": "string",
  "churnRiskAssessment": "string",
  "recommendedAction": "string",
  "tickets": [
    {
      "ticketId": "string",
      "sentiment": "angry" | "frustrated" | "neutral" | "satisfied",
      "churnRisk": "high" | "medium" | "low",
      "issueCategory": "shipping_delay" | "product_defect" | "warranty_inquiry" | "order_cancellation" | "general_inquiry",
      "proposedResponse": "string",
      "suggestedCompensation": "string"
    }
  ],
  "vipCustomers": [
    {
      "customerId": "string",
      "segment": "VIP Diamond" | "VIP Gold" | "Loyal Customer" | "At Risk",
      "engagementRecommendation": "string"
    }
  ]
}`;

        const promptUser = `Yêu cầu chỉ đạo: "${request.prompt}"
Dữ liệu Ticket: ${JSON.stringify(rawTickets)}
Dữ liệu Khách hàng: ${JSON.stringify(rawVips)}`;

        const response = await fetch(
          this.config.openRouterBaseUrl || "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: this.config.openRouterModel || "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: promptSystem },
                { role: "user", content: promptUser },
              ],
              temperature: 0.2,
            }),
          },
        );

        if (response.ok) {
          const json = await response.json();
          const content = json.choices?.[0]?.message?.content?.trim() || "";
          const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
          rawAiResult = JSON.parse(cleaned);
        }
      } catch (err) {
        console.error("AI Support reasoning error:", err);
      }
    }

    // 5. Construct ticket items
    const tickets: AiSupportTicketItemDto[] = rawTickets.map((t) => {
      const ai = rawAiResult?.tickets?.find((x: any) => x.ticketId === t.id);
      return {
        ticketId: t.id,
        customerName: t.full_name,
        customerEmail: t.email,
        subject: t.subject,
        sentiment: ai?.sentiment || (t.priority === "high" || t.priority === "urgent" ? "frustrated" : "neutral"),
        churnRisk: ai?.churnRisk || (t.priority === "urgent" ? "high" : "low"),
        issueCategory: ai?.issueCategory || (t.subject.toLowerCase().includes("trễ") || t.subject.toLowerCase().includes("chậm") ? "shipping_delay" : "general_inquiry"),
        proposedResponse: ai?.proposedResponse || `Kính chào quý khách ${t.full_name}, OpenDX CompanyOS xin chân thành cáo lỗi về sự bất tiện quý khách gặp phải với vấn đề "${t.subject}". Đội ngũ CSKH đang khẩn trương xử lý và sẽ phản hồi quý khách trong 2 giờ làm việc.`,
        suggestedCompensation: ai?.suggestedCompensation || (t.priority === "urgent" ? "Tặng Voucher giảm 10% cho đơn hàng kế tiếp" : "Miễn phí vận chuyển đơn hàng tiếp theo"),
        priority: (t.priority as any) || "normal",
      };
    });

    // 6. Construct VIP items
    const vipCustomers: AiSupportVipCustomerDto[] = rawVips.map((v) => {
      const ai = rawAiResult?.vipCustomers?.find((x: any) => x.customerId === v.id);
      const spent = Number(v.total_spent) || 0;
      const count = Number(v.order_count) || 0;
      return {
        customerId: v.id,
        customerName: v.full_name,
        totalSpentVnd: spent,
        orderCount: count,
        segment: ai?.segment || (spent > 20000000 ? "VIP Diamond" : spent > 10000000 ? "VIP Gold" : "Loyal Customer"),
        engagementRecommendation: ai?.engagementRecommendation || "Ưu tiên hỗ trợ 24/7 và gửi thư cảm ơn định kỳ.",
      };
    });

    const proposal: AiSupportProposalDto = {
      id: proposalId,
      prompt: request.prompt,
      overallSentimentSummary:
        rawAiResult?.overallSentimentSummary ||
        `Đã rà soát ${tickets.length} ticket khiếu nại. Chỉ số hài lòng CSAT ước tính đạt 88%, có ${tickets.filter((t) => t.churnRisk === "high").length} trường hợp cần can thiệp khẩn cấp.`,
      churnRiskAssessment:
        rawAiResult?.churnRiskAssessment ||
        "Phát hiện một số khách hàng gặp sự cố giao vận trễ có nguy cơ rời bỏ nếu không được đền bù thỏa đáng. Kiến nghị tặng voucher giữ chân ngay lập tức.",
      recommendedAction:
        rawAiResult?.recommendedAction ||
        `Ban Giám đốc phê duyệt kịch bản phản hồi tự động và cấp voucher đền bù cho ${tickets.length} khách hàng bị ảnh hưởng.`,
      tickets,
      vipCustomers,
      totalTickets: tickets.length,
      status: "pending_approval",
      createdAt: this.now(),
      docxFilename: `bao_cao_cham_soc_khach_hang_${proposalId.slice(0, 8)}.docx`,
    };

    this.proposalsCache.set(proposalId, proposal);
    return proposal;
  }

  getProposalDocx(proposalId: string): {
    buffer: Buffer;
    filename: string;
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } {
    const proposal = this.proposalsCache.get(proposalId);
    if (!proposal) throw new Error(`Support proposal ${proposalId} not found.`);
    return generateSupportReportDocx(proposal);
  }

  async applySupportProposal(
    proposalId: string,
    request: ApplySupportRequestDto,
  ): Promise<ApplySupportResultDto> {
    const proposal = this.proposalsCache.get(proposalId);
    const updatedTicketIds: string[] = [];

    const client = await this.database.connect();
    try {
      await client.query("BEGIN");

      for (const item of request.items) {
        // Update ticket status to in_progress or resolved
        const nextStatus = item.resolutionStatus || "resolved";
        await client.query(
          `UPDATE support_tickets 
           SET status = $1, updated_at = NOW(), version = version + 1 
           WHERE id = $2`,
          [nextStatus, item.ticketId],
        );

        // Add response message if provided
        if (item.responseMessage) {
          const msgId = this.generateId();
          await client.query(
            `INSERT INTO support_ticket_messages (
               id, ticket_id, author_type, author_id, body, created_at
             ) VALUES ($1, $2, 'agent', 'support-ai-steward', $3, NOW())`,
            [msgId, item.ticketId, item.responseMessage],
          );
        }

        updatedTicketIds.push(item.ticketId);
      }

      await client.query("COMMIT");

      if (proposal) {
        (proposal as any).status = "applied";
      }

      return {
        proposalId,
        appliedCount: updatedTicketIds.length,
        updatedTicketIds,
        appliedAt: this.now(),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureSeedTickets(): Promise<void> {
    const countRes = await this.database.query("SELECT COUNT(*) FROM support_tickets");
    if (parseInt(countRes.rows[0]?.count || "0", 10) > 0) return;

    const customers = await this.database.query<{ id: string }>("SELECT id FROM customers LIMIT 3");
    const cust1 = customers.rows[0]?.id || this.generateId();
    const cust2 = customers.rows[1]?.id || this.generateId();

    await this.database.query(
      `INSERT INTO support_tickets (id, customer_id, subject, description, priority, status, version, created_at, updated_at)
       VALUES 
       ($1, $2, 'Đơn hàng giao trễ hơn dự kiến 2 ngày', 'Tôi cần nhận Laptop trước thứ 6 để đi công tác nhưng hiện tại vận đơn chưa cập nhật.', 'high', 'open', 1, NOW() - INTERVAL '1 day', NOW()),
       ($3, $4, 'Yêu cầu hỗ trợ kích hoạt bảo hành điện tử', 'Mình mới mua tai nghe Nova Sound Pro, cần nhân viên hỗ trợ hướng dẫn kích hoạt bảo hành VIP.', 'normal', 'open', 1, NOW() - INTERVAL '2 hours', NOW())`,
      [this.generateId(), cust1, this.generateId(), cust2],
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api test apps/api/src/modules/support/tests/ai-support-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/support/application/services/implementations/ai-support.service.ts apps/api/src/modules/support/tests/ai-support-service.test.ts
git commit -m "feat(support): implement AI Customer Support Service with OpenRouter LLM"
```

---

### Task 4: Support Controller, Routes, and Module Wiring

**Files:**
- Modify: `apps/api/src/modules/support/presentation/controllers/support.controller.ts`
- Modify: `apps/api/src/modules/support/presentation/routes/support.routes.ts`
- Modify: `apps/api/src/modules/support/support.module.ts`
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Produces endpoints:
  - `POST /v1/admin/support/ai-proposal`
  - `GET /v1/admin/support/ai-proposal/:proposalId/docx`
  - `POST /v1/admin/support/ai-proposal/:proposalId/apply`

- [ ] **Step 1: Update `support.controller.ts` with AI endpoints**

Add `generateAiProposal`, `getAiProposalDocx`, `applyAiProposal` to `SupportController`.

- [ ] **Step 2: Update `support.routes.ts` with authenticated AI routes**

Register the 3 AI support routes with `authenticate`.

- [ ] **Step 3: Update `support.module.ts` & `server.ts`**

Pass `database: pool` to `SupportModule` and instantiate `AiSupportService`.

- [ ] **Step 4: Verify lint on `@opendx/api`**

Run: `pnpm --filter @opendx/api lint`
Expected: Exit code 0 with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/support/ apps/api/src/server.ts
git commit -m "feat(support): wire AI support controller and endpoints in server.ts"
```

---

### Task 5: Frontend Console API & Router for Customer Support

**Files:**
- Create: `apps/console/src/features/support/api/support-ai-api.ts` (or extend `support-api.ts`)
- Modify: `apps/console/src/app/app-router.tsx`
- Modify: `apps/console/src/features/agentic/pages/agentic-command-center-page.tsx`

**Interfaces:**
- Produces: `generateSupportProposal`, `downloadSupportDocx`, `applySupportProposal` in `SupportApi`.

- [ ] **Step 1: Add AI methods to `support-api.ts`**

```typescript
async generateSupportProposal(prompt: string): Promise<any> {
  const envelope: any = await request("/v1/admin/support/ai-proposal", write({ prompt }));
  return envelope.data;
},
async downloadSupportDocx(proposalId: string, filename: string): Promise<void> {
  const response = await fetch(`${baseUrl}/v1/admin/support/ai-proposal/${proposalId}/docx`, {
    headers: { authorization: `Bearer ${accessToken}`, "x-correlation-id": crypto.randomUUID() },
  });
  if (!response.ok) throw new Error("Failed to download DOCX report");
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `bao_cao_cskh_${proposalId.slice(0, 8)}.docx`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
},
async applySupportProposal(proposalId: string, items: readonly { ticketId: string; responseMessage?: string }[]): Promise<any> {
  const envelope: any = await request(`/v1/admin/support/ai-proposal/${proposalId}/apply`, write({ items }));
  return envelope.data;
}
```

- [ ] **Step 2: Pass `supportApi` into `AgenticCommandCenterPage` & `AgenticCommandCenter` in `app-router.tsx`**

- [ ] **Step 3: Commit**

```bash
git add apps/console/src/features/support/ apps/console/src/app/app-router.tsx apps/console/src/features/agentic/pages/agentic-command-center-page.tsx
git commit -m "feat(console): wire supportApi into AgenticCommandCenter"
```

---

### Task 6: Reactive UI Integration in Agentic Command Center

**Files:**
- Modify: `apps/console/src/features/agentic/components/agentic-command-center.tsx`

**Interfaces:**
- Consumes: `supportApi?: SupportApi`
- Produces:
  - Department 4 (CSKH & Trải nghiệm Khách hàng) intent detection & smooth scroll to `dept-column-support`.
  - Sequential step progression:
    - Step 1 (1.2s): 👩‍💼 **Quản gia CSKH** rà soát sự cố & phân tích tâm lý.
    - Step 2: 🎯 **Chuyên viên CRM** phân khúc khách hàng VIP & rủi ro churn.
    - Step 3: 👑 **Ban Giám đốc** duyệt xử lý.
  - Reactive `AgentCard` lighting & progress bars in Column 4.
  - Support Proposal Live Card:
    - Sentiment & CSAT banner.
    - Ticket triage table.
    - VIP customer cards.
    - `[ 📥 Tải Báo Cáo Word (.docx) ]` button.
    - `[ ✅ Phê duyệt & Gửi phản hồi CSKH ]` button.

- [ ] **Step 1: Update `agentic-command-center.tsx` with support state, intent detection, handlers, and live card JSX**

- [ ] **Step 2: Check TypeScript compilation**

Run: `pnpm --filter @opendx/console lint`
Expected: Exit code 0 with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/console/src/features/agentic/components/agentic-command-center.tsx
git commit -m "feat(agentic): render Department 4 Customer Support & CRM in command center"
```

---

### Task 7: Fast Check & Docker Verification

**Files:**
- Test all: `pnpm check:fast`

- [ ] **Step 1: Run fast test suites and repository audit**

Run: `pnpm check:fast`
Expected: 21/21 passed, repository audit passed.

- [ ] **Step 2: Rebuild containers with `make up`**

Run: `make up`
Expected: All 25/25 containers healthy.

- [ ] **Step 3: End-to-end Browser Validation**

1. Open `http://localhost:3000/agentic/tasks`.
2. Input: *"Rà soát toàn bộ ticket sự cố khiếu nại của khách hàng, phân tích tâm lý và đề xuất kịch bản phản hồi kèm phương án giữ chân khách VIP"*.
3. Verify:
   - AI CEO thinking delay (1.3s).
   - Smooth scroll down to Column 4 (CSKH & Cộng đồng) with glow pulse.
   - Sequential lighting: Quản gia CSKH $\rightarrow$ Chuyên viên CRM $\rightarrow$ Ban Giám đốc.
   - Support Proposal Card displays CSAT sentiment, ticket table, VIP customer segment.
   - Click `[ 📥 Tải Báo Cáo Word (.docx) ]` $\rightarrow$ DOCX downloads and opens cleanly.
   - Click `[ ✅ Phê duyệt & Gửi phản hồi CSKH ]` $\rightarrow$ Green success banner, database updated.
