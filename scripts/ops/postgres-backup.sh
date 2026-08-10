#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

backup_dir="${BACKUP_DIR:?BACKUP_DIR is required}"
database_url="${DATABASE_URL:?DATABASE_URL is required}"
retention_days="${BACKUP_RETENTION_DAYS:-7}"
resolved_dir="$(realpath -m "$backup_dir")"

case "$resolved_dir" in
  */infra/backups|*/infra/backups/*|*/opendx-backups|*/opendx-backups/*) ;;
  *)
    echo "Backup directory must be an explicit OpenDX backup directory: $resolved_dir" >&2
    exit 1
    ;;
esac

mkdir -p "$resolved_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$resolved_dir/opendx-postgres-$timestamp.dump"
tmp="$target.partial"

pg_dump "$database_url" --format=custom --file="$tmp"
test -s "$tmp"
mv "$tmp" "$target"
find "$resolved_dir" -maxdepth 1 -type f -name 'opendx-postgres-*.dump' -mtime "+$retention_days" -print
echo "Created $target"
