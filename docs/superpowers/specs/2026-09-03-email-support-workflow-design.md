<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Design Specification: Two-Way Governed Email Support Workflow

- **Date**: 2026-09-03
- **Author**: Antigravity & OpenDX CompanyOS Team
- **Department**: Customer Support & CRM (Phòng CSKH & Trải nghiệm Khách hàng)
- **Status**: Approved (Brainstorming Phase Complete)

---

## 1. Overview & Business Goals

OpenDX CompanyOS includes governed Digital Employees for customer support:
- **Quản gia CSKH (Support Steward)**: Analyzes CSAT, sentiment, issue category, drafts empathetic responses, and proposes vouchers.
- **Chuyên viên CRM (CRM Specialist)**: Assesses churn risk, customer lifetime value, and retention strategies.

Currently, customer support proposals resolve tickets in PostgreSQL and save messages into `support_ticket_messages`, but do not receive inbound emails or send outbound emails to customer mailboxes.

This specification designs the **Two-Way Governed Email Support Workflow**:
1. **Inbound Email Reception**: Ingests incoming customer emails via a public webhook endpoint (`POST /v1/public/support/email/inbound`), automatically identifies or creates customer profiles, generates support tickets, and triggers AI analysis.
2. **AI Analysis & Automation**: Automatically analyzes ticket urgency, sentiment, and churn risk using Gemini 2.5 Flash via OpenRouter, drafting an empathetic 5-star resolution and compensation voucher.
3. **Governed Human Approval**: The proposal appears in the Agentic Command Center with complete context. The human manager reviews and approves.
4. **Outbound SMTP Email Dispatching**: Upon human approval, the system activates the voucher in the `promotions` table, renders a branded responsive HTML email template, and dispatches the email via SMTP (`smtp.gmail.com:587` with verified credentials).

---

## 2. Clean Architecture & Modular Boundaries

The implementation strictly follows OpenDX CompanyOS Clean Architecture:

```
apps/api/src/modules/support/
├── domain/
│   └── entities/ (SupportTicket, TicketMessage, SupportCustomer)
├── application/
│   ├── ports/
│   │   └── email-dispatcher.port.ts  <-- Inward-facing port
│   ├── dtos/
│   │   ├── inbound-email.dto.ts
│   │   └── outbound-email.dto.ts
│   └── services/
│       ├── interfaces/
│       │   └── email-support.service.ts
│       └── implementations/
│           ├── ai-support.service.ts (Enhanced with email dispatch)
│           └── email-support.service.ts
├── infrastructure/
│   ├── adapters/
│   │   ├── smtp-email-dispatcher.adapter.ts    <-- SMTP using nodemailer
│   │   └── simulated-email-dispatcher.adapter.ts <-- Test & offline fallback
│   └── templates/
│       └── support-resolution-email.template.ts <-- Branded HTML email template
└── presentation/
    ├── controllers/
    │   └── support-inbound-email.controller.ts
    └── routers/
        └── support-inbound-email.router.ts
```

### Inward Dependencies Rule
- `domain` has zero external dependencies.
- `application` defines `EmailDispatcherPort` interface and DTOs.
- `infrastructure` implements `EmailDispatcherPort` via `SmtpEmailDispatcherAdapter` or `SimulatedEmailDispatcherAdapter`.
- `presentation` validates untrusted HTTP requests and delegates to application services.

---

## 3. Inbound Email Flow (`POST /v1/public/support/email/inbound`)

### 3.1 Endpoint Contract
- **Method**: `POST`
- **Path**: `/v1/public/support/email/inbound`
- **Request Body (JSON)**:
  ```json
  {
    "from": "customer@example.com",
    "name": "Nguyễn Văn A",
    "subject": "Khiếu nại giao hàng trễ cho đơn hàng #ORD-1002",
    "body": "Đơn hàng của tôi đặt từ 3 ngày trước nhưng đến nay vẫn chưa thấy giao, xin vui lòng hỗ trợ kiểm tra hoặc hủy đơn giúp tôi.",
    "orderId": "ORD-1002"
  }
  ```
- **Validation**:
  - `from`: Valid email format (RFC 5322), required.
  - `subject`: String, 1-255 characters, required.
  - `body`: String, 1-10,000 characters, required.
  - `orderId`: Optional string.

### 3.2 Inbound Processing Steps
1. Sanitize input fields.
2. Query `customers` table by email:
   - If customer exists: retrieve `customer.id` and name.
   - If customer does not exist: create a new customer record with `full_name`, `email`, status `active`.
