#!/bin/sh
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

set -eu

MAX_ATTEMPTS=30
TEMPORAL_ADDRESS="${TEMPORAL_ADDRESS:-temporal:7233}"
TEMPORAL_NAMESPACE="${TEMPORAL_NAMESPACE:-opendx}"
TEMPORAL_TLS_ENABLED="${TEMPORAL_TLS_ENABLED:-false}"

set -- --address "$TEMPORAL_ADDRESS"
if [ "$TEMPORAL_TLS_ENABLED" = "true" ]; then
  : "${TEMPORAL_TLS_CA_PATH:?TEMPORAL_TLS_CA_PATH is required when TLS is enabled}"
  : "${TEMPORAL_TLS_CERT_PATH:?TEMPORAL_TLS_CERT_PATH is required when TLS is enabled}"
  : "${TEMPORAL_TLS_KEY_PATH:?TEMPORAL_TLS_KEY_PATH is required when TLS is enabled}"
  : "${TEMPORAL_TLS_SERVER_NAME:?TEMPORAL_TLS_SERVER_NAME is required when TLS is enabled}"
  set -- "$@" --tls \
    --tls-ca-path "$TEMPORAL_TLS_CA_PATH" \
    --tls-cert-path "$TEMPORAL_TLS_CERT_PATH" \
    --tls-key-path "$TEMPORAL_TLS_KEY_PATH" \
    --tls-server-name "$TEMPORAL_TLS_SERVER_NAME"
fi

attempt=1
until temporal operator "$@" --command-timeout 5s cluster health >/dev/null 2>&1; do
  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    echo "Temporal did not become RPC-ready after $MAX_ATTEMPTS attempts" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 2
done

if temporal operator "$@" namespace describe --namespace "$TEMPORAL_NAMESPACE" >/dev/null 2>&1; then
  exit 0
fi

if ! create_output=$(temporal operator "$@" namespace create \
  --namespace "$TEMPORAL_NAMESPACE" --retention 168h 2>&1); then
  case "$create_output" in
    *"already exists"*|*"AlreadyExists"*) ;;
    *)
      echo "$create_output" >&2
      exit 1
      ;;
  esac
fi
attempt=1
until temporal operator "$@" namespace describe --namespace "$TEMPORAL_NAMESPACE" >/dev/null 2>&1; do
  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    echo "Namespace did not become readable after $MAX_ATTEMPTS attempts" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 2
done
