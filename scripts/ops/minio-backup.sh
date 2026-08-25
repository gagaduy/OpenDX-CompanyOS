#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

backup_dir="${BACKUP_DIR:?BACKUP_DIR is required}"
minio_endpoint="${MINIO_ENDPOINT:?MINIO_ENDPOINT is required}"
minio_access_key="${MINIO_ACCESS_KEY:?MINIO_ACCESS_KEY is required}"
minio_secret_key="${MINIO_SECRET_KEY:?MINIO_SECRET_KEY is required}"
product_bucket="${MINIO_BUCKET:?MINIO_BUCKET is required}"
support_bucket="${MINIO_SUPPORT_BUCKET:?MINIO_SUPPORT_BUCKET is required}"
resolved_dir="$(realpath -m "$backup_dir")"

case "$resolved_dir" in
  */infra/backups|*/infra/backups/*|*/opendx-backups|*/opendx-backups/*) ;;
  *)
    echo "Backup directory must be an explicit OpenDX backup directory: $resolved_dir" >&2
    exit 1
    ;;
esac

mkdir -p "$resolved_dir"
mc alias set source "$minio_endpoint" "$minio_access_key" "$minio_secret_key" >/dev/null
mc mirror --overwrite "source/$product_bucket" "$resolved_dir/product-media"
mc mirror --overwrite "source/$support_bucket" "$resolved_dir/support-attachments"
echo "Created MinIO mirror under $resolved_dir"
