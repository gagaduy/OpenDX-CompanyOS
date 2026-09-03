// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Readable } from "node:stream";
import type { Pool } from "pg";
import type { StaffTokenVerifier } from "../../shared/auth/staff-auth.middleware";
import { authenticateStaff } from "../../shared/auth/staff-auth.middleware";
import type { TransactionRunner } from "../../shared/database/transaction";
import type { CustomerOperationsReader } from "../customer";
import type { CustomerOrderOperationsReader } from "../order";
import type { SupportAttachmentScanner } from "./application/security/support-attachment-scanner";
import { SupportAttachmentService } from "./application/services/implementations/support-attachment.service";
import { SupportService } from "./application/services/implementations/support.service";
import { AiSupportService } from "./application/services/implementations/ai-support.service";
import { SupportApplicationError } from "./application/services/support-application.error";
import type { SupportAttachmentStorage } from "./application/storage/support-attachment-storage";
import { PostgresqlSupportRepository } from "./infrastructure/repositories/implementations/postgresql-support.repository";
import { SupportAttachmentRetentionWorker } from "./infrastructure/workers/support-attachment-retention.worker";
import { SupportAttachmentScanWorker } from "./infrastructure/workers/support-attachment-scan.worker";
import { SupportEscalationWorker } from "./infrastructure/workers/support-escalation.worker";
import { SupportController } from "./presentation/controllers/support.controller";
import { supportErrorMiddleware } from "./presentation/middleware/support-error.middleware";
import { createSupportRouter } from "./presentation/routes/support.routes";
import type { SupportOrderContextReader } from "../order";
import { SupportHealthReaderService } from "./application/services/implementations/support-health-reader";
import { PostgresqlSupportHealthRepository } from "./infrastructure/repositories/implementations/postgresql-support-health.repository";
import { SmtpEmailDispatcherAdapter } from "./infrastructure/adapters/smtp-email-dispatcher.adapter";
import { SimulatedEmailDispatcherAdapter } from "./infrastructure/adapters/simulated-email-dispatcher.adapter";
import { ImapEmailReceiverAdapter } from "./infrastructure/adapters/imap-email-receiver.adapter";
import { SimulatedEmailReceiverAdapter } from "./infrastructure/adapters/simulated-email-receiver.adapter";
import { SupportInboundEmailController } from "./presentation/controllers/support-inbound-email.controller";
import { createSupportInboundEmailRouter } from "./presentation/routers/support-inbound-email.router";
import { SupportEmailPollerWorker } from "./infrastructure/workers/support-email-poller.worker";
import { SupportEmailIngestionService } from "./application/services/implementations/support-email-ingestion.service";
import type { EmailDispatcherPort } from "./application/ports/email-dispatcher.port";
import type { EmailReceiverPort } from "./application/ports/email-receiver.port";
import type { RealtimeBroadcasterPort } from "./application/ports/realtime-broadcaster.port";
import { InMemoryRealtimeBroadcasterAdapter } from "./infrastructure/adapters/in-memory-realtime-broadcaster.adapter";
import { AiLivechatAssistantService } from "./application/services/implementations/ai-livechat-assistant.service";
import { SupportLivechatService } from "./application/services/implementations/support-livechat.service";
import { createSupportLivechatRouter } from "./presentation/routers/support-livechat.router";

export interface SupportHealthDependencies {
  readonly transactions: TransactionRunner;
  readonly orders: SupportOrderContextReader;
  readonly now: () => string;
}

export function createSupportHealthReader(d: SupportHealthDependencies) {
  return new SupportHealthReaderService(new PostgresqlSupportHealthRepository(), d.orders, d.transactions, d.now);
}

