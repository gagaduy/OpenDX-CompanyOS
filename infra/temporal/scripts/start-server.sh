#!/bin/sh
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

set -eu

max_attempts="${TEMPORAL_DATABASE_WAIT_MAX_ATTEMPTS:-60}"
attempt=1

until getent hosts "$POSTGRES_SEEDS" >/dev/null 2>&1 \
  && nc -z "$POSTGRES_SEEDS" "$DB_PORT" >/dev/null 2>&1; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Temporal database endpoint ${POSTGRES_SEEDS}:${DB_PORT} did not become reachable after ${max_attempts} attempts." >&2
    exit 1
  fi

  echo "Waiting for Temporal database endpoint ${POSTGRES_SEEDS}:${DB_PORT} (${attempt}/${max_attempts})..." >&2
  attempt=$((attempt + 1))
  sleep 2
done

exec /etc/temporal/entrypoint.sh
