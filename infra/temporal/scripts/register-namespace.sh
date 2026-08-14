#!/bin/sh
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

set -eu

MAX_ATTEMPTS=30
attempt=1
until temporal --address temporal:7233 --command-timeout 5s operator cluster health >/dev/null 2>&1; do
  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    echo "Temporal did not become RPC-ready after $MAX_ATTEMPTS attempts" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 2
done

if temporal --address temporal:7233 operator namespace describe --namespace opendx >/dev/null 2>&1; then
  exit 0
fi

temporal --address temporal:7233 operator namespace create --namespace opendx --retention 168h
temporal --address temporal:7233 operator namespace describe --namespace opendx >/dev/null
