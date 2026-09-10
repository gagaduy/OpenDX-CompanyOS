# Social Token Expiration & Health Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous social token expiration and health monitoring subsystem in Marketing with 2-tier zero-copy-paste refresh (Meta `fb_exchange_token` auto-extension + 1-Click Meta OAuth popup), database persistence, proactive Staff Command Center alerts, and publisher runtime integration.

**Architecture:** Database table `marketing_social_accounts` stores account credentials and token expiration metadata. `MetaGraphSocialTokenAdapter` calls Meta Graph `/debug_token` and `/oauth/access_token` to inspect, extend, and exchange tokens. `AutonomousSocialTokenMonitorService` runs periodic checks (every 6h) and auto-extends expiring tokens. `MarketingController` exposes admin endpoints (`/status`, `/refresh`, `/oauth-exchange`, `/check`). The Staff Command Center displays pulsing header badges and amber/red alert cards with 1-click action buttons and a `SocialTokenManagerModal`.

**Tech Stack:** TypeScript, Node.js, Express, PostgreSQL, node-pg-migrate, Meta Graph API v20.0, React 19, Lucide React, Vitest, Testing Library.

**Spec:** [`docs/superpowers/specs/2026-09-10-social-token-expiration-health-monitor-design.md`](file:///home/phan-duong-quoc-nhat/workspace/OpenDX-CompanyOS/docs/superpowers/specs/2026-09-10-social-token-expiration-health-monitor-design.md)

## Global Constraints

- Never expose access tokens in plaintext in logs, audit messages, or public API views; tokens must always be masked (`EAAB...wxyz`) or sanitized (`[REDACTED]`).
- Clean Architecture: Presentation and infrastructure depend inward on application/domain contracts.
- Database as primary truth: `marketing_social_accounts` overrides environment variables, but seeds automatically from `.env` on boot if unpopulated.
- Zero copy-paste: Operator never manually copies or pastes token strings; renewal happens via 1-click server-to-server API extension or 1-click OAuth dialog popup.
- Strict human-in-the-loop and RBAC: Endpoint calls require staff authentication and `marketing:manage` permission.

---

### Task 1: Database Migration for `marketing_social_accounts`

**Files:**
- Create: `apps/api/src/modules/marketing/infrastructure/database/migrations/202609100002_create_marketing_social_accounts.ts`
- Test: `apps/api/src/modules/marketing/infrastructure/database/migrations/202609100002_create_marketing_social_accounts.test.ts`

**Interfaces:**
- Produces: Table `marketing_social_accounts` with unique constraint `(platform, account_id)` and status index.

- [ ] **Step 1: Write the failing migration test**
Create test file asserting `up` and `down` SQL migrations contain correct table definitions, constraints, and indices.

- [ ] **Step 2: Run test to confirm it fails**
Run: `pnpm --filter @opendx/api test src/modules/marketing/infrastructure/database/migrations/202609100002_create_marketing_social_accounts.test.ts`

- [ ] **Step 3: Implement migration file**
Create `202609100002_create_marketing_social_accounts.ts` defining `marketing_social_accounts` table, check constraints on `platform` (`facebook`, `instagram`) and `token_status` (`healthy`, `expiring_soon`, `expired`, `invalid`, `unconfigured`), indices on `token_status` and `token_expires_at`.

- [ ] **Step 4: Run migration test and apply up migration on local DB**
Run test to verify pass, then run `pnpm db:migrate` or verify migration readiness.

- [ ] **Step 5: Commit Task 1**
Commit: `feat(marketing): add marketing_social_accounts database migration`

---

### Task 2: Domain Entities, DTOs and Social Account Repository

**Files:**
- Create: `apps/api/src/modules/marketing/domain/entities/social-account.ts`
- Create: `apps/api/src/modules/marketing/application/dtos/social-token.dto.ts`
- Create: `apps/api/src/modules/marketing/domain/repositories/social-account.repository.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/repositories/implementations/postgresql-social-account.repository.ts`
- Test: `apps/api/src/modules/marketing/tests/postgresql-social-account.repository.test.ts`

**Interfaces:**
- Produces:
  - `SocialAccountEntity`, `SocialTokenStatus`
  - `SocialTokenHealthView`, `SocialTokensSummaryView`
  - `SocialAccountRepository` interface (`findByPlatformAndId`, `listAccounts`, `upsertAccount`, `updateHealthStatus`)
  - `PostgresqlSocialAccountRepository` implementation

- [ ] **Step 1: Write the failing repository unit test**
Create unit test in `apps/api/src/modules/marketing/tests/postgresql-social-account.repository.test.ts` mocking pg pool to test `upsertAccount`, `findByPlatformAndId`, `listAccounts`, and `updateHealthStatus`.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @opendx/api test src/modules/marketing/tests/postgresql-social-account.repository.test.ts`

- [ ] **Step 3: Implement domain entity, DTOs, repository port and PostgreSQL repository**
Implement domain interfaces, sanitization mask helper `maskToken(token: string): string`, and `PostgresqlSocialAccountRepository`.

- [ ] **Step 4: Run test to verify pass**
Run: `pnpm --filter @opendx/api test src/modules/marketing/tests/postgresql-social-account.repository.test.ts`

- [ ] **Step 5: Commit Task 2**
Commit: `feat(marketing): add social account entity, dtos, and postgresql repository`

---

### Task 3: Meta Graph Social Token Inspector & Refresher Ports and Adapter

**Files:**
- Create: `apps/api/src/modules/marketing/application/ports/social-token-inspector.port.ts`
- Create: `apps/api/src/modules/marketing/application/ports/social-token-refresher.port.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/adapters/meta-graph-social-token.adapter.ts`
- Test: `apps/api/src/modules/marketing/infrastructure/adapters/meta-graph-social-token.adapter.test.ts`

**Interfaces:**
- Produces:
  - `SocialTokenInspectorPort` (`inspectToken(platform, token, accountId): Promise<SocialTokenInspectionResult>`)
  - `SocialTokenRefresherPort` (`extendToken`, `exchangeOAuthCode`)
  - `MetaGraphSocialTokenAdapter` implements both ports using fetch to Meta Graph API v20.0:
    - `/debug_token?input_token={token}&access_token={token}`
    - `/{accountId}?fields=id,name,can_post`
    - `/oauth/access_token?grant_type=fb_exchange_token`
    - `/oauth/access_token?grant_type=authorization_code`

- [ ] **Step 1: Write the failing adapter test**
Create `meta-graph-social-token.adapter.test.ts` testing:
- Valid token inspection with remaining days calculation.
- Expired/revoked token handling (Meta error code 190).
- Token extension (`fb_exchange_token`) returning new extended token.
- OAuth code exchange returning long-lived & permanent page token.
- Redaction of sensitive token strings from error messages.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @opendx/api test src/modules/marketing/infrastructure/adapters/meta-graph-social-token.adapter.test.ts`

- [ ] **Step 3: Implement ports and MetaGraphSocialTokenAdapter**
Implement `meta-graph-social-token.adapter.ts` with error handling, timeout handling, and token redaction.

- [ ] **Step 4: Run test to verify pass**
Run: `pnpm --filter @opendx/api test src/modules/marketing/infrastructure/adapters/meta-graph-social-token.adapter.test.ts`

- [ ] **Step 5: Commit Task 3**
Commit: `feat(marketing): add meta graph social token inspector and refresher adapter`

---

### Task 4: Social Token Manager Service

**Files:**
- Create: `apps/api/src/modules/marketing/application/services/interfaces/social-token-manager.service.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/social-token-manager.service.ts`
- Test: `apps/api/src/modules/marketing/tests/social-token-manager.service.test.ts`

**Interfaces:**
- Consumes: `SocialAccountRepository`, `SocialTokenInspectorPort`, `SocialTokenRefresherPort`
- Produces:
  - `SocialTokenManagerService`:
    - `getTokensSummary(): Promise<SocialTokensSummaryView>`
    - `performHealthCheck(): Promise<SocialTokensSummaryView>`
    - `autoRefreshAccount(platform, accountId): Promise<SocialTokenHealthView>`
    - `handleOAuthCallback(platform, code, redirectUri, targetPageId?): Promise<SocialTokenHealthView>`
    - `seedFromEnvironmentIfEmpty(): Promise<void>`

- [ ] **Step 1: Write the failing unit tests for SocialTokenManagerService**
Test:
- `seedFromEnvironmentIfEmpty` inserts FB/IG accounts from process.env if repository is empty.
- `getTokensSummary` flags warnings when `daysRemaining <= 7` and critical when `daysRemaining < 3` or `tokenStatus === 'invalid'`.
- `autoRefreshAccount` calls `extendToken` and updates repository with refreshed token.
- `handleOAuthCallback` exchanges OAuth code, fetches permanent page token, and saves to repository.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @opendx/api test src/modules/marketing/tests/social-token-manager.service.test.ts`

- [ ] **Step 3: Implement SocialTokenManagerService**
Implement `social-token-manager.service.ts` with comprehensive logging, fallback to environment, and status calculation.

- [ ] **Step 4: Run test to verify pass**
Run: `pnpm --filter @opendx/api test src/modules/marketing/tests/social-token-manager.service.test.ts`

- [ ] **Step 5: Commit Task 4**
Commit: `feat(marketing): implement social token manager service`

---

### Task 5: Autonomous Social Token Monitor Service (Periodic Health Worker)

**Files:**
- Create: `apps/api/src/modules/marketing/application/services/interfaces/autonomous-social-token-monitor.service.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/autonomous-social-token-monitor.service.ts`
- Test: `apps/api/src/modules/marketing/tests/autonomous-social-token-monitor.service.test.ts`

**Interfaces:**
- Consumes: `SocialTokenManagerService`
- Produces:
  - `AutonomousSocialTokenMonitorService`:
    - `start(): void`
    - `stop(): void`
    - `executeHeartbeat(): Promise<void>`
    - `triggerCheck(): Promise<SocialTokensSummaryView>`

- [ ] **Step 1: Write the failing unit test**
Test scheduled heartbeat execution, automatic renewal of tokens expiring in $\le 7$ days, and error tolerance.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @opendx/api test src/modules/marketing/tests/autonomous-social-token-monitor.service.test.ts`

- [ ] **Step 3: Implement AutonomousSocialTokenMonitorService**
Implement periodic timer (6 hours), auto-renewal trigger, and error handling.

- [ ] **Step 4: Run test to verify pass**
Run: `pnpm --filter @opendx/api test src/modules/marketing/tests/autonomous-social-token-monitor.service.test.ts`

- [ ] **Step 5: Commit Task 5**
Commit: `feat(marketing): implement autonomous social token monitor service`

---

### Task 6: Wire Dynamic Database Token Override into Marketing Publishers

**Files:**
- Modify: `apps/api/src/modules/marketing/infrastructure/adapters/meta-graph-facebook-publisher.adapter.ts`
- Modify: `apps/api/src/modules/marketing/infrastructure/adapters/meta-graph-instagram-publisher.adapter.ts`
- Modify: `apps/api/src/modules/marketing/application/services/implementations/marketing-publisher.service.ts`
- Test: `apps/api/src/modules/marketing/application/services/implementations/marketing-publisher.service.test.ts`

**Interfaces:**
- Produces: When publishing approved campaign packages, `MarketingPublisherService` checks `SocialAccountRepository` for active valid token override before falling back to `process.env`.

- [ ] **Step 1: Write unit test in marketing-publisher.service.test.ts**
Verify that token from `SocialAccountRepository` takes precedence over `.env` when publishing to Facebook and Instagram.

- [ ] **Step 2: Implement dynamic token resolution in MarketingPublisherService**
Inject `SocialAccountRepository` (optional or required) into `MarketingPublisherService` and resolve active access token before dispatching to publisher adapter.

- [ ] **Step 3: Run tests to verify pass**
Run: `pnpm --filter @opendx/api test src/modules/marketing/application/services/implementations/marketing-publisher.service.test.ts`

- [ ] **Step 4: Commit Task 6**
Commit: `feat(marketing): wire dynamic social token resolution into campaign publisher`

---

### Task 7: Admin REST API Endpoints and Dependency Injection

**Files:**
- Modify: `apps/api/src/modules/marketing/presentation/controllers/marketing.controller.ts`
- Modify: `apps/api/src/modules/marketing/presentation/routes/marketing.routes.ts`
- Modify: `apps/api/src/modules/marketing/marketing.module.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/src/modules/marketing/tests/social-tokens.api.test.ts`

**Interfaces:**
- Endpoints:
  - `GET /v1/admin/marketing/social-tokens/status`
  - `POST /v1/admin/marketing/social-tokens/refresh`
  - `POST /v1/admin/marketing/social-tokens/oauth-exchange`
  - `POST /v1/admin/marketing/social-tokens/check`

- [ ] **Step 1: Write the failing API test**
Create `apps/api/src/modules/marketing/tests/social-tokens.api.test.ts` verifying all 4 endpoints, status codes, authentication, and responses.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @opendx/api test src/modules/marketing/tests/social-tokens.api.test.ts`

- [ ] **Step 3: Implement controller methods, routes, and wire in server.ts**
Add controller endpoints in `marketing.controller.ts`, register routes in `marketing.routes.ts`, instantiate in `marketing.module.ts`, and start monitor in `server.ts`.

- [ ] **Step 4: Run test to verify pass**
Run: `pnpm --filter @opendx/api test src/modules/marketing/tests/social-tokens.api.test.ts`

- [ ] **Step 5: Commit Task 7**
Commit: `feat(marketing): add admin social tokens api endpoints and server wiring`

---

### Task 8: Console API Client and Types

**Files:**
- Modify: `apps/console/src/features/marketing/api/marketing-api.ts`
- Modify: `apps/console/src/features/marketing/__tests__/marketing-api.test.ts`

**Interfaces:**
- Produces:
  - Types: `SocialTokenHealthView`, `SocialTokensSummaryView`
  - Methods on `MarketingApi`:
    - `getSocialTokensStatus(): Promise<SocialTokensSummaryView>`
    - `refreshSocialToken(platform: string, accountId: string): Promise<SocialTokenHealthView>`
    - `exchangeSocialOAuthCode(platform: string, code: string, redirectUri: string): Promise<SocialTokenHealthView>`
    - `checkSocialTokens(): Promise<SocialTokensSummaryView>`

- [ ] **Step 1: Write test for new MarketingApi methods**
Add test in `apps/console/src/features/marketing/__tests__/marketing-api.test.ts` mocking fetch calls.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @opendx/console test src/features/marketing/__tests__/marketing-api.test.ts`

- [ ] **Step 3: Implement methods and types in marketing-api.ts**
Export types and implement API methods.

- [ ] **Step 4: Run test to verify pass**
Run: `pnpm --filter @opendx/console test src/features/marketing/__tests__/marketing-api.test.ts`

- [ ] **Step 5: Commit Task 8**
Commit: `feat(console): add social token monitoring methods to marketing api client`

---

### Task 9: Staff Command Center UI, Alert Cards, Header Badges & Modal

**Files:**
- Create: `apps/console/src/features/marketing/components/social-token-manager-modal.tsx`
- Modify: `apps/console/src/features/agentic/components/agentic-command-center.tsx`
- Modify: `apps/console/src/features/agentic/styles/agentic-command-center.css`
- Test: `apps/console/src/features/agentic/tests/agentic-command-center-social-tokens.test.tsx`

**Interfaces:**
- Produces:
  - Header badge in Marketing column:
    - 🟢 `Social Token: OK`
    - 🟡 `⚡ Token FB hết hạn sau X ngày`
    - 🔴 `🚨 Token FB lỗi / hết hạn`
  - Alert Card in Marketing column when token requires action with 1-click `[⚡ Tự động Gia hạn ngay]` or `[🔗 1-Click Kết nối lại Facebook]` buttons.
  - `SocialTokenManagerModal` allowing detailed platform view and on-demand check.

- [ ] **Step 1: Write UI component test**
Create `agentic-command-center-social-tokens.test.tsx` testing badge rendering, alert card rendering on `expiring_soon` and `invalid`, 1-click refresh button click, and modal toggle.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @opendx/console test src/features/agentic/tests/agentic-command-center-social-tokens.test.tsx`

- [ ] **Step 3: Implement SocialTokenManagerModal, update AgenticCommandCenter and CSS**
Implement modal, hook up state and handlers in `agentic-command-center.tsx`, add dark/light CSS styles in `agentic-command-center.css`.

- [ ] **Step 4: Run tests and typecheck to verify pass**
Run: `pnpm --filter @opendx/console test src/features/agentic/tests/agentic-command-center-social-tokens.test.tsx`
Run: `pnpm --filter @opendx/console typecheck`

- [ ] **Step 5: Commit Task 9**
Commit: `feat(console): add social token health alert card, header badge, and manager modal`

---

### Task 10: End-to-End System Verification, Changelog & Wrap-up

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run full API test suite**
Run: `pnpm --filter @opendx/api test`

- [ ] **Step 2: Run full Console test suite**
Run: `pnpm --filter @opendx/console test`

- [ ] **Step 3: Run repository audit script**
Run: `bash scripts/audit/repo.sh`

- [ ] **Step 4: Update CHANGELOG.md under [Unreleased]**
Document all components of Sub-project B.

- [ ] **Step 5: Commit Task 10 and push to remote**
Commit: `chore: record social token expiration health monitor in changelog`
Run: `git push origin feat/live-agentic-workforce`
