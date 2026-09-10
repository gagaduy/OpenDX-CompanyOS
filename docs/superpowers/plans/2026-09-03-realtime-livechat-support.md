<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Two-Way Realtime LiveChat Support Implementation Plan

> **User Goal**: Implement real-time two-way messaging between Storefront customers and Console support staff using Server-Sent Events (SSE).
> **Architecture**: Clean Architecture with ports and adapters, resilient event stream, zero vendor lock-in.

---

## Proposed Changes

### 2. Backend Application & Infrastructure Layer (`apps/api`)
- `apps/api/src/modules/support/application/ports/realtime-broadcaster.port.ts`: Defines `RealtimeBroadcasterPort` interface and `SupportRealtimeEvent` types.
- `apps/api/src/modules/support/infrastructure/adapters/in-memory-realtime-broadcaster.adapter.ts`: Implements pub-sub broadcaster using Node.js `EventEmitter`.
- `apps/api/src/modules/support/application/services/implementations/support-livechat.service.ts`: Handles customer session initialization, message creation, and triggers OpenRouter AI Assistant when staff is offline or on important queries.
- `apps/api/src/modules/support/application/services/implementations/ai-livechat-assistant.service.ts`: Calls OpenRouter API (`google/gemini-2.5-flash`) to generate contextual, brand-aligned instant replies.
- `apps/api/src/modules/support/infrastructure/adapters/in-memory-realtime-broadcaster.adapter.test.ts`: Unit tests for broadcaster subscription, dispatch, and unsubscription.

### 2. Backend Presentation Layer (`apps/api`)
- `apps/api/src/modules/support/presentation/routers/support-livechat.router.ts`:
  - `POST /v1/public/support/livechat/init`: Initializes customer chat session.
  - `GET /v1/public/support/livechat/:sessionId/events`: Streams real-time SSE messages to Storefront.
  - `POST /v1/public/support/livechat/:sessionId/messages`: Ingests message from Storefront customer.
- `apps/api/src/modules/support/presentation/routers/support-sse.router.ts`:
  - `GET /v1/support/tickets/:ticketId/events`: Streams real-time SSE messages to Console staff.
- Wire broadcaster into `SupportService.appendMessage` and `SupportEmailIngestionService` so any new message immediately broadcasts over SSE.

### 3. Management Console (`apps/console`)
- `apps/console/src/features/support/hooks/use-support-ticket-sse.ts`: Hook to subscribe to ticket SSE event stream and update UI state instantly.
- `apps/console/src/features/support/pages/ticket-detail-page.tsx`: Connects SSE hook to append incoming messages without manual reload.

### 4. Customer Storefront (`apps/storefront`)
- `apps/storefront/src/features/livechat/api/livechat-api.ts`: API client for LiveChat endpoints.
- `apps/storefront/src/features/livechat/components/live-chat-widget.tsx`: Floating chat widget with message history, input composer, and live status.
- `apps/storefront/src/app/storefront-shell.tsx`: Mounts `<LiveChatWidget />` globally.

---

## Plan Tasks

### Task 1: Realtime Broadcaster Port & In-Memory Adapter
- [ ] Create `apps/api/src/modules/support/application/ports/realtime-broadcaster.port.ts`.
- [ ] Create `apps/api/src/modules/support/infrastructure/adapters/in-memory-realtime-broadcaster.adapter.ts`.
- [ ] Create `apps/api/src/modules/support/infrastructure/adapters/in-memory-realtime-broadcaster.adapter.test.ts`.
- [ ] Run vitest: `pnpm --filter @opendx/api exec vitest run src/modules/support/infrastructure/adapters/in-memory-realtime-broadcaster.adapter.test.ts`.

### Task 2: LiveChat Application Service & Broadcaster Wiring
- [ ] Create `apps/api/src/modules/support/application/services/implementations/support-livechat.service.ts`.
- [ ] Update `SupportService.appendMessage` to broadcast `message_created` via `realtimeBroadcaster`.
- [ ] Update `SupportEmailIngestionService` to broadcast `message_created` via `realtimeBroadcaster`.
- [ ] Wire `realtimeBroadcaster` in `apps/api/src/modules/support/support.module.ts`.

### Task 3: Public LiveChat & Staff Ticket Events Routers (SSE)
- [ ] Create `apps/api/src/modules/support/presentation/routers/support-livechat.router.ts`.
- [ ] Add `GET /v1/support/tickets/:ticketId/events` in `apps/api/src/modules/support/presentation/routers/support.router.ts`.
- [ ] Mount public livechat router under `/v1/public/support/livechat` in `apps/api/src/app/app.ts`.
- [ ] Test SSE endpoints using curl/node.

### Task 4: Console Live Ticket Events Hook & Detail View
- [ ] Create `apps/console/src/features/support/hooks/use-support-ticket-sse.ts`.
- [ ] Update `apps/console/src/features/support/pages/ticket-detail-page.tsx` with live message appending.
- [ ] Run console unit tests: `pnpm --filter @opendx/console test`.

### Task 5: Storefront LiveChat Widget & Shell Mount
- [ ] Create `apps/storefront/src/features/livechat/api/livechat-api.ts`.
- [ ] Create `apps/storefront/src/features/livechat/components/live-chat-widget.tsx`.
- [ ] Embed `<LiveChatWidget />` in `apps/storefront/src/app/storefront-shell.tsx`.
- [ ] Run storefront build/tests: `pnpm --filter @opendx/storefront test` and `pnpm --filter @opendx/storefront build`.

### Task 6: Audit, Verification, and Commit
- [ ] Run `pnpm audit:repo`.
- [ ] Update `CHANGELOG.md` under `[Unreleased]`.
- [ ] Commit with Conventional Commits and push to `origin/phuong`.
