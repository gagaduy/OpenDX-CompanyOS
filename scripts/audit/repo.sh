#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${repository_root}"

required_files=(
  LICENSE
  README.md
  CONTRIBUTING.md
  CODE_OF_CONDUCT.md
  SECURITY.md
  CHANGELOG.md
  AGENTS.md
  .env.example
  package.json
  pnpm-lock.yaml
  Makefile
  infra/docker/docker-compose.yml
  apps/api/Dockerfile
  apps/console/Dockerfile
  services/ai-runtime/Dockerfile
)

for required_file in "${required_files[@]}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "Repository audit failed: missing ${required_file}" >&2
    exit 1
  fi
done

expected_make_targets="check check-crm-support-dashboard db-backup db-migrate db-restore db-rollback db-seed down help logs up"
actual_make_targets="$(sed -n 's/^\([a-z][a-z-]*\):.*/\1/p' Makefile | sort -u | tr '\n' ' ' | sed 's/ $//')"
if [[ "${actual_make_targets}" != "${expected_make_targets}" ]]; then
  echo "Repository audit failed: Makefile targets must be exactly: ${expected_make_targets}" >&2
  exit 1
fi

compose_file="infra/docker/docker-compose.yml"
if grep -Eq '(^|[[:space:]])temporal:|:latest([[:space:]]|$)' "${compose_file}"; then
  echo "Repository audit failed: active Compose cannot contain Temporal or latest images" >&2
  exit 1
fi

for required_compose_text in \
  "healthcheck:" \
  "opendx_postgres:" \
  "opendx_minio:" \
  "--import-realm" \
  "minio-bootstrap:" \
  "migrate:" \
  "seed:" \
  "db:migrate:all" \
  "db:seed:all"; do
  if ! grep -q -- "${required_compose_text}" "${compose_file}"; then
    echo "Repository audit failed: Compose is missing ${required_compose_text}" >&2
    exit 1
  fi
done

if grep -R "InMemoryCompanyOperatingCoreRepository" apps/api/src/server.ts apps/api/src/app.ts >/dev/null; then
  echo "Repository audit failed: production Company Core cannot use memory persistence" >&2
  exit 1
fi

if git ls-files 'infra/backups/*.dump' | grep -q .; then
  echo "Repository audit failed: database backup archives must not be tracked" >&2
  exit 1
fi

if ! grep -q "Apache License" LICENSE; then
  echo "Repository audit failed: LICENSE is not Apache-2.0" >&2
  exit 1
fi

if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo "Repository audit failed: .env must not be tracked" >&2
  exit 1
fi

missing_spdx=0
while IFS= read -r source_file; do
  if ! head -n 12 "${source_file}" | grep -q "SPDX-License-Identifier: Apache-2.0"; then
    echo "Repository audit failed: missing Apache-2.0 SPDX header in ${source_file}" >&2
    missing_spdx=1
  fi
done < <(git ls-files '*.ts' '*.tsx' '*.py' '*.sh' | sort -u)

if [[ "${missing_spdx}" -ne 0 ]]; then
  exit 1
fi

echo "Repository audit passed"
