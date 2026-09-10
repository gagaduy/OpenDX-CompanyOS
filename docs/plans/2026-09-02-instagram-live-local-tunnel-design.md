<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Instagram Live Publication Through a Local HTTPS Tunnel Design

## Status

Approved by the product owner on 2026-09-02.

## Goal

Enable the existing governed Marketing workflow to publish approved image
targets to the real Instagram account while CompanyOS remains on localhost.
Meta must receive a short-lived public HTTPS URL for a compatible JPEG without
making MinIO public, weakening approval rules, or embedding deployment values
in source code.

## Scope

This slice adds:

- deterministic PNG-to-JPEG variants for approved Marketing image assets;
- signed, expiring HTTPS media URLs served by the local API;
- Cloudflare Quick Tunnel as the development-only HTTPS ingress;
- fail-closed live Instagram configuration and validation;
- live Feed image publication using the existing Instagram publisher flow;
- reusable media-delivery plumbing for the already-modelled image Story and
  carousel targets; and
- focused security, adapter, controller, and acceptance coverage.

It does not make MinIO public, deploy CompanyOS, add a permanent Cloudflare
domain, enable Instagram video, change Facebook publication, or allow browser
requests to provide Meta credentials.

## Architecture and Data Flow

The Marketing module remains the owner of generated assets and publication.
The application layer continues to depend on inward-facing ports. Concrete
image conversion, private object storage, signed URL construction, and Meta
Graph requests remain infrastructure concerns wired by the API composition
root.

For an approved live Instagram target, the publication flow is:

1. Read the authoritative PNG asset from private MinIO storage.
2. Convert it to a Meta-compatible JPEG through an infrastructure image
   transformer.
3. Store the JPEG variant privately under a deterministic key derived from the
   source asset and digest, allowing retries to reuse the same bytes.
4. Create a signed URL binding the asset, JPEG variant, and expiry timestamp.
5. Submit that HTTPS URL to the existing Instagram Graph adapter.
6. Let Meta fetch the JPEG through Cloudflare Quick Tunnel and the local API.
7. Poll the media container and publish only after Meta reports completion.
8. Persist the bounded provider receipt, external media identifier, audit, and
   provenance through the existing Marketing publication lifecycle.

The resulting boundary is:

`private PNG -> private JPEG -> signed API URL -> Cloudflare Tunnel -> Meta`

The public endpoint cannot enumerate assets or accept arbitrary MinIO object
keys. It streams only a signed JPEG variant belonging to the Marketing media
delivery boundary. Facebook continues to upload its existing asset directly
and is unaffected.

## JPEG Variant Generation

The API adds `sharp` as an infrastructure dependency because the current
generation pipeline produces PNG while Meta's Instagram image publication
contract requires a publicly retrievable JPEG. The transformer validates its
input and produces a deterministic JPEG with explicit output metadata. It does
not place conversion logic in controllers, domain entities, or React code.

The private JPEG record retains the source asset identity, source digest,
output digest, MIME type, dimensions, byte size, storage key, and conversion
provenance. Reuse is allowed only when the source digest and conversion policy
match. A changed source produces a different variant and signed URL.

Conversion failure is terminal for that publication attempt and cannot be
reported as a successful Instagram publication.

## Signed Public Media Delivery

The public media route supports only `GET` and `HEAD` at
`/v1/public/marketing/media/:assetId`. Its query contains exactly the signed
claims `v`, `digest`, `policy`, `outputDigest`, `expires`, and `signature`.
The signature binds:

- the Marketing asset identifier;
- the source digest, exact JPEG conversion-policy fingerprint, and exact
  output digest;
- the expiry timestamp; and
- a versioned canonical request representation.

The API calculates an HMAC using a deployment-owned secret and verifies it
with constant-time comparison. Missing, malformed, modified, or expired
parameters fail closed. Error responses do not disclose whether an asset or
variant exists. The route validates the signed claim before applying a bounded
limiter keyed by the complete validated claim, including its signature. This
prevents invalid requests from consuming a valid signed URL's quota. Safe audit
events do not log access tokens, signing secrets, or signed query strings.

After validation, the controller delegates to the Marketing application
boundary, which resolves the permitted variant and streams it from private
storage as `image/jpeg`. It does not expose MinIO credentials, presigned MinIO
URLs, bucket names, or arbitrary storage keys.

