<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Production Deployment

The production candidate targets one VPS or VM running Docker Compose behind
Caddy HTTPS. Temporal, its PostgreSQL schemas, AI Runtime, and the worker run
on private Docker networks with mutual TLS and no public workflow endpoint.

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
6. Provision Temporal CA, server, and client certificates as described below.
7. Build the production candidate images.
8. Run application and Temporal schema jobs before starting traffic.
9. Run seed only for a first install or an explicitly documented reset.
10. Start Temporal, AI Runtime, worker, Caddy, and application services.
11. Verify HTTPS routes, `/health/live`, `/health/ready`, and core storefront
    browsing.

Deployment is manual in Phase 8. GitHub Actions must not SSH into the VPS.
Phase 8 closure evidence includes `pnpm check:phase8-exit`, root `pnpm check`,
local commerce acceptance, and a recorded production SePay acceptance decision.
A successful production Compose config check alone is not a go-live approval.

The production-candidate files live under `infra/deploy/`:

```bash
pnpm check:production-compose -- .env.production
docker compose --env-file .env.production -f infra/deploy/compose.production.yml config --quiet
docker compose --env-file .env.production -f infra/deploy/compose.production.yml up --build -d
```

The examples include placeholders so contributors can inspect the topology from
source. The API still refuses to start in `OPENDX_ENV=production` until those
placeholder domains are replaced with real HTTPS domains.

## Required Production Environment Groups

- Public origins: `CONSOLE_ORIGIN`, `STOREFRONT_ORIGIN`, the matching
  `CONSOLE_HOST`, `STOREFRONT_HOST`, `API_HOST`, `KEYCLOAK_HOST` Caddy names,
  Keycloak issuer, and optional storage host.
- Cookies: `COOKIE_SECURE=true`, stable customer/guest/CSRF cookie names, and
  HTTPS-only origins.
- Database: independent `POSTGRES_ADMIN_PASSWORD` and application
  `POSTGRES_PASSWORD` values, database names, and backup target. The API always
  uses the non-superuser `opendx` role.
- Object storage: MinIO endpoint, access key, secret key, product-media bucket,
  and private support attachment bucket.
- Identity: Keycloak issuer, JWKS URL, API audience, Console OIDC values, and
  optional Google client ID.
- Payment: SePay environment, provider URLs, merchant ID, secret key, IPN
  secret, callback URLs, timeout, `PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND`, and
  optional `PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION`.
- Observability: `LOG_FORMAT`, `LOG_LEVEL`, `METRICS_ENABLED`, `METRICS_PATH`,
  `READINESS_TIMEOUT_MS`, and `JSON_BODY_LIMIT`.
- Agentic workload identity: distinct control and worker client IDs, audiences,
  and independently generated client secrets.
- Temporal: database password, server/client certificate directories, private
  server name `temporal.internal`, and the shared certificate-reader group ID.

## Temporal Certificate Provisioning

Use an organizational private CA when available. For a standalone candidate,
the following OpenSSL outline creates the required material outside the
repository. Keep the CA private key offline and never mount it into a
container.

```bash
sudo install -d -o root -g 20000 -m 0750 \
  /etc/opendx/temporal-tls/server /etc/opendx/temporal-tls/client
sudo install -d -o root -g root -m 0700 /etc/opendx/pki-private
sudo openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 \
  -out /etc/opendx/pki-private/temporal-ca-key.pem
sudo openssl req -x509 -new -sha256 -days 3650 \
  -key /etc/opendx/pki-private/temporal-ca-key.pem \
  -subj '/CN=OpenDX Temporal CA' \
  -out /etc/opendx/pki-private/temporal-ca.pem
sudo install -m 0444 /etc/opendx/pki-private/temporal-ca.pem \
  /etc/opendx/temporal-tls/server/ca.pem
sudo install -m 0444 /etc/opendx/pki-private/temporal-ca.pem \
  /etc/opendx/temporal-tls/client/ca.pem

sudo openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 \
  -out /etc/opendx/temporal-tls/server/server-key.pem
sudo openssl req -new -key /etc/opendx/temporal-tls/server/server-key.pem \
  -subj '/CN=temporal.internal' -out /tmp/temporal-server.csr
printf 'subjectAltName=DNS:temporal.internal\nextendedKeyUsage=serverAuth,clientAuth\n' | \
  sudo openssl x509 -req -sha256 -days 397 -in /tmp/temporal-server.csr \
  -CA /etc/opendx/pki-private/temporal-ca.pem \
  -CAkey /etc/opendx/pki-private/temporal-ca-key.pem -CAcreateserial \
  -extfile /dev/stdin -out /etc/opendx/temporal-tls/server/server.pem

sudo openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 \
  -out /etc/opendx/temporal-tls/client/client-key.pem
sudo openssl req -new -key /etc/opendx/temporal-tls/client/client-key.pem \
  -subj '/CN=opendx-temporal-client' -out /tmp/temporal-client.csr
printf 'extendedKeyUsage=clientAuth\n' | \
  sudo openssl x509 -req -sha256 -days 397 -in /tmp/temporal-client.csr \
  -CA /etc/opendx/pki-private/temporal-ca.pem \
  -CAkey /etc/opendx/pki-private/temporal-ca-key.pem -CAcreateserial \
  -extfile /dev/stdin -out /etc/opendx/temporal-tls/client/client.pem

sudo chown root:root /etc/opendx/temporal-tls/server/{ca,server}.pem \
  /etc/opendx/temporal-tls/client/{ca,client}.pem
sudo chown root:20000 /etc/opendx/temporal-tls/server/server-key.pem \
  /etc/opendx/temporal-tls/client/client-key.pem
sudo chmod 0444 /etc/opendx/temporal-tls/server/{ca,server}.pem \
  /etc/opendx/temporal-tls/client/{ca,client}.pem
sudo chmod 0440 /etc/opendx/temporal-tls/server/server-key.pem \
  /etc/opendx/temporal-tls/client/client-key.pem
```

