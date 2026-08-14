#!/bin/sh
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

set -eu

setup_database() {
  database="$1"
  schema_dir="$2"

  # setup-schema is required only on first boot. update-schema verifies and
  # advances both a fresh and an already initialized database to the image's
  # pinned schema version.
  temporal-sql-tool \
    --ep postgres \
    -p 5432 \
    -u "$TEMPORAL_DB_USER" \
    --pw "$TEMPORAL_DB_PASSWORD" \
    --db "$database" \
    --pl postgres12 \
    setup-schema -v 0.0

  temporal-sql-tool \
    --ep postgres \
    -p 5432 \
    -u "$TEMPORAL_DB_USER" \
    --pw "$TEMPORAL_DB_PASSWORD" \
    --db "$database" \
    --pl postgres12 \
    update-schema --schema-dir "$schema_dir"
}

: "${TEMPORAL_DB_USER:?TEMPORAL_DB_USER is required}"
: "${TEMPORAL_DB_PASSWORD:?TEMPORAL_DB_PASSWORD is required}"

setup_database temporal /etc/temporal/schema/postgresql/v12/temporal/versioned
setup_database temporal_visibility /etc/temporal/schema/postgresql/v12/visibility/versioned
