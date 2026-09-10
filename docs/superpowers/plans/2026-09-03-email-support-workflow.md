# Two-Way Governed Email Support Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete two-way governed email customer support workflow in OpenDX CompanyOS with inbound webhook ticket ingestion, automated AI sentiment and churn analysis with Gemini 2.5 Flash, and governed outbound SMTP email dispatching with compensation vouchers upon manager approval.

**Architecture:** Strictly follow Clean Architecture by defining an inward-facing `EmailDispatcherPort` in the Application layer, implementing `SmtpEmailDispatcherAdapter` (using `nodemailer` with Gmail SMTP) and `SimulatedEmailDispatcherAdapter` in Infrastructure, creating a public inbound webhook endpoint `POST /v1/public/support/email/inbound` in Presentation, and enhancing `AiSupportService` to trigger email dispatch and voucher generation upon manager approval in the Agentic Command Center.

**Tech Stack:** TypeScript, Node.js, Express, PostgreSQL, OpenRouter (Gemini 2.5 Flash), `nodemailer`, Vitest, React (Console).

**Spec:** `docs/superpowers/specs/2026-09-03-email-support-workflow-design.md`

## Global Constraints

- SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
- SPDX-License-Identifier: Apache-2.0
- Clean Architecture: Inward dependencies only; zero business logic in controllers or transport adapters.
- Build & validation commands must remain runnable from source (`pnpm check`, `git diff --check`, `pnpm audit:repo`).
- Sensitive credentials remain in `.env`; never commit secrets.
- Maintain fallback simulation mode when SMTP credentials are not configured or in unit test environments.

---

### Task 1: Add `nodemailer` Dependency and Update Documentation

**Files:**
- Modify: `apps/api/package.json`
- Modify: `docs/dependencies.md`

**Interfaces:**
- Consumes: Standard npm package `nodemailer` and `@types/nodemailer`.
- Produces: Transpiled and runnable nodemailer imports in `@opendx/api`.

- [ ] **Step 1: Install `nodemailer` and `@types/nodemailer`**

Run:
```bash
pnpm --filter @opendx/api add nodemailer
pnpm --filter @opendx/api add -D @types/nodemailer
```

- [ ] **Step 2: Document dependency in `docs/dependencies.md`**

Add `nodemailer` under Production Dependencies with license (MIT), purpose (SMTP email dispatch for Customer Support department), and approval rationale.

- [ ] **Step 3: Verify repo audit and build**

Run:
```bash
pnpm audit:repo && pnpm audit:dependencies
```
Expected: PASS

- [ ] **Step 4: Commit Task 1**

```bash
git add apps/api/package.json pnpm-lock.yaml docs/dependencies.md
git commit -m "chore(support): add nodemailer dependency and update dependency documentation"
```

---

### Task 2: Define `EmailDispatcherPort` and Branded HTML Email Template

**Files:**
- Create: `apps/api/src/modules/support/application/ports/email-dispatcher.port.ts`
- Create: `apps/api/src/modules/support/infrastructure/templates/support-resolution-email.template.ts`
- Create: `apps/api/src/modules/support/infrastructure/templates/support-resolution-email.template.test.ts`

**Interfaces:**
- Produces: `EmailDispatcherPort`, `SendEmailInput`, `SendEmailResult`, `renderSupportResolutionEmailHtml()`.

- [ ] **Step 1: Write the failing test for email template rendering**

