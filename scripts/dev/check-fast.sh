#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

git diff --check
pnpm lint
pnpm typecheck
pnpm --workspace-concurrency=1 --filter './packages/**' --filter './apps/**' test
pnpm audit:repo
