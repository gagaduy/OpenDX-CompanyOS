<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Local Environment

Start the full container stack:

```bash
make up
```

Open the Storefront at `http://localhost:3100`, staff Console at
`http://localhost:3000`, and API at `http://localhost:4000`.

Catalog browsing and guest cart behavior require no Google configuration. To
test real Google identity locally, create a Web OAuth client in a
contributor-owned Google Cloud project and add the exact authorized JavaScript
origin `http://localhost:3100`. Put the public client ID only in an ignored
`.env`:

```text
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

Restart `api` and `storefront` after changing the value. Do not commit `.env`,
Google credentials, ID tokens, customer cookies, or CSRF tokens. No Google
client secret is used by this identity-only browser flow.

For host development:

```bash
pnpm --filter @opendx/api dev
pnpm --filter @opendx/storefront dev
```

Local HTTP uses `COOKIE_SECURE=false`. Hosted HTTPS must use
`COOKIE_SECURE=true` and an HTTPS `STOREFRONT_ORIGIN`; the API rejects unsafe
production combinations during startup.

## Browser Acceptance

After `make up` is healthy, run:

```bash
pnpm check:storefront-browser
```

Chrome or Chromium is required. The script checks all three supported
acceptance viewports, product image delivery, semantic `main`, visible keyboard
focus, and document overflow. It stores screenshots outside the repository in
`/tmp/opendx-storefront-browser` unless `BROWSER_EVIDENCE_DIR` is set.
