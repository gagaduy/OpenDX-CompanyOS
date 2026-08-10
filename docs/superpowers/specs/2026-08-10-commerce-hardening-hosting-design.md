<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Commerce Hardening and Hosting Readiness Design

**Date:** 2026-08-10

**Status:** Approved focused design

**Phase:** 8 — Production Hardening and Hosting Readiness

## 1. Purpose

Phase 8 turns the completed NovaCommerce commerce foundation into a deployable,
recoverable, security-reviewed VPS/VM production candidate. The phase keeps the
same modular monolith, React frontends, PostgreSQL, MinIO, Keycloak, ClamAV, and
Docker Compose shape used locally, then hardens the runtime contract, deployment
docs, CI checks, backup/restore operations, observability, payment go-live
controls, accessibility, and performance evidence.

Phase 8 does not add a new product domain. It makes the existing commerce
system safer to operate from source and from versioned container artifacts.

## 2. Approved Decisions

- Host the production candidate on one VPS/VM using Docker Compose.
- Use Caddy as the HTTPS reverse proxy and certificate automation layer.
- Run PostgreSQL and MinIO on the VPS through Docker volumes.
- Keep deploy manual for this phase. GitHub Actions runs CI, source, security,
  and artifact checks but does not SSH into the VPS.
- Do not add production email or SMS integration.
- Add structured logs, separated liveness/readiness, a bounded metrics
  endpoint, and operator runbooks. Do not add Prometheus or Grafana containers
  in this phase.
- Prepare SePay production credentials through environment and secret
  injection. The production acceptance runner is opt-in, requires explicit
  human confirmation, uses the minimum provider-supported amount or 10,000 VND,
  and never runs in default CI.
- Back up PostgreSQL and MinIO daily and retain seven days by default.
- Verify restore on a separate database or staging target before touching
  production data.
- Use placeholder production domains in documentation until a real domain is
  provided: `shop.example.com`, `console.example.com`, `api.example.com`,
  `auth.example.com`, and `storage.example.com`.
- Use the MVP VPS performance target: Storefront initial load under 3 seconds,
  API read p95 under 300 ms, Dashboard/reporting p95 under 1.5 seconds with the
  approved scale fixture, and no horizontal overflow on mobile.

## 3. Goals

- Produce a documented VPS deployment path using Docker Compose, Caddy, pinned
  images, HTTPS origins, persistent volumes, and explicit secrets.
- Build production-friendly container images that run as non-root users with
  minimal runtime contents and deterministic build inputs.
- Separate liveness and readiness so failed dependencies do not report ready.
- Enforce production cookie, CORS, CSRF, security-header, body-size, rate-limit,
  and webhook isolation policies.
- Document and test staff role/resource/action permissions and customer
  ownership rules as deny-by-default authorization matrices.
- Harden payment go-live with threat modeling and regression tests for replay,
  forged webhook, idempotency collision, amount tampering, secret leakage, and
  log redaction.
- Add backup, restore, rollback, credential rotation, incident response, and
  production SePay runbooks.
- Add CI checks for source validation, dependency/license/security policy,
  container build, Compose config, docs drift, and explicit opt-in production
  payment acceptance.
- Capture accessibility and performance gates for the critical Storefront and
  Console flows.

## 4. Non-goals

Phase 8 does not add:

- Kubernetes, Helm, Terraform, or cloud-provider-specific infrastructure;
- automatic SSH deployment from GitHub Actions;
- managed PostgreSQL, managed S3, CDN, or object-storage replication;
- production email, SMS, live chat, shipping, refunds, returns, subscriptions,
  electronic invoices, or multiple currencies;
- Prometheus, Grafana, Tempo, Loki, or a new observability service;
- Redis, a queue, a scheduler service, or a separate analytics database;
- marketplace, multi-store, multi-warehouse, Workflow Builder, Digital
  Employees, GraphRAG, or AI-driven operations;
- any source-code path that hard-codes production domains, payment credentials,
  or provider secrets.

## 5. Deployment Topology

The approved production candidate runs these services on one VPS/VM:

```text
Internet
  -> Caddy :80/:443
    -> Storefront :3100
    -> Console :3000
    -> API :4000
    -> Keycloak :8080
    -> MinIO API/admin only when explicitly exposed

Docker volumes:
  postgres-data
  minio-data
  keycloak-data if the selected Keycloak image mode requires it
  backup-output
```

Caddy owns TLS termination, HTTP-to-HTTPS redirects, host routing, response
security headers, and request-size guardrails that are safe at the edge. The API
still enforces application security, CORS, CSRF, auth, payment webhook
authentication, and body limits. Edge checks complement backend checks; they do
not replace them.

The repository must contain a production Compose example under `infra/deploy/`
that is clearly separated from the local development Compose file. The example
must use environment variables and `.env.production.example` placeholders, not
real credentials. It must keep local development unchanged.

## 6. Runtime Configuration Contract

Phase 8 defines a production environment contract with these groups:

