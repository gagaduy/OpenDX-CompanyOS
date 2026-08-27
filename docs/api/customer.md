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
GET    /account/wishlist?page=1&pageSize=24
PUT    /account/wishlist/items/:productId
DELETE /account/wishlist/items/:productId
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
without the separate `HttpOnly` session cookie and exact-origin check. Session
responses expire the former `/v1/storefront` CSRF cookie, and the mutation
guard accepts either duplicate during that one-time path migration.

Google login accepts only a signed credential. The backend verifies Google
issuer, configured audience, expiry, subject, email, and verified-email claim.
It never stores the credential and never silently merges identities by email.
Concurrent first login for one Google subject is serialized before identity and
email conflict checks.

Account and address DTOs omit provider subject, session token/hash, audit
metadata, and credentials. Address queries constrain every operation by the
authenticated customer ID.

Wishlist routes require an authenticated customer session; guest and anonymous
sessions receive `401` and no guest wishlist is created. Every read and mutation
is constrained by the authenticated customer ID, so a product saved by one
customer is never visible to another. `productId` must be a UUID for a currently
published product.

Wishlist listing accepts positive `page` and `pageSize` values, defaults to
`1` and `24`, and caps `pageSize` at `48`. Items are ordered by most recently
added first with product ID as the stable tie-breaker. Successful reads use the
standard `{ success, message, data, meta }` envelope; `meta` contains `page`,
`pageSize`, `totalItems`, and `totalPages`. Mutations return
`{ productId, wished }` inside the standard success envelope.

`PUT` and `DELETE` are idempotent by resource semantics: repeating an add keeps
the item wished, and repeating a removal keeps it absent. They still require
the configured `Origin` and the matching CSRF cookie/header pair described
above; no browser-only state proves wishlist ownership.
