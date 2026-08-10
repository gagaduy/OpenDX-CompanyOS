<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# VPS Production Compose

This directory contains the Phase 8 production-candidate Docker Compose and
Caddy examples for one VPS/VM. It is separate from the local development stack
in `infra/docker`.

## Files

- `compose.production.yml` builds production targets for API, Console,
  Storefront, and AI runtime-compatible images, then runs PostgreSQL, MinIO,
  Keycloak, ClamAV, and Caddy on one Docker network.
- `Caddyfile` routes the placeholder HTTPS domains to the internal services and
  applies edge security headers.

## Before Running

Create a `.env.production` outside source control and replace every
`example.com` placeholder with real DNS names:

- `shop.example.com`
- `console.example.com`
- `api.example.com`
- `auth.example.com`
- `storage.example.com` if storage is exposed later

Set all required secrets through the environment. Do not edit secrets into this
directory.

Validate the example without starting services:

```bash
pnpm check:production-compose
```

Production API startup intentionally fails closed if placeholder domains remain
while `OPENDX_ENV=production`.