- Public origins: Storefront, Console, API, Keycloak, and optional storage
  admin/API hostnames.
- Cookies: secure-only production customer, guest, CSRF, and staff session
  settings.
- Staff identity: Keycloak issuer, realm, client IDs, and redirect origins.
- Customer identity: Google web client ID and backend audience validation.
- Database: PostgreSQL connection URL, user, password, database, pool limits,
  backup target, and restore target.
- Object storage: MinIO endpoint, bucket names, access key, secret key, private
  attachment bucket, product-media bucket, and public exposure policy.
- Malware scan: ClamAV host/port and scan timeout.
- Payment: SePay environment, checkout URL, API base URL, merchant ID, secret
  key, IPN secret, callback URLs, timeout, and production acceptance amount.
- Observability: log level, service name, metrics enablement, readiness timeout,
  and correlation ID settings.

Production startup fails closed when required production values are missing,
unsafe, or contradictory. Examples include `COOKIE_SECURE=false` on HTTPS
origins, wildcard production CORS, empty SePay production secrets when
production payment mode is enabled, and placeholder domains in a production
runtime mode.

## 7. Health, Readiness, and Shutdown

Liveness answers whether the process is running and can serve a technical
health response. Readiness answers whether the service should receive traffic.

API readiness must verify PostgreSQL connectivity and required infrastructure
configuration. It must not require external SePay availability because provider
outage should not make read-only commerce operations unhealthy. Payment-specific
failure is surfaced through payment operations, metrics, and logs.

Storefront and Console readiness verify that the frontend process serves the
compiled application. Caddy readiness is documented through direct route checks
against HTTPS hosts.

All Node and Python services handle `SIGTERM` gracefully: stop accepting new
connections, allow in-flight requests within a bounded timeout, close database
pools and HTTP servers, and exit with a clear status.

## 8. Security Hardening

Phase 8 security work covers these concrete controls:

- HTTPS-only production browser origins.
- `Secure`, `HttpOnly` where applicable, `SameSite`, path-bounded cookies, and
  documented domain behavior.
- Strict Storefront and Console CORS allowlists.
- CSRF double-submit strategy for storefront customer mutations and appropriate
  staff mutation protection through the existing staff auth boundary.
- Security headers through Caddy and/or application middleware: CSP,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and
  frame restrictions.
- Bounded JSON and multipart request sizes at edge and API.
- Rate limits for authentication, cart mutations, checkout/payment initiation,
  support attachment upload, and payment webhook endpoints where safe.
- Payment webhook isolation by path, method, body parsing, IPN secret
  validation, redaction, and idempotency.
- Deny-by-default authorization matrix for staff roles, resources, and actions.
- Customer ownership tests for account, address, cart, checkout, payment,
  order, support context, and attachments.
- Secret redaction in logs, test evidence, CI output, and docs.

No role may gain production power from hidden frontend navigation alone. Every
permission remains enforced in backend middleware, services, or repository
ownership queries.

## 9. Payment Production Readiness

Production SePay activation is environment-only. Source code must not branch on
hard-coded production merchant identifiers or committed secrets. Switching from
sandbox to production changes `SEPAY_ENVIRONMENT`, provider URLs, callback
URLs, and injected secrets.

The payment threat model covers:

- forged IPN authentication;
- replayed IPN and reconciliation events;
- duplicate provider identifiers;
- idempotency-key reuse with a changed fingerprint;
- browser amount, address, promotion, or cart tampering;
- mismatched invoice number, order ID, currency, or amount;
- provider timeout and unknown state handling;
- secret leakage through logs, errors, screenshots, CI, or docs;
- hosted HTTPS callback failure and retry behavior;
- manual production acceptance safety.

The production acceptance runner is explicit and separate from normal checks.
It requires a human confirmation variable, production credentials, hosted HTTPS
callback URLs, and a positive amount equal to the minimum provider-supported
amount or 10,000 VND. It records only redacted evidence: run ID, internal
checkout/order/payment IDs, final states, timestamps, and pass/fail reason.

## 10. Backup, Restore, and Recovery

Production backup uses daily PostgreSQL custom-format dumps and MinIO object
backup snapshots. The default retention is seven days. Backup output is outside
source control and must not be served publicly.

Restore documentation and scripts must support:

- verifying a selected backup file before restore;
- restoring PostgreSQL to a separate database or staging target first;
- restoring MinIO objects to a separate bucket/prefix or staging target first;
- checking migration compatibility before promoting restored data;
- documenting RPO/RTO expectations for the single-VPS MVP;
- stopping if the target database, bucket, or path is ambiguous.

Destructive restore commands require explicit target validation and must not use
unchecked broad paths, default home directories, or wildcard deletion.

## 11. Observability and Operations

Phase 8 keeps observability lightweight and source-runnable:

- structured JSON logs for API and workers with timestamp, level, service,
  correlation ID, actor type where safe, route/action, duration, outcome, and
  redacted error code;
- no customer PII, credentials, provider payload secrets, object keys, raw
  tokens, or CSRF values in logs;
