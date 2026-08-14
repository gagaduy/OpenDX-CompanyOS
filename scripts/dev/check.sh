#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

git diff --check
pnpm lint
pnpm typecheck
pnpm --filter './packages/**' test
pnpm --filter @opendx/api test
pnpm --filter @opendx/console test
pnpm --filter @opendx/storefront test
pnpm --filter @opendx/console build
pnpm --filter @opendx/storefront build
pnpm test:py
pnpm test:make-database-backup
pnpm test:temporal-compose
pnpm audit:repo
compose_env=()
if [[ -f .env ]]; then
  compose_env=(--env-file .env)
fi
docker compose "${compose_env[@]}" -f infra/docker/docker-compose.yml config >/dev/null
