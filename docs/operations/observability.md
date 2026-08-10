<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Observability Operations

OpenDX Phase 8 keeps observability lightweight for the one-VPS deployment:
PII-safe application logs, dependency-aware readiness, liveness, and a bounded
plain-text metrics endpoint.

## Production Checks

Use the production Compose file from the repository root:

```bash
docker compose -f infra/deploy/compose.production.yml ps
docker compose -f infra/deploy/compose.production.yml logs api
curl -fsS https://api.example.com/health/live
curl -fsS https://api.example.com/health/ready
curl -fsS https://api.example.com/metrics
```

Replace `api.example.com` with the configured production API domain.

## Log Redaction

API request logs include method, stable route label, status code, duration, and
correlation ID. The logger redacts fields whose names indicate secrets or PII,
including tokens, cookies, CSRF values, passwords, authorization headers,
emails, phone numbers, addresses, payloads, and object keys.

Do not add arbitrary request bodies, customer identifiers, raw URLs, attachment
object keys, or payment provider secrets to logs.

## Metrics

`GET /metrics` is mounted only when `METRICS_ENABLED=true`. Labels must stay
bounded: method, stable route label, and status. Raw URLs and customer-provided
values must not be used as labels.

Core signals:

- `/health/live` failing means the API process is unhealthy.
- `/health/ready` failing means at least one required dependency is unavailable.
- Increasing 5xx request metrics indicate application or dependency incidents.
- Long request duration sums with stable request counts indicate downstream
  latency.

## Phase 8 Local Gates

With the local stack running, use:

```bash
pnpm check:phase8-accessibility
pnpm check:phase8-performance
```

The performance gate runs 20 sequential requests per public API target and
fails when p95 latency exceeds the configured threshold.

`pnpm check:phase8-exit` combines the production topology, authorization,
payment guard, backup/restore safety, browser accessibility, performance, and
repository audit gates without running real production SePay acceptance.
