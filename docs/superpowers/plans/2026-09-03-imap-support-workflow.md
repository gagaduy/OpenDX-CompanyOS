<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Implementation Plan: Automated IMAP Support Email Poller & Ingestion

## Proposed Implementation Tasks

### Task 1: Clean Architecture Application Port & DTOs
- Create `apps/api/src/modules/support/application/ports/email-receiver.port.ts`
  - Defines `IncomingCustomerEmailDto`
  - Defines `EmailReceiverPort` interface
  - Unit test / DTO contract check

### Task 2: IMAP & Simulated Receiver Adapters
- Create `apps/api/src/modules/support/infrastructure/adapters/imap-email-receiver.adapter.ts`
  - Uses `ImapFlow` and `simpleParser` from `mailparser`
  - Configuration passed via constructor without hardcoding
  - Parses subject `#<prefix>` or ticket UUID regex
  - Extracts clean text reply (strips quoted email lines like `Vào ..., ... đã viết:`)
- Create `apps/api/src/modules/support/infrastructure/adapters/simulated-email-receiver.adapter.ts`
  - In-memory mock adapter for deterministic unit tests
- Unit tests: `apps/api/src/modules/support/infrastructure/adapters/imap-email-receiver.adapter.test.ts`

### Task 3: Support Inbound Email Ingestion Use Case / Service
- Implement or extend `SupportEmailIngestionService` (or in `AiSupportService`)
  - Takes `IncomingCustomerEmailDto`
  - If ticket ID matches existing ticket:
    - Appends customer message to `support_ticket_messages`
    - If status was `resolved` or `closed`, transitions to `in_progress` or `escalated`
    - Inserts `support_ticket_events` with idempotency key
    - Triggers AI re-evaluation for compensation escalation (e.g. replacement / compensation)
  - If no ticket matches, creates a new ticket as before
- Unit tests in `ai-support-service.test.ts`

### Task 4: Support Email Poller Background Worker
- Create `apps/api/src/modules/support/infrastructure/workers/support-email-poller.worker.ts`
  - Follows existing worker pattern (like `SupportEscalationWorker`)
  - `start()`, `stop()`, `tick()`
  - Calls `emailReceiver.fetchUnreadReplies()`
  - Processes each email idempotently and calls `emailReceiver.markAsRead(uid)`
- Unit tests: `support-email-poller.worker.test.ts`

### Task 5: Module Wiring & Server Runtime Integration
- Update `apps/api/src/modules/support/support.module.ts`:
  - Wire `ImapEmailReceiverAdapter` when `SUPPORT_IMAP_ENABLED=true`
  - Initialize and start `SupportEmailPollerWorker`
- Update `infra/docker/docker-compose.yml` with `SUPPORT_IMAP_*` variables
- Update `.env` with `SUPPORT_IMAP_ENABLED=true`

### Task 6: End-to-End Verification & Commit
- Run unit tests for support module
- Rebuild API container
- Test with real incoming reply from Gmail
- Update `CHANGELOG.md` under `[Unreleased]`
- Commit and push to `phuong`