Create `apps/api/src/modules/support/infrastructure/templates/support-resolution-email.template.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { renderSupportResolutionEmailHtml } from "./support-resolution-email.template";

describe("renderSupportResolutionEmailHtml", () => {
  it("renders customer name, ticket subject, proposed response, and voucher code", () => {
    const html = renderSupportResolutionEmailHtml({
      customerName: "Nguyễn Văn A",
      ticketId: "tick-123",
      subject: "Giao hàng trễ",
      responseMessage: "Chúng tôi xin lỗi vì sự bất tiện này.",
      voucherCode: "CSKH10-ABCD",
    });

    expect(html).toContain("Nguyễn Văn A");
    expect(html).toContain("Giao hàng trễ");
    expect(html).toContain("Chúng tôi xin lỗi vì sự bất tiện này.");
    expect(html).toContain("CSKH10-ABCD");
    expect(html).toContain("NovaCommerce");
  });

  it("renders cleanly when voucher code is not provided", () => {
    const html = renderSupportResolutionEmailHtml({
      customerName: "Trần Thị B",
      ticketId: "tick-456",
      subject: "Hỏi thông tin",
      responseMessage: "Thông tin đơn hàng đã được cập nhật.",
    });

    expect(html).toContain("Trần Thị B");
    expect(html).not.toContain("CSKH10-ABCD");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/support/infrastructure/templates/support-resolution-email.template.test.ts`
Expected: FAIL (file not found)

- [ ] **Step 3: Create port and template implementation**

Create `apps/api/src/modules/support/application/ports/email-dispatcher.port.ts`:
```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

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

Create `apps/api/src/modules/support/infrastructure/templates/support-resolution-email.template.ts`:
```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface SupportResolutionEmailTemplateInput {
  readonly customerName: string;
  readonly ticketId: string;
  readonly subject: string;
  readonly responseMessage: string;
  readonly voucherCode?: string;
}

