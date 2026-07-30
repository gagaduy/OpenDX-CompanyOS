<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Local Docker Infrastructure

This directory contains local-only infrastructure for OpenDX CompanyOS.

## Services

- PostgreSQL with pgvector target: `localhost:5432`
- Keycloak: `http://localhost:8080`
- Temporal: `localhost:7233`
- MinIO API: `http://localhost:9000`
- MinIO console: `http://localhost:9001`

The credentials and MinIO image tag in `docker-compose.yml` are local development choices and must not be reused in production.

## Commands

```bash
docker compose -f infra/docker/docker-compose.yml config
docker compose -f infra/docker/docker-compose.yml up -d
docker compose -f infra/docker/docker-compose.yml down
```
