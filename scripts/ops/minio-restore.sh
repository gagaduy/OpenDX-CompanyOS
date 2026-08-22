#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

backup_dir="${BACKUP_DIR:?BACKUP_DIR is required}"
source_endpoint="${MINIO_ENDPOINT:-}"
source_access_key="${MINIO_ACCESS_KEY:-}"
source_secret_key="${MINIO_SECRET_KEY:-}"
target_endpoint="${TARGET_MINIO_ENDPOINT:?TARGET_MINIO_ENDPOINT is required}"
target_access_key="${TARGET_MINIO_ACCESS_KEY:?TARGET_MINIO_ACCESS_KEY is required}"
target_secret_key="${TARGET_MINIO_SECRET_KEY:?TARGET_MINIO_SECRET_KEY is required}"
target_product_bucket="${TARGET_MINIO_BUCKET:?TARGET_MINIO_BUCKET is required}"
target_support_bucket="${TARGET_MINIO_SUPPORT_BUCKET:?TARGET_MINIO_SUPPORT_BUCKET is required}"
resolved_dir="$(realpath -m "$backup_dir")"

case "$resolved_dir" in
  */infra/backups|*/infra/backups/*|*/opendx-backups|*/opendx-backups/*) ;;
  *)
    echo "Backup directory must be an explicit OpenDX backup directory: $resolved_dir" >&2
    exit 1
    ;;
esac
test -d "$resolved_dir/product-media"
test -d "$resolved_dir/support-attachments"

if [[ -n "$source_endpoint" && -n "$source_access_key" && -n "$source_secret_key" ]]; then
  if [[ "$target_endpoint" == "$source_endpoint" && "$target_access_key" == "$source_access_key" ]]; then
    if [[ "${ALLOW_RESTORE_TO_PRODUCTION:-}" != "I_UNDERSTAND_THIS_CAN_OVERWRITE_PRODUCTION" ]]; then
      echo "Refusing to restore to source MinIO endpoint without explicit overwrite confirmation" >&2
      exit 1
    fi
  fi
fi

mc alias set target "$target_endpoint" "$target_access_key" "$target_secret_key" >/dev/null
mc mirror --overwrite "$resolved_dir/product-media" "target/$target_product_bucket"
mc mirror --overwrite "$resolved_dir/support-attachments" "target/$target_support_bucket"
echo "Restored MinIO buckets to target endpoint"