3. Insert record into `support_tickets`:
   - `id`: UUIDv4
   - `customer_id`: customer.id
   - `order_id`: orderId (if provided and valid)
   - `subject`: sanitized subject
   - `description`: sanitized body
   - `priority`: inferred (keyword heuristic + initial "normal" or "high" if "khẩn", "gấp", "trễ", "hỏng")
   - `status`: "new"
   - `created_by_id`: "customer"
4. Trigger immediate AI evaluation:
   - Run `AiSupportService.generateSupportProposal` with targeted prompt for the new ticket.
   - Save proposal in cache ready for manager approval.
5. Return HTTP 201 Created with `{ ticketId, customerId, status: "received", proposalId }`.

---

## 4. Outbound Email Dispatcher (`EmailDispatcherPort`)

### 4.1 Port Definition
```typescript
export interface SendEmailInput {
  readonly to: string;
  readonly toName?: string;
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody: string;
  readonly ticketId: string;
  readonly voucherCode?: string;
}

export interface SendEmailResult {
  readonly messageId: string;
  readonly delivered: boolean;
  readonly provider: "smtp" | "simulated";
  readonly timestamp: string;
}

export interface EmailDispatcherPort {
  sendSupportResolutionEmail(input: SendEmailInput): Promise<SendEmailResult>;
}
```

### 4.2 SMTP Adapter Implementation (`SmtpEmailDispatcherAdapter`)
- Uses `nodemailer` transport.
- Configured from environment variables:
  - `SUPPORT_EMAIL_MODE`: "live" | "simulation"
  - `SUPPORT_SMTP_HOST`: "smtp.gmail.com"
  - `SUPPORT_SMTP_PORT`: 587
  - `SUPPORT_SMTP_SECURE`: false
  - `SUPPORT_SMTP_USER`: "nguyenphuongdmx2450@gmail.com"
  - `SUPPORT_SMTP_PASS`: App Password
  - `SUPPORT_EMAIL_FROM`: "NovaCommerce CSKH <nguyenphuongdmx2450@gmail.com>"
- If `SUPPORT_EMAIL_MODE !== "live"` or credentials missing: falls back cleanly to `SimulatedEmailDispatcherAdapter` which records outgoing emails in-memory and logs them without throwing or crashing.

### 4.3 Branded HTML Email Template
The email includes:
- NovaCommerce header with brand logo & styling.
- Personalized greeting to the customer.
- Ticket ID reference (`#TICK-...`).
- Empathetic resolution explanation drafted by AI Support Steward.
- Prominent voucher box with copyable promo code (e.g. `CSKH10-XXXX`), discount percentage/amount, and expiration notice.
- Professional signature with hotline and contact channels.

---

## 5. Governed Human Approval & Dispatch Flow

1. Manager opens **Agentic Command Center** -> **Chăm sóc Khách hàng & CRM** tab.
2. Inbound email tickets are displayed alongside existing support tickets with AI sentiment badges, churn risk indicators, and proposed responses.
3. Manager clicks **"Phê duyệt & Gửi Email phản hồi"** (or individual/bulk approve).
4. Backend `applySupportProposal`:
   - Enters PostgreSQL transaction.
   - Updates `support_tickets` status to `resolved` and stops SLA timer.
   - Inserts promotion record into `promotions` table.
   - Inserts response message into `support_ticket_messages`.
   - Records audit event in `support_ticket_events`.
   - Commits database transaction.
5. After transaction commit:
   - Calls `EmailDispatcherPort.sendSupportResolutionEmail(...)` for each customer email.
   - Captures delivery status and message ID.
6. Returns resolution receipt to Console UI.

---

## 6. Testing Strategy

1. **Unit Tests**:
   - `smtp-email-dispatcher.adapter.test.ts`: Verify SMTP transport creation, HTML/text content generation, fallback on error, and simulated delivery.
   - `support-inbound-email.controller.test.ts`: Verify validation of invalid email, oversized body, customer creation/linkage, and ticket creation.
   - `ai-support.service.test.ts`: Verify email dispatch invocation upon approval and voucher attachment.
2. **Integration Tests**:
   - Full inbound -> AI draft -> approval -> outbound email flow using mocked SMTP transport and real database transaction.
3. **Console Tests**:
   - Verify Command Center button label, modal review, and success notifications.

---

## 7. Open-Source & Packaging Compliance

- Add `nodemailer` and `@types/nodemailer` to `apps/api/package.json`.
- Document new dependencies and rationale in `docs/dependencies.md`.
- No credentials checked into source control; all sensitive settings stay in `.env`.
- SPDX headers and Apache-2.0 license tags on all new files.