export function renderSupportResolutionEmailHtml(input: SupportResolutionEmailTemplateInput): string {
  const voucherBlock = input.voucherCode
    ? `
      <div style="margin: 24px 0; padding: 20px; background: #f0fdf4; border: 1px dashed #16a34a; border-radius: 8px; text-align: center;">
        <div style="font-size: 13px; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
          🎁 Mã Voucher Đền Bù Dành Riêng Cho Quý Khách
        </div>
        <div style="display: inline-block; padding: 8px 16px; background: #ffffff; border: 2px solid #16a34a; border-radius: 6px; font-size: 20px; font-family: monospace; font-weight: 800; color: #16a34a; letter-spacing: 2px;">
          ${input.voucherCode}
        </div>
        <div style="font-size: 12px; color: #4b5563; margin-top: 8px;">
          *Áp dụng trực tiếp tại bước thanh toán cho đơn hàng kế tiếp trên hệ thống NovaCommerce.
        </div>
      </div>
    `
    : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${input.subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: #38bdf8;">NovaCommerce</span>
                    <span style="font-size: 12px; color: #94a3b8; margin-left: 8px;">| Trung Tâm CSKH 5 Sao</span>
                  </td>
                  <td align="right">
                    <span style="font-size: 12px; color: #94a3b8; font-family: monospace;">#${input.ticketId.slice(0, 8)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #0f172a;">
                Kính chào quý khách ${input.customerName},
              </h2>
              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                Đội ngũ Chăm sóc Khách hàng NovaCommerce xin chân thành cảm ơn quý khách đã gửi phản hồi về vấn đề: <strong>"${input.subject}"</strong>.
              </p>
              
              <div style="margin: 20px 0; padding: 16px 20px; background: #f1f5f9; border-left: 4px solid #0284c7; border-radius: 4px; font-size: 14px; line-height: 1.6; color: #1e293b; white-space: pre-wrap;">
${input.responseMessage}
              </div>

              ${voucherBlock}

              <p style="margin: 24px 0 0 0; font-size: 13px; line-height: 1.5; color: #64748b;">
                Nếu quý khách cần thêm sự trợ giúp hoặc có câu hỏi nào khác, xin vui lòng phản hồi trực tiếp qua email này hoặc liên hệ Hotline hỗ trợ 24/7 của chúng tôi.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">
              <div>NovaCommerce Co., Ltd. • Trao trọn niềm tin, trọn vẹn trải nghiệm</div>
              <div style="margin-top: 4px;">Email: support@novacommerce.vn | Hotline: 1900 6868</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/support/infrastructure/templates/support-resolution-email.template.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/api/src/modules/support/application/ports/email-dispatcher.port.ts apps/api/src/modules/support/infrastructure/templates/
git commit -m "feat(support): add EmailDispatcherPort and branded support resolution email template"
```

---

### Task 3: Implement `SmtpEmailDispatcherAdapter` and `SimulatedEmailDispatcherAdapter`

**Files:**
- Create: `apps/api/src/modules/support/infrastructure/adapters/smtp-email-dispatcher.adapter.ts`
- Create: `apps/api/src/modules/support/infrastructure/adapters/simulated-email-dispatcher.adapter.ts`
- Create: `apps/api/src/modules/support/infrastructure/adapters/smtp-email-dispatcher.adapter.test.ts`

**Interfaces:**
- Consumes: `EmailDispatcherPort`, `nodemailer`.
- Produces: `SmtpEmailDispatcherAdapter`, `SimulatedEmailDispatcherAdapter`.

- [ ] **Step 1: Write unit tests for SMTP and Simulated Adapters**

Create `apps/api/src/modules/support/infrastructure/adapters/smtp-email-dispatcher.adapter.test.ts`:
```typescript
import { describe, expect, it, vi } from "vitest";
import { SmtpEmailDispatcherAdapter } from "./smtp-email-dispatcher.adapter";
import { SimulatedEmailDispatcherAdapter } from "./simulated-email-dispatcher.adapter";

describe("EmailDispatcherAdapters", () => {
  it("SimulatedEmailDispatcherAdapter records dispatched emails in-memory", async () => {
    const adapter = new SimulatedEmailDispatcherAdapter();
    const result = await adapter.sendSupportResolutionEmail({
      to: "customer@example.com",
      toName: "Customer A",
      subject: "Test Subject",
      textBody: "Hello",
      htmlBody: "<p>Hello</p>",
      ticketId: "tick-1",
      voucherCode: "CSKH10-1234",
    });

    expect(result.delivered).toBe(true);
    expect(result.provider).toBe("simulated");
    expect(adapter.getSentEmails()).toHaveLength(1);
    expect(adapter.getSentEmails()[0].to).toBe("customer@example.com");
  });

  it("SmtpEmailDispatcherAdapter sends mail via transport and returns messageId", async () => {
    const mockSendMail = vi.fn().mockResolvedValue({ messageId: "<msg-999@test>" });
    const mockTransport = { sendMail: mockSendMail } as any;

    const adapter = new SmtpEmailDispatcherAdapter({
      transport: mockTransport,
      fromAddress: "NovaCommerce <support@example.com>",
    });

    const result = await adapter.sendSupportResolutionEmail({
      to: "client@example.com",
      toName: "Client B",
      subject: "Resolution",
      textBody: "Resolved",
      htmlBody: "<p>Resolved</p>",
      ticketId: "tick-2",
    });

    expect(result.delivered).toBe(true);
    expect(result.provider).toBe("smtp");
    expect(result.messageId).toBe("<msg-999@test>");
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client@example.com",
        from: "NovaCommerce <support@example.com>",
        subject: "Resolution",
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/support/infrastructure/adapters/smtp-email-dispatcher.adapter.test.ts`
Expected: FAIL (file not found)

- [ ] **Step 3: Implement Simulated and SMTP Adapters**

Create `apps/api/src/modules/support/infrastructure/adapters/simulated-email-dispatcher.adapter.ts`:
```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type {
  EmailDispatcherPort,
  SendEmailInput,
  SendEmailResult,
} from "../../application/ports/email-dispatcher.port";

export class SimulatedEmailDispatcherAdapter implements EmailDispatcherPort {
  private readonly sentEmails: SendEmailInput[] = [];

  async sendSupportResolutionEmail(input: SendEmailInput): Promise<SendEmailResult> {
    this.sentEmails.push(input);
    return {
      messageId: `simulated-${randomUUID()}`,
      delivered: true,
      provider: "simulated",
      timestamp: new Date().toISOString(),
    };
  }

  getSentEmails(): readonly SendEmailInput[] {
    return [...this.sentEmails];
  }

  clear(): void {
    this.sentEmails.length = 0;
  }
}
```

Create `apps/api/src/modules/support/infrastructure/adapters/smtp-email-dispatcher.adapter.ts`:
```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type {
  EmailDispatcherPort,
  SendEmailInput,
  SendEmailResult,
} from "../../application/ports/email-dispatcher.port";

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user: string;
  readonly pass: string;
  readonly from: string;
}

export interface SmtpEmailDispatcherAdapterOptions {
  readonly transport?: Transporter;
  readonly config?: SmtpConfig;
  readonly fromAddress?: string;
}

export class SmtpEmailDispatcherAdapter implements EmailDispatcherPort {
  private readonly transporter: Transporter;
  private readonly fromAddress: string;

  constructor(options: SmtpEmailDispatcherAdapterOptions) {
    if (options.transport) {
      this.transporter = options.transport;
      this.fromAddress = options.fromAddress || "NovaCommerce Support <support@novacommerce.vn>";
    } else if (options.config) {
      this.fromAddress = options.config.from || options.config.user;
      this.transporter = nodemailer.createTransport({
        host: options.config.host,
        port: options.config.port,
        secure: options.config.secure,
        auth: {
          user: options.config.user,
          pass: options.config.pass.replace(/\s+/g, ""),
        },
      });
    } else {
      throw new Error("SmtpEmailDispatcherAdapter requires either transport or config");
    }
  }

  async sendSupportResolutionEmail(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: input.to,
        subject: input.subject,
        text: input.textBody,
        html: input.htmlBody,
      });

      return {
        messageId: info.messageId || `smtp-${randomUUID()}`,
        delivered: true,
        provider: "smtp",
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      console.error("[SmtpEmailDispatcherAdapter] sendMail failed:", err?.message || err);
      throw err;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/support/infrastructure/adapters/smtp-email-dispatcher.adapter.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/api/src/modules/support/infrastructure/adapters/
git commit -m "feat(support): implement SmtpEmailDispatcherAdapter and SimulatedEmailDispatcherAdapter"
```

---

### Task 4: Implement Inbound Email Webhook Controller, Router, and DTOs

**Files:**
- Create: `apps/api/src/modules/support/application/dtos/inbound-email.dto.ts`
- Create: `apps/api/src/modules/support/presentation/controllers/support-inbound-email.controller.ts`
- Create: `apps/api/src/modules/support/presentation/routers/support-inbound-email.router.ts`
- Create: `apps/api/src/modules/support/presentation/controllers/support-inbound-email.controller.test.ts`

**Interfaces:**
- Produces: `POST /v1/public/support/email/inbound` route and handler.

- [ ] **Step 1: Write unit tests for Inbound Controller**

Create `apps/api/src/modules/support/presentation/controllers/support-inbound-email.controller.test.ts`:
```typescript
import { describe, expect, it, vi } from "vitest";
import { SupportInboundEmailController } from "./support-inbound-email.controller";

describe("SupportInboundEmailController", () => {
  it("rejects invalid or missing email with 400", async () => {
    const mockDb = { query: vi.fn() } as any;
    const mockAi = { generateSupportProposal: vi.fn() } as any;
    const controller = new SupportInboundEmailController(mockDb, mockAi);

    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    await controller.handleInboundEmail(
      { body: { from: "not-an-email", subject: "Help", body: "Broken item" } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "INVALID_EMAIL" }),
    );
  });

  it("creates customer if not exists, creates ticket, triggers AI analysis, and returns 201", async () => {
    const mockDb = {
      query: vi
        .fn()
        // 1. check customer
        .mockResolvedValueOnce({ rows: [] })
        // 2. insert customer
        .mockResolvedValueOnce({ rows: [{ id: "cust-1", full_name: "John Doe", email: "john@example.com" }] })
        // 3. insert ticket
        .mockResolvedValueOnce({ rows: [{ id: "tick-new-1", status: "new" }] })
        // 4. insert ticket event
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    const mockAi = {
      generateSupportProposal: vi.fn().mockResolvedValue({ id: "prop-1" }),
    } as any;

    const controller = new SupportInboundEmailController(mockDb, mockAi);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

    await controller.handleInboundEmail(
      {
        body: {
          from: "john@example.com",
          name: "John Doe",
          subject: "Máy PS5 giao trễ",
          body: "Tôi đặt máy chơi game PS5 3 ngày trước nhưng chưa nhận được.",
        },
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: expect.any(String),
        customerId: "cust-1",
        proposalId: "prop-1",
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/support/presentation/controllers/support-inbound-email.controller.test.ts`
Expected: FAIL (file not found)

- [ ] **Step 3: Implement DTO, Controller, and Router**

Create `apps/api/src/modules/support/application/dtos/inbound-email.dto.ts`:
```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface InboundEmailRequestDto {
  readonly from: string;
  readonly name?: string;
  readonly subject: string;
  readonly body: string;
  readonly orderId?: string;
}

export interface InboundEmailResultDto {
  readonly ticketId: string;
  readonly customerId: string;
  readonly customerEmail: string;
  readonly subject: string;
  readonly priority: string;
  readonly status: string;
  readonly proposalId?: string;
}
```

Create `apps/api/src/modules/support/presentation/controllers/support-inbound-email.controller.ts`:
```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { Pool } from "pg";
import type { AiSupportService } from "../../application/services/implementations/ai-support.service";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class SupportInboundEmailController {
  constructor(
    private readonly database: Pool,
    private readonly aiSupportService: AiSupportService,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async handleInboundEmail(req: Request, res: Response): Promise<void> {
    const { from, name, subject, body, orderId } = req.body || {};

    if (!from || typeof from !== "string" || !EMAIL_REGEX.test(from.trim())) {
      res.status(400).json({ error: "INVALID_EMAIL", message: "A valid 'from' email address is required." });
      return;
    }

    if (!subject || typeof subject !== "string" || subject.trim().length === 0) {
      res.status(400).json({ error: "INVALID_SUBJECT", message: "'subject' is required." });
      return;
    }

    if (!body || typeof body !== "string" || body.trim().length === 0) {
      res.status(400).json({ error: "INVALID_BODY", message: "'body' is required." });
      return;
    }

    const cleanEmail = from.trim().toLowerCase();
    const cleanName = (name && typeof name === "string" ? name.trim() : "") || cleanEmail.split("@")[0];
    const cleanSubject = subject.trim().slice(0, 255);
    const cleanBody = body.trim().slice(0, 10000);
    const cleanOrderId = orderId && typeof orderId === "string" ? orderId.trim() : null;

    // Invert priority heuristics
    const lowerText = `${cleanSubject} ${cleanBody}`.toLowerCase();
    const isUrgent = lowerText.includes("khẩn") || lowerText.includes("gấp") || lowerText.includes("ngay lập tức");
    const isHigh = lowerText.includes("trễ") || lowerText.includes("chậm") || lowerText.includes("hỏng") || lowerText.includes("lỗi") || lowerText.includes("hủy");
    const priority = isUrgent ? "urgent" : isHigh ? "high" : "normal";

    try {
      // 1. Resolve or create customer
      let customerId: string;
      const existingCustomer = await this.database.query<{ id: string; full_name: string }>(
        `SELECT id, full_name FROM customers WHERE LOWER(email) = $1 LIMIT 1`,
        [cleanEmail],
      );

      if (existingCustomer.rows.length > 0) {
        customerId = existingCustomer.rows[0].id;
      } else {
        customerId = this.generateId();
        await this.database.query(
          `INSERT INTO customers (id, full_name, email, status, version, created_at, updated_at)
           VALUES ($1, $2, $3, 'active', 1, NOW(), NOW())`,
          [customerId, cleanName, cleanEmail],
        );
      }

      // 2. Insert support ticket
      const ticketId = this.generateId();
      await this.database.query(
        `INSERT INTO support_tickets (
           id, customer_id, order_id, subject, description, priority, status, version, created_by_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'new', 1, 'email-inbound', NOW(), NOW())`,
        [ticketId, customerId, cleanOrderId, cleanSubject, cleanBody, priority],
      );

      // 3. Record event
      const eventId = this.generateId();
      await this.database.query(
        `INSERT INTO support_ticket_events (
           id, ticket_id, actor_id, from_status, to_status, source, occurred_at
         ) VALUES ($1, $2, 'email-inbound', NULL, 'new', 'manual', NOW())`,
        [eventId, ticketId],
      );

      // 4. Trigger AI draft proposal
      let proposalId: string | undefined;
      try {
        const proposal = await this.aiSupportService.generateSupportProposal({
          prompt: `Phản hồi khẩn cấp email khiếu nại khách hàng: "${cleanSubject}"`,
        });
        proposalId = proposal?.id;
      } catch (err) {
        console.error("[SupportInboundEmailController] AI proposal generation error:", err);
      }

      res.status(201).json({
        ticketId,
        customerId,
        customerEmail: cleanEmail,
        subject: cleanSubject,
        priority,
        status: "new",
        proposalId,
      });
    } catch (err: any) {
      console.error("[SupportInboundEmailController] Inbound processing failed:", err);
      res.status(500).json({ error: "INTERNAL_ERROR", message: err?.message || "Failed to process inbound email" });
    }
  }
}
```

Create `apps/api/src/modules/support/presentation/routers/support-inbound-email.router.ts`:
```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router } from "express";
import type { SupportInboundEmailController } from "../controllers/support-inbound-email.controller";

export function createSupportInboundEmailRouter(controller: SupportInboundEmailController): Router {
  const router = Router();
  router.post("/support/email/inbound", (req, res) => controller.handleInboundEmail(req, res));
  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/support/presentation/controllers/support-inbound-email.controller.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit Task 4**

```bash
git add apps/api/src/modules/support/application/dtos/inbound-email.dto.ts apps/api/src/modules/support/presentation/controllers/ apps/api/src/modules/support/presentation/routers/
git commit -m "feat(support): implement inbound email webhook controller and router"
```

---

### Task 5: Enhance `AiSupportService` with Outbound Email Dispatch and Wire Module

**Files:**
- Modify: `apps/api/src/modules/support/application/services/implementations/ai-support.service.ts`
- Modify: `apps/api/src/modules/support/support.module.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/modules/support/application/services/implementations/ai-support.service.test.ts`

**Interfaces:**
- Consumes: `EmailDispatcherPort`, `renderSupportResolutionEmailHtml`.
- Produces: Outbound email delivery after human approval in `applySupportProposal`.

- [ ] **Step 1: Write integration test for email dispatch in `ai-support.service.test.ts`**

Update `ai-support.service.test.ts` to pass a mock `EmailDispatcherPort` into `AiSupportService` and verify `sendSupportResolutionEmail` is called with rendered HTML and customer email when `applySupportProposal` runs.

- [ ] **Step 2: Update `AiSupportService`**

In `AiSupportService`:
- Accept optional `emailDispatcher?: EmailDispatcherPort` in constructor options.
- In `applySupportProposal`, after the database transaction commits:
  ```typescript
  if (this.emailDispatcher) {
    for (const item of request.items) {
      const ticketProposal = proposal?.tickets?.find((t) => t.ticketId === item.ticketId);
      if (!ticketProposal || !ticketProposal.customerEmail) continue;

      const htmlBody = renderSupportResolutionEmailHtml({
        customerName: ticketProposal.customerName,
        ticketId: item.ticketId,
        subject: ticketProposal.subject,
        responseMessage: item.responseMessage || ticketProposal.proposedResponse,
        voucherCode: promoCode || undefined,
      });

      try {
        await this.emailDispatcher.sendSupportResolutionEmail({
          to: ticketProposal.customerEmail,
          toName: ticketProposal.customerName,
          subject: `[NovaCommerce] Phản hồi yêu cầu hỗ trợ: ${ticketProposal.subject}`,
          textBody: item.responseMessage || ticketProposal.proposedResponse,
          htmlBody,
          ticketId: item.ticketId,
          voucherCode: promoCode || undefined,
        });
      } catch (emailErr) {
        console.error(`[AiSupportService] Failed to send resolution email to ${ticketProposal.customerEmail}:`, emailErr);
      }
    }
  }
  ```

- [ ] **Step 3: Wire into `support.module.ts` and `app.ts`**

In `support.module.ts`:
- Check `process.env.SUPPORT_EMAIL_MODE === "live" && process.env.SUPPORT_SMTP_USER && process.env.SUPPORT_SMTP_PASS`.
- If live: instantiate `SmtpEmailDispatcherAdapter`.
- Otherwise: instantiate `SimulatedEmailDispatcherAdapter`.
- Pass to `AiSupportService`.
- Create `SupportInboundEmailController` and `supportInboundRouter`.
- Expose `supportInboundRouter` on `/v1/public` in `app.ts`.

- [ ] **Step 4: Run unit and integration tests**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/support/`
Expected: PASS (all tests pass)

- [ ] **Step 5: Commit Task 5**

```bash
git add apps/api/src/modules/support/ apps/api/src/app.ts
git commit -m "feat(support): wire EmailDispatcherPort into AiSupportService and register public inbound router"
```

---

### Task 6: Update Console UI (Agentic Command Center) for Email Sending

**Files:**
- Modify: `apps/console/src/features/agentic/components/agentic-command-center.tsx`

**Interfaces:**
- Updates button label in Customer Support & CRM tab to `"Phê duyệt & Gửi Email phản hồi"`.
- Displays email delivery badge or status upon approval.

- [ ] **Step 1: Update button and labels in `agentic-command-center.tsx`**

Update the approval button in the Support card of Command Center:
- Change `"Phê duyệt kịch bản & Cấp voucher"` -> `"✓ Phê duyệt & Gửi Email phản hồi (kèm Voucher)"`.
- Add indication that emails are dispatched directly to customer inboxes.

- [ ] **Step 2: Run console tests**

Run: `pnpm --filter @opendx/console test`
Expected: PASS (31 test files, 146 tests)

- [ ] **Step 3: Commit Task 6**

```bash
git add apps/console/src/features/agentic/components/agentic-command-center.tsx
git commit -m "feat(console): update Command Center support action button for email dispatch"
```

---

### Task 7: End-to-End Verification, Live Test, and Documentation

**Files:**
- Modify: `CHANGELOG.md`
- Test: Inbound webhook via curl + Live Gmail SMTP dispatch check.

- [ ] **Step 1: Rebuild and restart API container**

Run: `docker compose --env-file .env -f infra/docker/docker-compose.yml up -d --build --force-recreate api console`

- [ ] **Step 2: Send live Inbound test email via curl**

Send an incoming complaint email to `http://localhost:4000/v1/public/support/email/inbound` with `from: "nguyenphuongdmx2450@gmail.com"`, `subject: "Khiếu nại máy chơi game PS5 giao trễ"`.

- [ ] **Step 3: Trigger approval in Command Center or API**

Approve the generated proposal and verify in the terminal and in Gmail inbox that the response email with voucher arrives!

- [ ] **Step 4: Update `CHANGELOG.md`**

Record the new Two-Way Governed Email Support Workflow under `## [Unreleased]`.

- [ ] **Step 5: Commit and push to `origin/phuong`**

Run: `git commit -am "feat(support): complete two-way governed email support workflow" && git push origin phuong`