Set `TEMPORAL_TLS_SERVER_DIR=/etc/opendx/temporal-tls/server`,
`TEMPORAL_TLS_CLIENT_DIR=/etc/opendx/temporal-tls/client`, and
`TEMPORAL_TLS_GROUP_ID=20000` in `.env.production`. Compose mounts each least-
privilege directory read-only and adds the matching reader group. The server
certificate must contain both `serverAuth` and `clientAuth` because the
single-process Temporal server also makes internode TLS calls, plus
`DNS:temporal.internal`; Python clients explicitly validate that name.

## First Boot And Readiness

Render and inspect the topology before creating containers:

```bash
pnpm check:production-compose -- .env.production
pnpm check:agentic-production-compose -- .env.production
docker compose --env-file .env.production -f infra/deploy/compose.production.yml config --quiet
docker compose --env-file .env.production -f infra/deploy/compose.production.yml up --build -d --wait
```

Compose orders PostgreSQL, application-role isolation, Temporal database and
schema creation, Keycloak workload-client reconciliation, the mTLS cluster
health and namespace job, AI Runtime, API, and worker. `postgres-role-init`
also migrates an older volume whose `opendx` role was the bootstrap superuser:
it transfers ownership to a new non-superuser role and disables the legacy
role. A failed one-shot job blocks downstream startup. Inspect it with:

```bash
docker compose --env-file .env.production -f infra/deploy/compose.production.yml ps
docker compose --env-file .env.production -f infra/deploy/compose.production.yml logs postgres-role-init temporal-db-init temporal-schema keycloak-reconcile temporal-namespace
docker compose --env-file .env.production -f infra/deploy/compose.production.yml exec ai-runtime \
  python -c "import httpx; print(httpx.get('http://localhost:8000/ready').status_code)"
docker compose --env-file .env.production -f infra/deploy/compose.production.yml exec ai-worker \
  python -m app.agentic.worker_healthcheck
```

The production realm import contains roles and clients but no users and no
local lifecycle password-grant client. `keycloak-reconcile` creates or replaces
the two Agentic machine clients on both new and upgraded volumes. During an
upgrade from the local realm, it also deletes the repository-known fixture users
and `opendx-lifecycle-check` client before workloads start. Provision the first
application staff administrator separately in the `opendx` realm. For deployment
reconciliation, provision a dedicated replacement administrator in the Keycloak
`master` realm, require a new non-repository password, and configure that
account through `KEYCLOAK_ADMIN` and `KEYCLOAK_ADMIN_PASSWORD`. Verify
`keycloak-reconcile` with the replacement master realm account first.
Do not disable the bootstrap administrator until the replacement has the required
permissions to manage the `opendx` realm and a successful reconciliation has
been recorded; future upgrades fail closed when no configured administrator can
reconcile clients.

Only Caddy publishes ports. PostgreSQL, Temporal `7233`, AI Runtime, the worker,
and `/v1/internal/agentic` remain private and have no Caddy route.

## Temporal Authorization Boundary

`TEMPORAL_ALLOW_NO_AUTH=true` is deliberate only on the private `workflow`
network. Temporal requires a client certificate signed by the deployment CA,
which authenticates the workload connection. It does not authorize a business
action. Express remains authoritative for staff/workload JWT identity, task
ownership, policy, budget, approval binding, callback evidence, and audit.
Certificates are never shared with Agents and never determine Agent permissions.

## Upgrade, Rollback, And Drain

Before changing the Temporal server image or SDK, pass replay tests and create
the three-database recovery set. Drain the worker with
`docker compose ... stop -t 45 ai-worker`; its internal 30-second grace stops
new polls and allows in-flight activity completion. Keep a V1-compatible worker
available while V1 histories remain open.

Run `postgres-role-init`, `temporal-db-init`, `temporal-schema`, and
`keycloak-reconcile` before starting workloads, then run `temporal-namespace`
to verify mTLS and the namespace. Temporal database schema downgrade is not
assumed safe. Roll back
only to a documented server/schema-compatible image or restore the complete
pre-upgrade recovery set; never restore only one of the three databases.

For leaf-certificate rotation under the same CA, issue replacements and
atomically replace the files inside the mounted server/client directories.
Directory bind mounts preserve visibility across inode replacement. Wait at
least the configured one-minute server refresh, drain/restart the worker, and
restart AI Runtime so clients reload their key material. For CA rotation, first
deploy a CA bundle trusting old and new roots,
rotate server and client leaves, restart all Temporal clients/server, then
remove the old root in a second deployment. Verify readiness after every stage.

## Availability Limitation

This is a production-capable single-node candidate, not a highly available
deployment. Loss of the VPS or its PostgreSQL volume interrupts Commerce and
workflow execution until restart or restore. It has no automatic failover,
PostgreSQL replica, multi-node Temporal cluster, or Kubernetes control plane.
Those capabilities require a separately approved deployment design.

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
