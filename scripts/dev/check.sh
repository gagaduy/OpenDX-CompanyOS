#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

git diff --check
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @opendx/console build
pnpm test:py
pnpm audit:repo
docker compose -f infra/docker/docker-compose.yml config >/dev/null
