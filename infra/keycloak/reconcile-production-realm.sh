#!/bin/sh
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

set -eu

: "${KEYCLOAK_ADMIN:?KEYCLOAK_ADMIN is required}"
: "${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD is required}"
: "${AGENTIC_CONTROL_CLIENT_SECRET:?AGENTIC_CONTROL_CLIENT_SECRET is required}"
: "${AGENTIC_WORKER_CLIENT_SECRET:?AGENTIC_WORKER_CLIENT_SECRET is required}"
: "${AGENT_AI_CEO_CLIENT_SECRET:?AGENT_AI_CEO_CLIENT_SECRET is required}"
: "${AGENT_CATALOG_CLIENT_SECRET:?AGENT_CATALOG_CLIENT_SECRET is required}"
: "${AGENT_INVENTORY_CLIENT_SECRET:?AGENT_INVENTORY_CLIENT_SECRET is required}"
: "${AGENT_ORDER_CLIENT_SECRET:?AGENT_ORDER_CLIENT_SECRET is required}"
: "${AGENT_FINANCE_CLIENT_SECRET:?AGENT_FINANCE_CLIENT_SECRET is required}"
: "${AGENT_CRM_CLIENT_SECRET:?AGENT_CRM_CLIENT_SECRET is required}"
: "${AGENT_SUPPORT_CLIENT_SECRET:?AGENT_SUPPORT_CLIENT_SECRET is required}"
: "${CONSOLE_ORIGIN:?CONSOLE_ORIGIN is required}"

SERVER="${KEYCLOAK_INTERNAL_URL:-http://keycloak:8080}"
REALM="${KEYCLOAK_REALM:-opendx}"
CONFIG=/tmp/kcadm.config
KCADM=/opt/keycloak/bin/kcadm.sh
CONSOLE_ORIGIN=${CONSOLE_ORIGIN%/}
KEYCLOAK_RECONCILE_PAGE_SIZE=${KEYCLOAK_RECONCILE_PAGE_SIZE:-100}
case "$KEYCLOAK_RECONCILE_PAGE_SIZE" in
  '' | *[!0-9]*) echo "KEYCLOAK_RECONCILE_PAGE_SIZE must be a positive integer" >&2; exit 1 ;;
esac
[ "$KEYCLOAK_RECONCILE_PAGE_SIZE" -gt 0 ] || {
  echo "KEYCLOAK_RECONCILE_PAGE_SIZE must be a positive integer" >&2
  exit 1
}

"$KCADM" config credentials --config "$CONFIG" --server "$SERVER" \
  --realm master --user "$KEYCLOAK_ADMIN" --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null
"$KCADM" get "realms/$REALM" --config "$CONFIG" >/dev/null

delete_client() {
  client_id="$1"
  matching_ids=$("$KCADM" get clients --config "$CONFIG" -r "$REALM" \
    -q "clientId=$client_id" --fields id --format csv --noquotes)
  for matching_id in $matching_ids; do
    "$KCADM" delete "clients/$matching_id" --config "$CONFIG" -r "$REALM"
  done
}

if [ "${KEYCLOAK_PRESERVE_DEVELOPMENT_IDENTITIES:-false}" != "true" ]; then
  delete_client opendx-lifecycle-check
  fixture_user_ids=""
  first=0
  page_size=$KEYCLOAK_RECONCILE_PAGE_SIZE
  while :; do
    user_rows=$("$KCADM" get users --config "$CONFIG" -r "$REALM" \
      -q "first=$first" -q "max=$page_size" \
      --fields id,username --format csv --noquotes)
    [ -n "$user_rows" ] || break
    while IFS=, read -r user_id username; do
      case "$username" in
        admin@novacommerce.example | \
        catalog@novacommerce.example | \
        inventory@novacommerce.example | \
        operations@novacommerce.example | \
        finance@novacommerce.example | \
        agentic-operator@novacommerce.example | \
        agentic-approver@novacommerce.example | \
        agentic-governance-creator@novacommerce.example | \
        agentic-governance-reviewer@novacommerce.example)
          fixture_user_ids="$fixture_user_ids $user_id"
          ;;
      esac
    done <<EOF