## Configuration

Live mode requires typed startup configuration for:

- `INSTAGRAM_PUBLICATION_MODE=live`;
- `INSTAGRAM_BUSINESS_ACCOUNT_ID`;
- `INSTAGRAM_ACCESS_TOKEN` (the Page access token used for Instagram
  publication);
- `INSTAGRAM_PUBLIC_MEDIA_BASE_URL`;
- `MARKETING_PUBLIC_MEDIA_SIGNING_SECRET`;
- `MARKETING_PUBLIC_MEDIA_URL_TTL_SECONDS`;
- `MARKETING_INSTAGRAM_JPEG_QUALITY`;
- `MARKETING_PUBLIC_MEDIA_RATE_LIMIT`;
- `MARKETING_PUBLIC_MEDIA_RATE_WINDOW_MS`;
- `INSTAGRAM_CONTAINER_POLL_INTERVAL_MS`; and
- `INSTAGRAM_CONTAINER_MAX_POLL_ATTEMPTS`.

The public base URL must use HTTPS and must not be localhost, an internal IP,
or a reserved example domain. The signing secret must meet a minimum strength
requirement. The TTL is parsed as a bounded duration long enough for Meta to
fetch and process media without producing indefinitely reusable links.

Simulation mode does not require live secrets. Invalid live combinations stop
the affected adapter from being composed rather than silently falling back to
simulation or a placeholder. Tokens and signing secrets remain in ignored
environment files or deployment secret storage and are never committed,
returned by APIs, or written to logs.

## Cloudflare Quick Tunnel Development Flow

Quick Tunnel is a development-only bridge from a temporary
`https://*.trycloudflare.com` URL to the local API port. It exposes neither
PostgreSQL nor MinIO. The contributor workflow is:

1. Start local infrastructure and the API.
2. Start `cloudflared` against the local API origin.
3. Copy the generated HTTPS origin into
   `INSTAGRAM_PUBLIC_MEDIA_BASE_URL`.
4. Restart the API so typed configuration uses the new origin.
5. Verify the signed endpoint from outside the local network.
6. Publish one approved Instagram image target.

Quick Tunnel URLs change when the tunnel restarts and have no production SLA.
A stopped or changed tunnel therefore causes the Instagram attempt to fail
truthfully and remain retryable according to the existing target lifecycle.
Future deployment may replace only the configured public origin and ingress;
it does not require changing Marketing domain behavior.

## Error Handling and Observability

The system never marks an Instagram target published merely because a media
container was requested. It fails closed when conversion, private storage,
URL signing, tunnel delivery, Meta download, container processing, publication,
or receipt persistence fails.

Provider errors remain mapped to bounded internal error categories. A timeout
after a possibly accepted publish call retains the existing unknown-result and
reconciliation protection so retry cannot create a duplicate. Logs and audit
events include safe correlation identifiers, target and attempt identifiers,
status, and bounded error codes; they exclude tokens, secrets, raw signed URLs,
and unbounded provider bodies.

## Test Strategy

Implementation follows red-green-refactor. Focused tests cover:

- live configuration rejection for missing values, weak secrets, unsafe URLs,
  reserved domains, and out-of-range TTL values;
- simulation startup without live credentials;
- real PNG input producing valid JPEG output and metadata;
- deterministic variant reuse and source-digest invalidation;
- signature verification, tampering, expiry, asset substitution, `GET`, and
  `HEAD` behavior;
- denial of arbitrary object keys and uniform unauthorized responses;
- private JPEG streaming with the correct MIME type and bounded headers;
- Instagram container creation with the signed HTTPS URL, polling, publish,
  receipt mapping, and provider failure paths; and
- unchanged Facebook publication behavior.

The final local acceptance run must use the configured real Instagram account,
produce a real external media identifier, and show the image on that account.
It must also confirm that MinIO remains private and that no test, log, API
response, or committed file contains the Page access token or signing secret.

## Completion Criteria

This slice is complete when an approved Marketing Feed image is converted to a
private JPEG, retrieved by Meta through a valid short-lived URL over the local
Cloudflare tunnel, published on the configured real Instagram account, and
recorded as a verified live result. Repository checks, focused integration
tests, documentation, dependency records, environment examples, and changelog
must all reflect the delivered behavior.
