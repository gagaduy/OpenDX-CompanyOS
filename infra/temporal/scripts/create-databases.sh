#!/bin/sh
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

set -eu

: "${POSTGRES_ADMIN_USER:?POSTGRES_ADMIN_USER is required}"
: "${POSTGRES_ADMIN_PASSWORD:?POSTGRES_ADMIN_PASSWORD is required}"
: "${POSTGRES_APP_USER:?POSTGRES_APP_USER is required}"
: "${TEMPORAL_DB_USER:?TEMPORAL_DB_USER is required}"
: "${TEMPORAL_DB_PASSWORD:?TEMPORAL_DB_PASSWORD is required}"

export PGPASSWORD="$POSTGRES_ADMIN_PASSWORD"

psql \
  --host postgres \
  --username "$POSTGRES_ADMIN_USER" \
  --dbname postgres \
  --set ON_ERROR_STOP=1 \
  --set admin_user="$POSTGRES_ADMIN_USER" \
  --set app_user="$POSTGRES_APP_USER" \
  --set temporal_user="$TEMPORAL_DB_USER" \
  --set temporal_password="$TEMPORAL_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'temporal_user', :'temporal_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'temporal_user') \gexec

ALTER ROLE temporal WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE temporal PASSWORD :'temporal_password';

SELECT 'CREATE DATABASE temporal OWNER temporal'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'temporal') \gexec
SELECT 'CREATE DATABASE temporal_visibility OWNER temporal'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'temporal_visibility') \gexec

ALTER DATABASE temporal OWNER TO temporal;
ALTER DATABASE temporal_visibility OWNER TO temporal;

REVOKE CONNECT ON DATABASE opendx FROM PUBLIC;
SELECT 'REVOKE CONNECT ON DATABASE opendx_test FROM PUBLIC'
WHERE EXISTS (SELECT FROM pg_database WHERE datname = 'opendx_test') \gexec
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
SELECT format('GRANT CONNECT ON DATABASE opendx TO %I', :'app_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE opendx_test TO %I', :'app_user')
WHERE EXISTS (SELECT FROM pg_database WHERE datname = 'opendx_test') \gexec
SELECT format('GRANT CONNECT ON DATABASE postgres TO %I', :'admin_user') \gexec

REVOKE CONNECT ON DATABASE opendx FROM temporal;
SELECT 'REVOKE CONNECT ON DATABASE opendx_test FROM temporal'
WHERE EXISTS (SELECT FROM pg_database WHERE datname = 'opendx_test') \gexec
REVOKE CONNECT ON DATABASE temporal FROM PUBLIC;
REVOKE CONNECT ON DATABASE temporal_visibility FROM PUBLIC;
SELECT format('REVOKE CONNECT ON DATABASE temporal FROM %I', :'app_user') \gexec
SELECT format('REVOKE CONNECT ON DATABASE temporal_visibility FROM %I', :'app_user') \gexec
GRANT CONNECT ON DATABASE temporal TO temporal;
GRANT CONNECT ON DATABASE temporal_visibility TO temporal;
SQL
