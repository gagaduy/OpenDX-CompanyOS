<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# SePay Payment Gateway

Phase 6 integrates the SePay Payment Gateway sandbox through a provider-neutral
port. SePay is external: Docker Compose does not run a SePay container, and the
API remains ready when credentials are absent or the sandbox is unavailable.

Official references:

- [Payment Gateway sandbox](https://developer.sepay.vn/vi/cong-thanh-toan/sandbox)
- [Payment Gateway IPN](https://developer.sepay.vn/en/cong-thanh-toan/IPN)
- [Current outbound IP list](https://developer.sepay.vn/en/dia-chi-ip)

## Sandbox Setup

1. Create or sign in to a SePay merchant account and open the Payment Gateway
   sandbox integration settings.
2. Copy the sandbox Merchant ID and Secret Key. Configure SECRET_KEY
   authentication for IPN and generate a distinct IPN secret.
3. Copy `.env.example` to `.env` and set:

```dotenv
SEPAY_ENVIRONMENT=sandbox
SEPAY_CHECKOUT_URL=https://pay-sandbox.sepay.vn/v1/checkout/init
SEPAY_API_BASE_URL=https://pgapi-sandbox.sepay.vn
SEPAY_MERCHANT_ID=replace-with-sandbox-merchant-id
SEPAY_SECRET_KEY=replace-with-sandbox-signing-secret
SEPAY_IPN_SECRET=replace-with-distinct-ipn-secret
SEPAY_SUCCESS_URL=http://localhost:3100/payment/return?outcome=success
SEPAY_ERROR_URL=http://localhost:3100/payment/return?outcome=error
SEPAY_CANCEL_URL=http://localhost:3100/payment/return?outcome=cancel
```

All three credentials must be present together. They are runtime secrets and
must never enter Git, screenshots, logs, browser bundles, workflow JSON, or
support tickets.

## Public IPN During Local Development

SePay cannot call `localhost`. Run `make up`, expose API port 4000 through a
trusted HTTPS tunnel, then configure this exact merchant IPN URL:

```text
https://your-random-tunnel-host/v1/webhooks/sepay
```

Set IPN auth to SECRET_KEY and use the same value as `SEPAY_IPN_SECRET`. Keep
the Storefront return URLs local if payment is performed in the same browser.
Do not commit a temporary tunnel URL. Tunnel availability is external and is
not part of `/health/ready`.

For hosted firewalls, consult SePay's current official IP page instead of
copying a static list into configuration. IP allowlisting is defense in depth;
the application still verifies `X-Secret-Key`.

## Controlled Real-Money Test From A Local Machine

The Node process may remain on a contributor machine while using SePay
Production, but the integration is no longer localhost-only. Use separate,
stable HTTPS tunnel hostnames for API and Storefront, then set:

```dotenv
OPENDX_ENV=production
COOKIE_SECURE=true
STOREFRONT_ORIGIN=https://your-storefront-tunnel.example
SEPAY_ENVIRONMENT=production
SEPAY_CHECKOUT_URL=https://pay.sepay.vn/v1/checkout/init
SEPAY_API_BASE_URL=https://pgapi.sepay.vn
SEPAY_SUCCESS_URL=https://your-storefront-tunnel.example/payment/return?outcome=success
SEPAY_ERROR_URL=https://your-storefront-tunnel.example/payment/return?outcome=error
SEPAY_CANCEL_URL=https://your-storefront-tunnel.example/payment/return?outcome=cancel
```

Configure the Production IPN URL as
`https://your-api-tunnel.example/v1/webhooks/sepay` and provide Production
credentials only through the local `.env`/secret environment. Run one bounded,
low-value transaction while both tunnels and the local API remain available.
Confirm the order from authenticated IPN/reconciliation evidence, not from the
return page. This is an opt-in engineering acceptance, not approval to operate
the store from a laptop. Stable hosting, managed secrets, TLS, monitoring,
firewall policy, and incident operations remain Phase 8.

## Opt-In Sandbox Acceptance

The repository provides an interactive runner that creates a real sandbox
checkout, opens an ephemeral auto-submit form when requested, waits for
authoritative backend completion, then runs Finance reconciliation:

```bash
SEPAY_ACCEPTANCE_CONFIRM_SANDBOX=yes \
SEPAY_ACCEPTANCE_CUSTOMER_COOKIE='opendx_customer=...; opendx_csrf=...' \
SEPAY_ACCEPTANCE_CSRF_TOKEN='...' \
SEPAY_ACCEPTANCE_ADDRESS_ID='00000000-0000-4000-8000-000000000000' \
SEPAY_ACCEPTANCE_PUBLIC_API_URL='https://your-api-tunnel.example' \
SEPAY_ACCEPTANCE_STAFF_BEARER='...' \
SEPAY_ACCEPTANCE_OPEN_BROWSER=yes \
pnpm check:sepay-sandbox
```

Before running it, configure the merchant callback as
`https://your-api-tunnel.example/v1/webhooks/sepay`, place sandbox merchant
credentials only in the runtime environment, sign in as a customer with a
non-empty cart and owned address, and obtain a short-lived Finance or
Administrator bearer token. Do not include the `Bearer ` prefix in the
variable. The runner prints IDs, amount, field names, counts, and statuses only;
field values, cookies, provider payloads, and credentials remain redacted. Its
temporary form is mode `0600` and is deleted when the run exits.

## Evidence And Reconciliation

IPN is authoritative only after authentication plus invoice, provider order,
amount, currency, and approved-transaction checks. Stored payload evidence is
redacted before operators can read it. The return page polls OpenDX order state;
redirect query parameters never confirm payment.

Finance operators can reconcile pending payments from Console. The background
worker starts only when credentials are complete and uses the configured REST
API. Timeout, provider error, unsupported state, and mismatch remain reviewable
without changing an order to paid.

## Rotation And Incident Handling

1. Stop new checkout traffic or enter a maintenance window.
2. Rotate sandbox credentials in SePay.
3. Update `.env` through the deployment secret mechanism and restart API.
4. Update IPN authentication in SePay if the IPN secret changed.
5. Reconcile pending payments and inspect redacted event/audit evidence.
6. Revoke the previous credential and record the rotation outside source code.

Never paste a suspected leaked key into an issue. Revoke it first. Production
go-live, managed secret storage, public hosting, firewall rules, TLS, backup
retention, and production URLs are Phase 8 work; changing
`SEPAY_ENVIRONMENT=production` alone is not an approved production launch.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `PAYMENT_PROVIDER_NOT_CONFIGURED` | All three merchant, signing, and IPN secrets must be non-empty together; restart API after changing them. |
| IPN returns `401` | SePay SECRET_KEY auth and `SEPAY_IPN_SECRET` differ. Rotate rather than logging either value. |
| IPN never arrives | Verify the exact public HTTPS API URL, tunnel uptime, SePay delivery log, and current outbound IP policy. |
| Return page remains pending | A redirect is not proof; inspect Payment events and run Finance reconciliation. |
| Reconciliation says mismatch | Compare invoice, provider order ID, amount, currency, and approved transaction evidence; do not force paid. |
| API is healthy while SePay is down | Expected: external provider availability is intentionally excluded from readiness. |
