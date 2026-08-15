<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# VPS Production Compose

This directory contains the Phase 8 production-candidate Docker Compose and
Caddy examples for one VPS/VM. It is separate from the local development stack
in `infra/docker`.

## Files

- `compose.production.yml` builds production targets for API, Console,
  Storefront, AI Runtime, and worker, then runs PostgreSQL, pinned Temporal,
  MinIO, Keycloak, ClamAV, and Caddy on isolated edge/app/data/workflow networks.
- `Caddyfile` routes the placeholder HTTPS domains to the internal services and
  applies edge security headers.
- `Caddyfile.spa` serves the built Console and Storefront artifacts with SPA
  fallback; production images do not run Vite preview.
- `../temporal/dynamicconfig/production-sql.yaml` is the reviewed production
  dynamic configuration mounted by the pinned Temporal server.

## Before Running

Create a `.env.production` outside source control and replace every
`example.com` placeholder through the matching Caddy hostname variable:

- `STOREFRONT_HOST=shop.example.com`
- `CONSOLE_HOST=console.example.com`
- `API_HOST=api.example.com`
- `KEYCLOAK_HOST=auth.example.com`
- `storage.example.com` if storage is exposed later

Set all required secrets through the environment. Do not edit secrets into this
directory.

Set separate PostgreSQL admin/application passwords. The one-shot role job
migrates older volumes away from an application superuser. Production Keycloak
imports no local users, deletes repository-known legacy fixture identities, and
reconciles the Agentic machine clients on every boot.

Provision separate Temporal server/client certificate directories outside the
repository and mount them through `TEMPORAL_TLS_SERVER_DIR` and
`TEMPORAL_TLS_CLIENT_DIR`. All certificate mounts are read-only; the CA private
key is never mounted. See
`docs/deployment/production.md` for certificate generation, permissions,
first-boot order, schema upgrades, rollback, rotation, worker drain, readiness,
and the explicit single-node limitation.

Validate the example without starting services:

```bash
pnpm check:production-compose -- .env.production
pnpm check:agentic-production-compose -- .env.production
```

Production API startup intentionally fails closed if placeholder domains remain
while `OPENDX_ENV=production`.

Only Caddy publishes `80` and `443`. Temporal `7233`, AI Runtime, worker,
PostgreSQL, and internal Agentic routes are not edge-routable. Temporal's
private network uses mTLS for workload connection authentication; Express still
authorizes every workflow business action.

Back up and restore `opendx`, `temporal`, and `temporal_visibility` only as the
single recovery set documented in
[`docs/operations/backup-restore.md`](../../docs/operations/backup-restore.md).