export function createSupportModule(d: {
  transactions: TransactionRunner;
  customers: CustomerOperationsReader;
  orders: CustomerOrderOperationsReader;
  staffTokenVerifier: StaffTokenVerifier;
  generateId: () => string;
  now: () => string;
  database?: Pool;
  attachmentStorage?: SupportAttachmentStorage;
  attachmentScanner?: SupportAttachmentScanner;
  attachmentMaximumBytes?: number;
  escalationIntervalMs?: number;
  attachmentScanIntervalMs?: number;
  attachmentRetentionIntervalMs?: number;
  emailDispatcher?: EmailDispatcherPort;
  emailReceiver?: EmailReceiverPort;
}) {
  const repository = new PostgresqlSupportRepository();
  const storage = d.attachmentStorage ?? unavailableStorage();
  const scanner = d.attachmentScanner ?? unavailableScanner();
  const attachments = new SupportAttachmentService(repository, storage, d.transactions, d.generateId, d.now);

  const emailDispatcher = d.emailDispatcher ?? (
    ((process.env.SUPPORT_EMAIL_MODE === "live" || (process.env.SUPPORT_SMTP_USER && process.env.SUPPORT_SMTP_PASS && process.env.SUPPORT_EMAIL_MODE !== "simulation")))
      ? new SmtpEmailDispatcherAdapter({
          config: {
            host: process.env.SUPPORT_SMTP_HOST || "smtp.gmail.com",
            port: Number(process.env.SUPPORT_SMTP_PORT) || 587,
            secure: process.env.SUPPORT_SMTP_SECURE === "true",
            user: process.env.SUPPORT_SMTP_USER || "",
            pass: process.env.SUPPORT_SMTP_PASS || "",
            from: process.env.SUPPORT_EMAIL_FROM || `NovaCommerce Support <${process.env.SUPPORT_SMTP_USER}>`,
          },
        })
      : new SimulatedEmailDispatcherAdapter()
  );

  const realtimeBroadcaster = new InMemoryRealtimeBroadcasterAdapter();

  const service = new SupportService(repository, d.customers, d.orders, d.transactions, d.generateId, d.now, emailDispatcher, realtimeBroadcaster);

  const aiService = d.database
    ? new AiSupportService(
        d.database,
        { openRouterApiKey: process.env.OPENROUTER_API_KEY },
        d.generateId,
        d.now,
        emailDispatcher,
      )
    : undefined;

  const aiLivechatAssistant = new AiLivechatAssistantService(
    { openRouterApiKey: process.env.OPENROUTER_API_KEY },
    d.database,
  );

  const livechatService = d.database
    ? new SupportLivechatService(d.database, realtimeBroadcaster, aiLivechatAssistant, d.generateId, d.now)
    : undefined;

  const livechatRouter = livechatService
    ? createSupportLivechatRouter(livechatService, realtimeBroadcaster)
    : undefined;

  const emailReceiver = d.emailReceiver ?? (
    process.env.SUPPORT_IMAP_ENABLED === "true" && (process.env.SUPPORT_IMAP_USER || process.env.SUPPORT_SMTP_USER) && (process.env.SUPPORT_IMAP_PASS || process.env.SUPPORT_SMTP_PASS)
      ? new ImapEmailReceiverAdapter({
          host: process.env.SUPPORT_IMAP_HOST || "imap.gmail.com",
          port: Number(process.env.SUPPORT_IMAP_PORT) || 993,
          secure: process.env.SUPPORT_IMAP_SECURE !== "false",
          user: process.env.SUPPORT_IMAP_USER || process.env.SUPPORT_SMTP_USER || "",
          pass: process.env.SUPPORT_IMAP_PASS || process.env.SUPPORT_SMTP_PASS || "",
          mailbox: process.env.SUPPORT_IMAP_MAILBOX || "INBOX",
          tlsRejectUnauthorized: process.env.SUPPORT_IMAP_TLS_REJECT_UNAUTHORIZED === "true",
        })
      : new SimulatedEmailReceiverAdapter()
  );

  const ingestionService = d.database && aiService
    ? new SupportEmailIngestionService(d.database, aiService, d.generateId, realtimeBroadcaster, emailDispatcher)
    : undefined;

  const emailPollerWorker = ingestionService && (process.env.SUPPORT_IMAP_ENABLED === "true" || d.emailReceiver !== undefined)
    ? new SupportEmailPollerWorker(
        emailReceiver,
        ingestionService,
        Number(process.env.SUPPORT_IMAP_POLL_INTERVAL_MS) || 15_000,
        (err) => console.error("[SupportEmailPollerWorker] Error during poll:", err),
      )
    : undefined;

  const inboundEmailController = d.database && aiService && ingestionService
    ? new SupportInboundEmailController(d.database, aiService, ingestionService)
    : undefined;

  const inboundEmailRouter = inboundEmailController
    ? createSupportInboundEmailRouter(inboundEmailController)
    : undefined;

  const router = createSupportRouter(
    new SupportController(service, attachments, aiService),
    authenticateStaff(d.staffTokenVerifier),
    (x) => d.transactions.run((s) => repository.appendDeniedAudit(s, { id: d.generateId(), ...x, occurredAt: d.now() })),
    d.attachmentMaximumBytes,
    realtimeBroadcaster,
  );
  router.use(supportErrorMiddleware);
  return {
    router,
    livechatRouter,
    realtimeBroadcaster,
    inboundEmailRouter,
    operationsSummary: service,
    escalationWorker: new SupportEscalationWorker(d.transactions, repository, d.generateId, d.now, d.escalationIntervalMs),
    attachmentScanWorker: new SupportAttachmentScanWorker(d.transactions, repository, storage, scanner, d.generateId, d.now, d.attachmentScanIntervalMs),
    attachmentRetentionWorker: new SupportAttachmentRetentionWorker(d.transactions, repository, storage, d.generateId, d.now, d.attachmentRetentionIntervalMs),
    emailPollerWorker,
  };
}

function unavailableScanner(): SupportAttachmentScanner {
  return {
    scan: async () => {
      throw new SupportApplicationError("ATTACHMENT_SCAN_FAILED", "Attachment scanning is unavailable");
    },
  };
}

function unavailableStorage(): SupportAttachmentStorage {
  return {
    put: async () => {
      throw new SupportApplicationError("ATTACHMENT_SCAN_FAILED", "Attachment storage is unavailable");
    },
    open: async () => Readable.from([]),
    delete: async () => undefined,
  };
}
