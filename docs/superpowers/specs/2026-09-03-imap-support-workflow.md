<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Design Spec: Automated IMAP Email Reply Ingestion & Ticket Lifecycle

## 1. Context & Business Need
When customer support resolution emails are dispatched to customers (with ticket ID in the subject and message reference), customers often reply directly from their mobile or desktop email clients (e.g., Gmail app: "Tôi không cần tôi cần đền bù cái mới").
Because individual email client replies are sent to the inbox rather than triggering an inbound webhook directly, the system requires an automated IMAP receiver adapter and poller worker.
The worker scans the configured mailbox, extracts the ticket reference and sender details, appends the customer message to the ticket timeline, reopens/escalates the ticket if previously resolved, and triggers AI Support reasoning to evaluate new demands.

## 2. Architecture & Clean Boundaries

### Domain & Application Layer
- **`EmailReceiverPort`**: Inward-facing port defining the contract:
  - `fetchUnreadReplies(): Promise<IncomingCustomerEmailDto[]>`
  - `markAsRead(messageUid: string): Promise<void>`
- **`IncomingCustomerEmailDto`**:
  - `messageUid`: string
  - `fromEmail`: string
  - `fromName`: string
  - `subject`: string
  - `bodyText`: string
  - `ticketId`: string | null (extracted via regex from subject `#<uuid-prefix>` or body)
  - `receivedAt`: Date
- **`SupportEmailIngestionService`**:
  - Encapsulates ticket lookup, customer resolution, ticket transition (`resolved` -> `in_progress` or `escalated`), appending `support_ticket_messages`, recording `support_ticket_events`, and invoking `AiSupportService.generateSupportProposal` when appropriate.

### Infrastructure Layer
- **`ImapEmailReceiverAdapter`**:
  - Connects to IMAP host (e.g. `imap.gmail.com:993`) using `ImapFlow` with typed, fail-closed configuration from environment variables.
  - Parses MIME structure using `mailparser` (simpleParser) to extract clean plain text without forwarded quote noise.
  - Implements `EmailReceiverPort`.
- **`SimulatedEmailReceiverAdapter`**:
  - In-memory mock adapter for deterministic unit and integration testing without network calls.
- **`SupportEmailPollerWorker`**:
  - Background periodic worker (interval configurable, default 15,000ms) with `start()`, `stop()`, `tick()`.
  - Uses `TransactionRunner` to ensure atomicity and idempotency.

### Configuration
Read strictly from environment variables without hardcoding:
- `SUPPORT_IMAP_ENABLED`: boolean (default: `false`)
- `SUPPORT_IMAP_HOST`: string (default: `imap.gmail.com`)
- `SUPPORT_IMAP_PORT`: number (default: `993`)
- `SUPPORT_IMAP_SECURE`: boolean (default: `true`)
- `SUPPORT_IMAP_USER`: string (fallback to `SUPPORT_SMTP_USER`)
- `SUPPORT_IMAP_PASS`: string (fallback to `SUPPORT_SMTP_PASS`)
- `SUPPORT_IMAP_POLL_INTERVAL_MS`: number (default: `15000`)
