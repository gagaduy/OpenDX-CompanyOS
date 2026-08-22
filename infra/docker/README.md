<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Local Docker Infrastructure

This directory contains local-only infrastructure for OpenDX CompanyOS.

## Services

- PostgreSQL 18: `localhost:5432`
- Keycloak: `http://localhost:8080`
- MinIO API: `http://localhost:9000`
- MinIO console: `http://localhost:9001`
- ClamAV: internal `clamav:3310` only; no host port is exposed
- API: `http://localhost:4000`
- Console: `http://localhost:3000`
- Storefront: `http://localhost:3100`

All images use reviewed version tags and pinned digests. Credentials are
local-development values and must not be reused in production.

## Commands

```bash
make up
make logs
make check
make check-crm-support-dashboard
make down
```

PostgreSQL must become healthy before Catalog → Company Core → Inventory →
Customer → Cart → Promotion → Checkout → Order → Payment → CRM → Support →
Agentic migrations. MinIO must
become healthy before bucket bootstrap. The Company Core → Catalog → Inventory
→ Promotion idempotent seed runs only after both jobs, then the API waits for
Keycloak and seed completion before the Console and Storefront start. `make up`
waits for service health; normal shutdown preserves the `opendx_postgres` and
`opendx_minio` volumes. ClamAV signatures persist in
`opendx_clamav_signatures`; first startup can take several minutes while
signatures download. Allocate about 4 GB of memory to Docker for reliable
scanner startup.

The development Storefront mounts both `apps/storefront/src` and its read-only
`public` assets so UI and product-canvas changes appear without rebuilding the
container image.

API readiness checks every implemented module migration table, Keycloak, both
MinIO buckets, and ClamAV `zPING`. It never probes the external SePay sandbox.
Inventory and Checkout expiry workers use the same 900-second authority window
with separate 30-second scan settings. Support attachment scanning fails closed:
quarantined files remain unavailable until ClamAV marks them clean, and
infected files are deleted while metadata remains as a rejected tombstone.
Reconciliation starts only when all three SePay credentials are configured.
Phase A Agent service clients are configured in Keycloak without tracked
secrets, but no Agent worker, OpenRouter, SePay, or Temporal container is
started. Use `POSTGRES_PORT=<free-port> make up`
when host port 5432 is occupied; internal service connections remain on 5432.

Use `docker compose --env-file .env -f infra/docker/docker-compose.yml up -d --wait clamav`
to run a Compose-backed local scanner health check. Restarting the ClamAV
container keeps signatures because `/var/lib/clamav` is backed by the
persistent `opendx_clamav_signatures` volume.

See `docs/development/catalog-local-environment.md` and
`docs/development/storefront-local-environment.md` plus
`docs/development/database-operations.md`, `docs/integrations/sepay.md`, and
`docs/operations/crm-support-dashboard.md` for seed, identity, payment, CRM,
Support, Dashboard, backup, restore, and troubleshooting workflows.
