#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

backup_path="${BACKUP:-${BACKUP_FILE:-}}"
test -n "$backup_path" || { echo "BACKUP recovery-set path is required" >&2; exit 1; }
compose_file="${COMPOSE_FILE:?COMPOSE_FILE is required}"
deployment_mode="${OPENDX_DEPLOYMENT_MODE:-local}"
admin_user="${POSTGRES_ADMIN_USER:-opendx_admin}"
if [[ "$deployment_mode" == production ]]; then
  app_user="${POSTGRES_APP_USER:-opendx}"
else
  app_user="${POSTGRES_APP_USER:-opendx_local}"
fi
temporal_user="${TEMPORAL_DB_USER:-temporal}"
temporal_version="${TEMPORAL_VERSION:-1.31.2}"
database_suffix="${RECOVERY_DATABASE_SUFFIX:-}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
resolved_backup="$(realpath -m "$backup_path")"

case "$resolved_backup" in
  */infra/backups/*|*/opendx-backups/*) ;;
  *) echo "BACKUP must resolve inside an explicit OpenDX backup directory" >&2; exit 1 ;;
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
preflight_database=""
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
  if [[ -n "$preflight_database" ]]; then
    "${compose[@]}" exec -T postgres psql -X -U "$admin_user" -d postgres \
      --set preflight_db="$preflight_database" <<'SQL' >/dev/null 2>&1 || true
SELECT format('DROP DATABASE IF EXISTS %I WITH (FORCE)', :'preflight_db') \gexec
SQL
  fi
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

legacy=0
if [[ -f "$resolved_backup" ]]; then
  [[ "$resolved_backup" == *.dump ]] || { echo "Legacy BACKUP must end in .dump" >&2; exit 1; }
  [[ "${ALLOW_OPENDX_ONLY_RESTORE:-}" == 1 ]] || {
    echo "Legacy opendx-only restore requires ALLOW_OPENDX_ONLY_RESTORE=1" >&2; exit 1;
  }
  [[ "$deployment_mode" != production ]] || { echo "Legacy opendx-only restore is forbidden in production" >&2; exit 1; }
  legacy=1
  "${compose[@]}" exec -T postgres pg_restore -l < "$resolved_backup" >/dev/null
elif [[ -d "$resolved_backup" ]]; then
  node "$script_dir/postgres-recovery-set.mjs" verify "$resolved_backup" "$temporal_version"
  for database in opendx temporal temporal_visibility; do
    "${compose[@]}" exec -T postgres pg_restore -l < "$resolved_backup/$database.dump" >/dev/null
  done
else
  echo "Backup not found: $resolved_backup" >&2
  exit 1
fi

role_count="$("${compose[@]}" exec -T postgres psql -X -U "$admin_user" -d postgres -Atqc \
  "SELECT count(*) FROM pg_roles WHERE rolname IN ('$app_user', '$temporal_user')")"
[[ "$role_count" == 2 ]] || {
  echo "Restore owner roles are missing; refusing database mutation" >&2
  exit 1
}

if [[ "$legacy" == 0 && "$deployment_mode" == production ]]; then
  preflight_database="opendx_restore_preflight_$$"
  "${compose[@]}" exec -T postgres psql -X -U "$admin_user" -d postgres \
    --set ON_ERROR_STOP=1 --set app_user="$app_user" --set preflight_db="$preflight_database" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'preflight_db', :'app_user') \gexec
SQL
  "${compose[@]}" exec -T postgres pg_restore -U "$app_user" -d "$preflight_database" \
    --no-owner --section=pre-data --section=data --exit-on-error < "$resolved_backup/opendx.dump"
  orphan_policy_count="$("${compose[@]}" exec -T postgres psql -X -U "$app_user" -d "$preflight_database" -Atqc \
    "SELECT CASE WHEN to_regclass('public.agentic_policies') IS NULL OR to_regclass('public.agentic_configuration_revisions') IS NULL THEN 0 ELSE (SELECT count(*) FROM agentic_policies p WHERE NOT EXISTS (SELECT 1 FROM agentic_configuration_revisions r WHERE r.id = p.revision_id)) END")"
  [[ "$orphan_policy_count" == 0 ]] || {
    echo "Recovery set contains $orphan_policy_count orphaned Agentic policies; repair the source backup before a production restore" >&2
    exit 1
  }
  "${compose[@]}" exec -T postgres psql -X -U "$admin_user" -d postgres \
    --set ON_ERROR_STOP=1 --set preflight_db="$preflight_database" <<'SQL'
SELECT format('DROP DATABASE %I WITH (FORCE)', :'preflight_db') \gexec
SQL
  preflight_database=""
fi

if [[ "${RECOVERY_SERVICES_QUIESCED:-}" == 1 ]]; then
  [[ -n "$database_suffix" && "$deployment_mode" != production ]] || {
    echo "Pre-quiesced mode is allowed only for disposable local recovery databases" >&2; exit 1;
  }
else
  if [[ "$deployment_mode" == production ]]; then
    "${compose[@]}" stop caddy console storefront
  else
    "${compose[@]}" stop console storefront
  fi
  "${compose[@]}" stop -t "${WORKER_DRAIN_SECONDS:-35}" ai-worker
  "${compose[@]}" stop api ai-runtime temporal
fi

if [[ "$legacy" == 1 ]]; then
  "${compose[@]}" exec -T postgres pg_restore -U "$app_user" -d opendx \
    --clean --if-exists --no-owner --exit-on-error --single-transaction < "$resolved_backup"
else
  "${compose[@]}" exec -T postgres psql -X -U "$admin_user" -d postgres \
    --set ON_ERROR_STOP=1 \
    --set app_user="$app_user" --set temporal_user="$temporal_user" \
    --set opendx_db="opendx$database_suffix" --set temporal_db="temporal$database_suffix" \
    --set visibility_db="temporal_visibility$database_suffix" <<'SQL'
SELECT format('DROP DATABASE IF EXISTS %I WITH (FORCE)', :'opendx_db') \gexec
SELECT format('DROP DATABASE IF EXISTS %I WITH (FORCE)', :'temporal_db') \gexec
SELECT format('DROP DATABASE IF EXISTS %I WITH (FORCE)', :'visibility_db') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'opendx_db', :'app_user') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'temporal_db', :'temporal_user') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'visibility_db', :'temporal_user') \gexec
SQL
  opendx_database="opendx$database_suffix"
  "${compose[@]}" exec -T postgres pg_restore -U "$app_user" -d "$opendx_database" \
    --no-owner --section=pre-data --section=data --exit-on-error < "$resolved_backup/opendx.dump"
  orphan_policy_count="$("${compose[@]}" exec -T postgres psql -X -U "$app_user" -d "$opendx_database" -Atqc \
    "SELECT CASE WHEN to_regclass('public.agentic_policies') IS NULL OR to_regclass('public.agentic_configuration_revisions') IS NULL THEN 0 ELSE (SELECT count(*) FROM agentic_policies p WHERE NOT EXISTS (SELECT 1 FROM agentic_configuration_revisions r WHERE r.id = p.revision_id)) END")"
  if [[ "$orphan_policy_count" != 0 ]]; then
    [[ "$deployment_mode" != production ]] || {
      echo "Recovery set contains $orphan_policy_count orphaned Agentic policies; repair the source backup before a production restore" >&2
      exit 1
    }
    "${compose[@]}" exec -T postgres psql -X -v ON_ERROR_STOP=1 -U "$app_user" -d "$opendx_database" \
      -c 'DELETE FROM agentic_policies p WHERE NOT EXISTS (SELECT 1 FROM agentic_configuration_revisions r WHERE r.id = p.revision_id)'
  fi
  "${compose[@]}" exec -T postgres pg_restore -U "$app_user" -d "$opendx_database" \
    --no-owner --section=post-data --exit-on-error --single-transaction < "$resolved_backup/opendx.dump"
  for database in temporal temporal_visibility; do
    physical_database="$database$database_suffix"
    "${compose[@]}" exec -T postgres pg_restore -U "$temporal_user" -d "$physical_database" \
      --no-owner --exit-on-error --single-transaction < "$resolved_backup/$database.dump"
  done
fi

if [[ -z "$database_suffix" ]]; then
  "${compose[@]}" run --rm postgres-role-init
fi
if [[ "$legacy" == 0 && -z "$database_suffix" ]]; then
  "${compose[@]}" run --rm temporal-db-init
fi
if [[ -n "$database_suffix" ]]; then
  "${compose[@]}" run --rm --no-deps \
    -e "DATABASE_URL=postgres://opendx_local:opendx_local_password@postgres:5432/opendx$database_suffix" migrate
else
  "${compose[@]}" run --rm migrate
fi
if [[ "$legacy" == 0 ]]; then
  "${compose[@]}" run --rm --no-deps \
    -e "TEMPORAL_DB_NAME=temporal$database_suffix" \
    -e "TEMPORAL_VISIBILITY_DB_NAME=temporal_visibility$database_suffix" temporal-schema
fi
if [[ -n "$database_suffix" ]]; then
  echo "Restored disposable recovery databases with suffix $database_suffix"
  exit 0
fi
"${compose[@]}" up -d --wait temporal
if [[ "$legacy" == 0 ]]; then
  "${compose[@]}" run --rm temporal-namespace
fi
"${compose[@]}" up -d --wait ai-runtime api ai-worker console storefront
if [[ "$deployment_mode" == production ]]; then "${compose[@]}" up -d --wait caddy; fi
echo "Restored $resolved_backup"
