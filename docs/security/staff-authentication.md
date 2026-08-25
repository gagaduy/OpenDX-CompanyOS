<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Staff authentication

The OpenDX Console authenticates staff through the `opendx` Keycloak realm
using Authorization Code flow with PKCE. The public `opendx-console` client
receives access tokens whose audience includes `opendx-api`; the API verifies
the signature, issuer, audience, and expiry against Keycloak's JWKS endpoint.
It never trusts decoded but unverified claims.

Catalog routes accept the `administrator` and `catalog_manager` realm roles.
Authentication failures return `401 UNAUTHORIZED`; authenticated staff without
an accepted role receive `403 FORBIDDEN`.

The realm import contains two local development users:

- `admin@novacommerce.example` with the `administrator` role.
- `catalog@novacommerce.example` with the `catalog_manager` role.

Their sample passwords in `.env.example` and the realm export are temporary,
local-only bootstrap credentials. Keycloak requires a password change on first
login. Never deploy those credentials or the development realm unchanged.
