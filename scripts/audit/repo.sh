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
  infra/docker/docker-compose.yml
)

for required_file in "${required_files[@]}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "Repository audit failed: missing ${required_file}" >&2
    exit 1
  fi
done

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
