<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Customer API

Customer routes are mounted at `/v1/storefront`. Staff Keycloak tokens are not
accepted as customer identity. Local customer and guest sessions use opaque
cookies; PostgreSQL stores only SHA-256 token hashes.

```text
POST   /guest-sessions
POST   /auth/google
GET    /session
POST   /logout
GET    /account
PATCH  /account
GET    /account/addresses
POST   /account/addresses
PATCH  /account/addresses/:addressId
DELETE /account/addresses/:addressId
POST   /account/addresses/:addressId/default
```

Mutations require the configured storefront `Origin` and matching
`opendx_csrf` cookie plus `x-csrf-token` header. Customer cookies are
`HttpOnly`, `SameSite=Lax`, path-bounded to `/v1/storefront`, expire at the
fixed 30-day absolute boundary, and rotate at explicit session restoration
without extending that boundary. Ordinary account and cart reads validate the
current token without rotating it, so parallel requests cannot invalidate one
another. Guest cookies use a seven-day absolute boundary. HTTPS deployments
must set `COOKIE_SECURE=true`. The non-`HttpOnly` CSRF cookie uses `Path=/` so
Storefront JavaScript can echo it in the mutation header; it grants no identity
without the separate `HttpOnly` session cookie and exact-origin check.

Google login accepts only a signed credential. The backend verifies Google
issuer, configured audience, expiry, subject, email, and verified-email claim.
It never stores the credential and never silently merges identities by email.
Concurrent first login for one Google subject is serialized before identity and
email conflict checks.

Account and address DTOs omit provider subject, session token/hash, audit
metadata, and credentials. Address queries constrain every operation by the
authenticated customer ID.
