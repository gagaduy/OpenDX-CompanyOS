#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

backup_dir="${BACKUP_DIR:?BACKUP_DIR is required}"
compose_file="${COMPOSE_FILE:?COMPOSE_FILE is required}"
deployment_mode="${OPENDX_DEPLOYMENT_MODE:-local}"
admin_user="${POSTGRES_ADMIN_USER:-opendx_admin}"
temporal_version="${TEMPORAL_VERSION:-1.31.2}"
database_suffix="${RECOVERY_DATABASE_SUFFIX:-}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
resolved_dir="$(realpath -m "$backup_dir")"

case "$resolved_dir" in
  */infra/backups|*/infra/backups/*|*/opendx-backups|*/opendx-backups/*) ;;
  *) echo "Backup directory must be an explicit OpenDX backup directory: $resolved_dir" >&2; exit 1 ;;
esac
[[ "$database_suffix" =~ ^(_[a-z0-9_]+)?$ ]] || { echo "Invalid recovery database suffix" >&2; exit 1; }
[[ -z "$database_suffix" || "$deployment_mode" != production ]] || {
  echo "Alternate recovery databases are forbidden in production" >&2; exit 1;
}

compose=(docker compose)
if [[ -n "${COMPOSE_ENV_FILE:-}" ]]; then compose+=(--env-file "$COMPOSE_ENV_FILE"); fi
compose+=(-f "$compose_file")
maintenance_lock="${OPENDX_MAINTENANCE_LOCK_DIR:-/tmp/opendx-database-maintenance.lock}"
maintenance_lock_owned=0
if mkdir "$maintenance_lock" 2>/dev/null; then
  maintenance_lock_owned=1
  printf '%s\n' "$$" > "$maintenance_lock/owner"
elif [[ -z "${OPENDX_MAINTENANCE_LOCK_OWNER:-}" \
  || ! -f "$maintenance_lock/owner" \
  || "$(cat "$maintenance_lock/owner")" != "$OPENDX_MAINTENANCE_LOCK_OWNER" ]]; then
  echo "Another OpenDX database backup or restore is already running: $maintenance_lock" >&2
  exit 1
fi
release_maintenance_lock() {
  if [[ "$maintenance_lock_owned" == 1 ]]; then
    rm -f -- "$maintenance_lock/owner"
    rmdir "$maintenance_lock" 2>/dev/null || true
  fi
}
trap release_maintenance_lock EXIT HUP INT TERM
for lock in "${AGENTIC_WORKFLOW_LOCK_FILE:-/tmp/opendx-agentic-workflow-check.lock}" \
  "${AGENTIC_RECOVERY_LOCK_FILE:-/tmp/opendx-agentic-workflow-recovery-check.lock}"; do
  if [[ -e "$lock" ]]; then
    if [[ "$lock" == "${AGENTIC_RECOVERY_LOCK_FILE:-/tmp/opendx-agentic-workflow-recovery-check.lock}" \
      && -n "${AGENTIC_RECOVERY_LOCK_OWNER:-}" \
      && "$(cat "$lock")" == "$AGENTIC_RECOVERY_LOCK_OWNER" ]]; then
      continue
    fi
    echo "Agentic lifecycle/recovery checker lock is held: $lock" >&2
    exit 1
  fi
done
mapfile -t initially_running < <("${compose[@]}" ps --services --filter status=running)
mkdir -p "$resolved_dir"
stamp="$(date -u +%Y%m%d-%H%M%S)"
target="$resolved_dir/recovery-$stamp"
staging="$resolved_dir/.recovery-$stamp.tmp.$$"
test ! -e "$target" && test ! -e "$staging" || { echo "Recovery set already exists for $stamp" >&2; exit 1; }
mkdir "$staging"

services_stopped=0
was_running() {
  local expected="$1" service
  for service in "${initially_running[@]}"; do [[ "$service" != "$expected" ]] || return 0; done
  return 1
}
start_if_previously_running() {
  local service status=0
  for service in "$@"; do
    if was_running "$service" && ! "${compose[@]}" up --no-deps -d --wait "$service"; then
      status=1
    fi
  done
  return "$status"
}
restart_services() {
  local status=$?
  if [[ "$services_stopped" == 1 ]]; then
    start_if_previously_running temporal || status=$?
    start_if_previously_running ai-runtime api ai-worker console storefront || status=$?
    if [[ "$deployment_mode" == production ]]; then start_if_previously_running caddy || status=$?; fi
  fi
  rm -f -- "$staging/metadata.json"
  if [[ -d "$staging" ]]; then rm -f -- "$staging"/* && rmdir "$staging"; fi
  release_maintenance_lock
  return "$status"
}
trap restart_services EXIT HUP INT TERM

if [[ "${RECOVERY_SERVICES_QUIESCED:-}" == 1 ]]; then
  [[ -n "$database_suffix" && "$deployment_mode" != production ]] || {
    echo "Pre-quiesced mode is allowed only for disposable local recovery databases" >&2; exit 1;
  }
else
  services_stopped=1
  if [[ "$deployment_mode" == production ]]; then
    "${compose[@]}" stop caddy console storefront
  else
    "${compose[@]}" stop console storefront
  fi
  "${compose[@]}" stop -t "${WORKER_DRAIN_SECONDS:-35}" ai-worker
  "${compose[@]}" stop api ai-runtime temporal
fi

for database in opendx temporal temporal_visibility; do
  physical_database="$database$database_suffix"
  "${compose[@]}" exec -T postgres pg_dump -U "$admin_user" -d "$physical_database" \
    --format=custom --no-owner --no-privileges > "$staging/$database.dump"
  test -s "$staging/$database.dump" || { echo "$database backup is empty" >&2; exit 1; }
  "${compose[@]}" exec -T postgres pg_restore -l < "$staging/$database.dump" >/dev/null
done

postgres_version="$("${compose[@]}" exec -T postgres psql -X -U "$admin_user" -d postgres -Atqc 'SHOW server_version')"
opendx_schema="$("${compose[@]}" exec -T postgres psql -X -U "$admin_user" -d "opendx$database_suffix" -Atqc "
  SELECT json_build_object(
    'company_core', (SELECT COALESCE(max(name), 'none') FROM company_core_migrations),
    'catalog', (SELECT COALESCE(max(name), 'none') FROM catalog_migrations),
    'inventory', (SELECT COALESCE(max(name), 'none') FROM inventory_migrations),
    'customer', (SELECT COALESCE(max(name), 'none') FROM customer_migrations),
    'cart', (SELECT COALESCE(max(name), 'none') FROM cart_migrations),
    'promotion', (SELECT COALESCE(max(name), 'none') FROM promotion_migrations),
    'checkout', (SELECT COALESCE(max(name), 'none') FROM checkout_migrations),
    'orders', (SELECT COALESCE(max(name), 'none') FROM order_migrations),
    'payment', (SELECT COALESCE(max(name), 'none') FROM payment_migrations),
    'crm', (SELECT COALESCE(max(name), 'none') FROM crm_migrations),
    'support', (SELECT COALESCE(max(name), 'none') FROM support_migrations),
    'agentic', (SELECT COALESCE(max(name), 'none') FROM agentic_migrations)
  )::text")"
temporal_schema="$("${compose[@]}" exec -T postgres psql -X -U "$admin_user" -d "temporal$database_suffix" -Atqc 'SELECT curr_version FROM schema_version WHERE version_partition = 0')"
visibility_schema="$("${compose[@]}" exec -T postgres psql -X -U "$admin_user" -d "temporal_visibility$database_suffix" -Atqc 'SELECT curr_version FROM schema_version WHERE version_partition = 0')"

node - "$staging/metadata.json" "$postgres_version" "$temporal_version" "$opendx_schema" "$temporal_schema" "$visibility_schema" <<'NODE'
const { writeFileSync } = require("node:fs");
const [path, postgresql, temporal, opendx, temporalSchema, visibility] = process.argv.slice(2);
writeFileSync(path, JSON.stringify({
  createdAt: new Date().toISOString(),
  versions: { postgresql, temporal, schemas: { opendx: JSON.parse(opendx), temporal: temporalSchema, temporal_visibility: visibility } },
}));
NODE
node "$script_dir/postgres-recovery-set.mjs" create "$staging" "$staging/metadata.json"
rm -f -- "$staging/metadata.json"
mv "$staging" "$target"
echo "Created $target"