- a bounded metrics endpoint for counters and histograms that do not expose PII;
- documented operator checks for health, readiness, logs, failed payments,
  pending reconciliation, support scan failures, backup age, and disk usage;
- incident runbooks for payment callback failure, database unavailable, MinIO
  unavailable, ClamAV unavailable, Keycloak unavailable, restore procedure,
  credential rotation, and rollback.

Trace propagation may remain limited to correlation IDs in this phase. Full
OpenTelemetry export is deferred unless the implementation plan finds it is
already present and can be enabled without adding a new service.

## 12. Accessibility and Performance

Accessibility gates cover the critical user journeys:

- Storefront product discovery, product detail, cart, sign-in gate, account
  address management, checkout, payment return, and order history.
- Console order operations, payment review, Customer 360, Support queue/detail,
  attachment flows, and Dashboard.

Checks must include keyboard navigation, visible focus, semantic landmarks,
form labels, status/alert announcements, color contrast review, and no
horizontal overflow at mobile widths.

Performance gates use the MVP VPS targets:

- Storefront initial load under 3 seconds on staging.
- API read p95 under 300 ms for catalog, cart read, account read, order read,
  CRM search/detail, support queue/detail, and reporting reads.
- Dashboard/reporting p95 under 1.5 seconds with the approved scale fixture.
- Product media delivery remains bounded and does not require public MinIO
  bucket access.

Performance evidence must be reproducible from scripts or documented commands.

## 13. CI and Source Governance

GitHub Actions in Phase 8 must validate the source without deploying it:

- install and cache dependencies;
- run source checks, typecheck, tests, builds, repo audit, and Compose config;
- build the production candidate images;
- run dependency, license, secret, and container policy checks available within
  the repository's dependency policy;
- verify `.env.example` and production env docs stay aligned with runtime
  validation;
- keep production SePay acceptance out of default CI and require opt-in secrets
  plus human confirmation.

CI output must not print secrets, customer PII, raw provider payloads, tokens,
or production callback URLs when configured as secrets.

## 14. Documentation Deliverables

Phase 8 creates or updates:

- `infra/deploy/` VPS Compose and Caddy examples for the approved target;
- `.env.example` and production environment documentation;
- `docs/deployment/production.md`;
- `docs/operations/backup-restore.md`;
- `docs/operations/observability.md`;
- `docs/security/authorization-matrix.md`;
- `docs/security/payment-threat-model.md`;
- `SECURITY.md`;
- `docs/build-from-source.md`;
- `docs/dependencies.md`;
- `docs/roadmap/mvp-status.md`;
- `CHANGELOG.md`;
- GitHub Actions workflows under `.github/workflows/`.

Documentation must state local-to-production differences explicitly and must not
contain real domains, credentials, tokens, customer records, provider payloads,
or temporary tunnel URLs.

## 15. Phase 8 Exit Gate

Phase 8 is complete only when fresh evidence proves all of these:

1. Production candidate Compose and Caddy examples are internally consistent and
   validated from source.
2. Versioned images build successfully and run as non-root processes.
3. Liveness and readiness behave differently, and failed PostgreSQL readiness
   fails closed.
4. Production configuration validation rejects unsafe cookie, CORS, secret, and
   placeholder-domain combinations.
5. Authorization and ownership matrix tests pass for staff, customer, and
   payment/support resources.
6. Payment threat-model regression tests pass for replay, forgery, amount
   mismatch, idempotency conflict, and redaction.
7. Backup and restore scripts or documented commands successfully restore
   PostgreSQL and MinIO to isolated targets.
8. Observability endpoints and runbooks expose actionable, PII-safe evidence.
9. Accessibility checks pass for critical Storefront and Console flows.
10. Performance checks meet the MVP VPS targets or document a reviewed,
    bounded exception.
11. CI checks pass without deploying or printing secrets.
12. The full commerce acceptance demo still works locally.
13. Production SePay acceptance is either run with explicit human confirmation
    and redacted evidence or recorded as blocked by missing real merchant/VPS
    prerequisites without weakening sandbox acceptance.
14. Roadmap, build, deployment, security, dependency, operations, and changelog
    docs all match the implemented behavior.

Failure of any required item leaves Phase 8 in progress.

## 16. Implementation Order

The implementation plan should preserve this order:

1. Write production environment and deployment documentation contracts.
2. Harden image/runtime configuration, liveness/readiness, graceful shutdown,
   and Caddy/Compose examples.
3. Add security headers, body limits, rate limits, production cookie/CORS
   validation, and authorization matrix tests.
4. Add payment threat-model tests and opt-in production acceptance runner.
5. Add backup/restore scripts, validation, and operations docs.
6. Add structured logs, metrics endpoint, and observability runbooks.
7. Add accessibility and performance gates.
8. Add GitHub Actions CI/security workflows.
9. Run full local and hosted/staging readiness checks, update roadmap evidence,
   and close Phase 8 only after the exit gate passes.

