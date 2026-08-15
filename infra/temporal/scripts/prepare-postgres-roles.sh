#!/bin/sh
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

set -eu

: "${POSTGRES_ADMIN_USER:?POSTGRES_ADMIN_USER is required}"
: "${POSTGRES_ADMIN_PASSWORD:?POSTGRES_ADMIN_PASSWORD is required}"
: "${POSTGRES_APP_USER:?POSTGRES_APP_USER is required}"
: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD is required}"

POSTGRES_APP_DATABASE="${POSTGRES_APP_DATABASE:-opendx}"
POSTGRES_LEGACY_USER="${POSTGRES_APP_USER}_bootstrap_legacy"

if ! PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" psql --host postgres \
  --username "$POSTGRES_ADMIN_USER" --dbname postgres --set ON_ERROR_STOP=1 \
  --quiet --tuples-only --command "SELECT 1" >/dev/null 2>&1; then
  PGPASSWORD="$POSTGRES_APP_PASSWORD" psql --host postgres \
    --username "$POSTGRES_APP_USER" --dbname postgres --set ON_ERROR_STOP=1 \
    --set admin_user="$POSTGRES_ADMIN_USER" \
    --set admin_password="$POSTGRES_ADMIN_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN SUPERUSER PASSWORD %L', :'admin_user', :'admin_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'admin_user') \gexec
SQL
fi

export PGPASSWORD="$POSTGRES_ADMIN_PASSWORD"

psql --host postgres --username "$POSTGRES_ADMIN_USER" --dbname postgres \
  --set ON_ERROR_STOP=1 --set app_user="$POSTGRES_APP_USER" \
  --set app_password="$POSTGRES_APP_PASSWORD" \
  --set app_database="$POSTGRES_APP_DATABASE" \
  --set legacy_user="$POSTGRES_LEGACY_USER" <<'SQL'
SELECT format('ALTER ROLE %I RENAME TO %I', :'app_user', :'legacy_user')
WHERE EXISTS (
  SELECT FROM pg_roles WHERE rolname = :'app_user' AND rolsuper
)
AND NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'legacy_user') \gexec

SELECT format(
  'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L',
  :'app_user', :'app_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user') \gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L',
  :'app_user', :'app_password'
) \gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'app_database', :'app_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'app_database') \gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'app_database', :'app_user')
WHERE EXISTS (SELECT FROM pg_database WHERE datname = :'app_database') \gexec
SELECT format('ALTER DATABASE opendx_test OWNER TO %I', :'app_user')
WHERE EXISTS (SELECT FROM pg_database WHERE datname = 'opendx_test') \gexec
SQL

for database in "$POSTGRES_APP_DATABASE" opendx_test; do
  if psql --host postgres --username "$POSTGRES_ADMIN_USER" --dbname postgres \
    --quiet --tuples-only --command "SELECT 1 FROM pg_database WHERE datname='$database'" | grep -q 1; then
    psql --host postgres --username "$POSTGRES_ADMIN_USER" --dbname "$database" \
      --set ON_ERROR_STOP=1 --set app_user="$POSTGRES_APP_USER" \
      --set legacy_user="$POSTGRES_LEGACY_USER" <<'SQL'
SELECT format('ALTER %s %I.%I OWNER TO %I',
  CASE c.relkind
    WHEN 'S' THEN 'SEQUENCE'
    WHEN 'v' THEN 'VIEW'
    WHEN 'm' THEN 'MATERIALIZED VIEW'
    WHEN 'f' THEN 'FOREIGN TABLE'
    ELSE 'TABLE'
  END,
  n.nspname, c.relname, :'app_user')
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_roles r ON r.oid = c.relowner
WHERE r.rolname = :'legacy_user'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname !~ '^pg_toast'
  AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
  AND NOT (
    c.relkind = 'S' AND EXISTS (
      SELECT FROM pg_depend owned
      WHERE owned.classid = 'pg_class'::regclass AND owned.objid = c.oid
        AND owned.refclassid = 'pg_class'::regclass AND owned.deptype IN ('a', 'i')
    )
  )
  AND NOT EXISTS (
    SELECT FROM pg_depend d
    WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
  ) \gexec

SELECT format('ALTER FUNCTION %I.%I(%s) OWNER TO %I',
  n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), :'app_user')
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE r.rolname = :'legacy_user'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname !~ '^pg_toast'
  AND NOT EXISTS (
    SELECT FROM pg_depend d
    WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
  ) \gexec

SELECT format('ALTER %s %I.%I OWNER TO %I',
  CASE t.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END,
  n.nspname, t.typname, :'app_user')
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
JOIN pg_roles r ON r.oid = t.typowner
WHERE r.rolname = :'legacy_user'
  AND t.typtype IN ('d', 'e', 'r')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname !~ '^pg_toast'
  AND NOT EXISTS (
    SELECT FROM pg_depend d
    WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e'
  ) \gexec
SQL
  fi
done

psql --host postgres --username "$POSTGRES_ADMIN_USER" --dbname postgres \
  --set ON_ERROR_STOP=1 --set admin_user="$POSTGRES_ADMIN_USER" \
  --set app_user="$POSTGRES_APP_USER" \
  --set app_database="$POSTGRES_APP_DATABASE" \
  --set legacy_user="$POSTGRES_LEGACY_USER" <<'SQL'
SELECT format('ALTER ROLE %I WITH NOLOGIN', :'legacy_user')
WHERE EXISTS (SELECT FROM pg_roles WHERE rolname = :'legacy_user') \gexec

SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'app_database') \gexec
SELECT 'REVOKE CONNECT ON DATABASE opendx_test FROM PUBLIC'
WHERE EXISTS (SELECT FROM pg_database WHERE datname = 'opendx_test') \gexec
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'app_database', :'app_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE opendx_test TO %I', :'app_user')
WHERE EXISTS (SELECT FROM pg_database WHERE datname = 'opendx_test') \gexec
SELECT format('GRANT CONNECT ON DATABASE postgres TO %I', :'admin_user') \gexec
SQL
