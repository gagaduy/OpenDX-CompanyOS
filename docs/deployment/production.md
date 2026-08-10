<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Production Deployment

Phase 8 targets one VPS or VM running Docker Compose behind Caddy HTTPS. This
document is the production contract baseline; the concrete production Compose
and Caddy files are added by the Phase 8 deployment task.

## Hosting Target

- One Linux VPS/VM.
- Docker and Docker Compose installed.
- DNS records pointing to the VPS.
- Firewall allows inbound `80/tcp` and `443/tcp`; application service ports
  stay on the Docker network unless a runbook explicitly exposes them.
- Caddy terminates TLS and routes to Storefront, Console, API, and Keycloak.
- PostgreSQL and MinIO use Docker volumes on the VPS.

Until real domains are provided, docs use these placeholders:

| Surface | Placeholder |
| --- | --- |
| Storefront | `shop.example.com` |
| Console | `console.example.com` |
| API | `api.example.com` |
| Keycloak | `auth.example.com` |
| Storage/admin if exposed | `storage.example.com` |

`OPENDX_ENV=production` must not start with those placeholders. Replace them
with real HTTPS domains in `.env.production`.

## Manual Deploy Outline

1. Prepare the VPS with Docker, Compose, DNS, and firewall rules.
2. Copy the repository or versioned release artifact to the VPS.
3. Create `.env.production` from `.env.example`; never commit it.
4. Replace every placeholder domain and local-only credential.
5. Configure production SePay values only through environment or secret
   injection.
6. Build the production candidate images.
7. Run migrations before starting traffic.
8. Run seed only for a first install or an explicitly documented reset.
9. Start Caddy and application services.
10. Verify HTTPS routes, `/health/live`, `/health/ready`, and core storefront
    browsing.

Deployment is manual in Phase 8. GitHub Actions must not SSH into the VPS.

The production-candidate files live under `infra/deploy/`:

```bash
pnpm check:production-compose
docker compose --env-file .env.production -f infra/deploy/compose.production.yml config --quiet
docker compose --env-file .env.production -f infra/deploy/compose.production.yml up --build -d
```

The examples include placeholders so contributors can inspect the topology from
source. The API still refuses to start in `OPENDX_ENV=production` until those
placeholder domains are replaced with real HTTPS domains.

## Required Production Environment Groups

- Public origins: `CONSOLE_ORIGIN`, `STOREFRONT_ORIGIN`, Keycloak issuer, and
  optional storage host.
- Cookies: `COOKIE_SECURE=true`, stable customer/guest/CSRF cookie names, and
  HTTPS-only origins.
- Database: `DATABASE_URL`, PostgreSQL user, password, database, and backup
  target.
- Object storage: MinIO endpoint, access key, secret key, product-media bucket,
  and private support attachment bucket.
- Identity: Keycloak issuer, JWKS URL, API audience, Console OIDC values, and
  optional Google client ID.
- Payment: SePay environment, provider URLs, merchant ID, secret key, IPN
  secret, callback URLs, timeout, and production acceptance guard settings.
- Observability: `LOG_FORMAT`, `LOG_LEVEL`, `METRICS_ENABLED`, `METRICS_PATH`,
  `READINESS_TIMEOUT_MS`, and `JSON_BODY_LIMIT`.

## Production Fail-Closed Rules

The API rejects unsafe production combinations, including:

- `COOKIE_SECURE=false`;
- non-HTTPS Storefront or SePay callback URLs;
- sandbox SePay endpoints while `OPENDX_ENV=production`;
- incomplete SePay credential sets;
- placeholder production domains;
- identical product-media and support-attachment MinIO buckets.

## Local-to-Production Differences

Local development may use HTTP, local-only credentials, Vite dev servers, and
sandbox SePay. Production uses HTTPS origins, secure cookies, real DNS, Caddy,
production-safe secrets, persistent Docker volumes, explicit backup/restore,
and opt-in payment acceptance.
