#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

python3 /home/duy/Olympic/TraceGuard/.agents/skills/build-open-source-repository/scripts/audit_repo.py . --spdx-id Apache-2.0
