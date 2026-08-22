#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

pnpm check:fast
pnpm --filter @opendx/console build
pnpm --filter @opendx/storefront build
pnpm test:py
pnpm test:make-database-backup
pnpm test:temporal-compose
pnpm test:agentic-production-compose
pnpm test:agentic-phase-b-exit
pnpm test:agentic-department-tools
pnpm test:agentic-phase-c-exit
pnpm test:agentic-model-runtime
pnpm test:openrouter-live
pnpm test:agentic-phase-d-exit
pnpm audit:repo
compose_env=()
if [[ -f .env ]]; then
  compose_env=(--env-file .env)
fi
docker compose "${compose_env[@]}" -f infra/docker/docker-compose.yml config >/dev/null