$user_rows
EOF
    row_count=$(printf '%s\n' "$user_rows" | wc -l | tr -d ' ')
    [ "$row_count" -eq "$page_size" ] || break
    first=$((first + page_size))
  done
  for fixture_user_id in $fixture_user_ids; do
    "$KCADM" delete "users/$fixture_user_id" --config "$CONFIG" -r "$REALM"
  done
fi

console_client_id=$("$KCADM" get clients --config "$CONFIG" -r "$REALM" \
  -q clientId=opendx-console --fields id --format csv --noquotes)
test -n "$console_client_id"
"$KCADM" update "clients/$console_client_id" --config "$CONFIG" -r "$REALM" \
  -s "redirectUris=[\"$CONSOLE_ORIGIN/auth/callback\"]" \
  -s "webOrigins=[\"$CONSOLE_ORIGIN\"]" \
  -s "attributes.\"post.logout.redirect.uris\"=$CONSOLE_ORIGIN/sign-in"

reconcile_client() {
  client_id="$1"
  client_name="$2"
  secret="$3"
  audience="$4"
  mapper_name="$5"

  delete_client "$client_id"

  "$KCADM" create clients --config "$CONFIG" -r "$REALM" \
    -s "clientId=$client_id" -s "name=$client_name" -s enabled=true \
    -s protocol=openid-connect -s publicClient=false -s "secret=$secret" \
    -s serviceAccountsEnabled=true -s standardFlowEnabled=false \
    -s directAccessGrantsEnabled=false >/dev/null

  created_id=$("$KCADM" get clients --config "$CONFIG" -r "$REALM" \
    -q "clientId=$client_id" --fields id --format csv --noquotes)
  test -n "$created_id"
  "$KCADM" create "clients/$created_id/protocol-mappers/models" \
    --config "$CONFIG" -r "$REALM" -s "name=$mapper_name" \
    -s protocol=openid-connect -s protocolMapper=oidc-audience-mapper \
    -s consentRequired=false \
    -s 'config."access.token.claim"=true' \
    -s 'config."id.token.claim"=false' \
    -s "config.\"included.client.audience\"=$audience" >/dev/null
}

reconcile_client opendx-agentic-control "OpenDX Agentic Control" \
  "$AGENTIC_CONTROL_CLIENT_SECRET" opendx-ai-runtime opendx-ai-runtime-audience
reconcile_client opendx-agentic-worker "OpenDX Agentic Worker" \
  "$AGENTIC_WORKER_CLIENT_SECRET" opendx-api opendx-api-audience
reconcile_client agent-ai-ceo "OpenDX AI CEO Agent" \
  "$AGENT_AI_CEO_CLIENT_SECRET" opendx-api opendx-api-audience
reconcile_client agent-catalog "OpenDX Catalog Agent" \
  "$AGENT_CATALOG_CLIENT_SECRET" opendx-api opendx-api-audience
reconcile_client agent-inventory "OpenDX Inventory Agent" \
  "$AGENT_INVENTORY_CLIENT_SECRET" opendx-api opendx-api-audience
reconcile_client agent-order "OpenDX Order Agent" \
  "$AGENT_ORDER_CLIENT_SECRET" opendx-api opendx-api-audience
reconcile_client agent-finance "OpenDX Finance Agent" \
  "$AGENT_FINANCE_CLIENT_SECRET" opendx-api opendx-api-audience
reconcile_client agent-crm "OpenDX CRM Agent" \
  "$AGENT_CRM_CLIENT_SECRET" opendx-api opendx-api-audience
reconcile_client agent-support "OpenDX Support Agent" \
  "$AGENT_SUPPORT_CLIENT_SECRET" opendx-api opendx-api-audience
