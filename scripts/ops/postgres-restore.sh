#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

backup_file="${BACKUP_FILE:?BACKUP_FILE is required}"
target_database_url="${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
source_database_url="${DATABASE_URL:-}"
resolved_backup="$(realpath -m "$backup_file")"

case "$resolved_backup" in
  *.dump) ;;
  *)
    echo "BACKUP_FILE must resolve to a .dump archive: $resolved_backup" >&2
    exit 1
    ;;
esac
test -f "$resolved_backup"

if [[ -n "$source_database_url" && "$target_database_url" == "$source_database_url" ]]; then
  if [[ "${ALLOW_RESTORE_TO_PRODUCTION:-}" != "I_UNDERSTAND_THIS_CAN_OVERWRITE_PRODUCTION" ]]; then
    echo "Refusing to restore to DATABASE_URL without explicit overwrite confirmation" >&2
    exit 1
  fi
fi

redacted_target="$(printf '%s' "$target_database_url" | sed -E 's#(postgres(ql)?://[^:/@]+):[^@]+@#\1:[REDACTED]@#')"
echo "Restoring PostgreSQL archive $resolved_backup to $redacted_target"
pg_restore "$target_database_url" \
  --clean \
  --if-exists \
  --no-owner \
  --exit-on-error \
  --single-transaction \
  "$resolved_backup"
