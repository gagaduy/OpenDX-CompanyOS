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
}) {
  const repository = new PostgresqlSupportRepository();
  const service = new SupportService(repository, d.customers, d.orders, d.transactions, d.generateId, d.now);
  const storage = d.attachmentStorage ?? unavailableStorage();
  const scanner = d.attachmentScanner ?? unavailableScanner();
  const attachments = new SupportAttachmentService(repository, storage, d.transactions, d.generateId, d.now);
  const aiService = d.database ? new AiSupportService(d.database, { openRouterApiKey: process.env.OPENROUTER_API_KEY }) : undefined;
  const router = createSupportRouter(
    new SupportController(service, attachments, aiService),
    authenticateStaff(d.staffTokenVerifier),
    (x) => d.transactions.run((s) => repository.appendDeniedAudit(s, { id: d.generateId(), ...x, occurredAt: d.now() })),
    d.attachmentMaximumBytes,
  );
  router.use(supportErrorMiddleware);
  return {
    router,
    operationsSummary: service,
    escalationWorker: new SupportEscalationWorker(d.transactions, repository, d.generateId, d.now, d.escalationIntervalMs),
    attachmentScanWorker: new SupportAttachmentScanWorker(d.transactions, repository, storage, scanner, d.generateId, d.now, d.attachmentScanIntervalMs),
    attachmentRetentionWorker: new SupportAttachmentRetentionWorker(d.transactions, repository, storage, d.generateId, d.now, d.attachmentRetentionIntervalMs),
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
