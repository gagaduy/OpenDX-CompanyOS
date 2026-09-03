<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Instagram Live Local Tunnel Implementation Plan

**Goal:** Publish an approved Marketing image to the configured real Instagram account while CompanyOS runs locally, using a private JPEG variant and a signed, expiring HTTPS URL delivered through Cloudflare Quick Tunnel.

**Architecture:** The Marketing application owns URL signing, expiry policy, source-digest verification, and authorization of one exact visual asset. Infrastructure converts PNG bytes with `sharp`, stores deterministic JPEG variants and provenance metadata in private MinIO, and submits signed URLs through the existing Meta Graph adapter. A narrowly mounted unauthenticated router verifies the HMAC before resolving or streaming any object; it never accepts a storage key or exposes MinIO.

**Tech Stack:** TypeScript 7, Node.js 22, Express 5, Zod 4, MinIO 8, `sharp` 0.35.4, Vitest 4, Supertest, Docker Compose, Cloudflare Quick Tunnel.

---

### Task 1: Add fail-closed live media configuration

**Files:**
- Modify: `apps/api/src/shared/config/environment.test.ts`
- Modify: `apps/api/src/shared/config/environment.ts`

**Step 1: Write failing configuration tests**

Extend the live Instagram test source with:

```ts
const liveInstagramSource = {
  INSTAGRAM_PUBLICATION_MODE: "live",
  INSTAGRAM_ACCOUNT_CONFIGURATION_ID: "ig-live-1",
  INSTAGRAM_BUSINESS_ACCOUNT_ID: "17841400000000000",
  INSTAGRAM_ACCESS_TOKEN: "page-access-token",
  INSTAGRAM_PUBLIC_MEDIA_BASE_URL: "https://random.trycloudflare.com/v1/public/marketing/media",
  MARKETING_PUBLIC_MEDIA_SIGNING_SECRET: "s".repeat(32),
  MARKETING_PUBLIC_MEDIA_URL_TTL_SECONDS: "900",
  MARKETING_INSTAGRAM_JPEG_QUALITY: "90",
  MARKETING_PUBLIC_MEDIA_RATE_LIMIT: "120",
  MARKETING_PUBLIC_MEDIA_RATE_WINDOW_MS: "60000",
} as const;
```

Assert that `environment.marketing.instagram` contains the parsed signing
secret, TTL, quality, rate limit, and rate window. Add table tests proving that
live mode rejects:

```ts
[
  ["MARKETING_PUBLIC_MEDIA_SIGNING_SECRET", { MARKETING_PUBLIC_MEDIA_SIGNING_SECRET: "short" }],
  ["MARKETING_PUBLIC_MEDIA_URL_TTL_SECONDS", { MARKETING_PUBLIC_MEDIA_URL_TTL_SECONDS: "59" }],
  ["MARKETING_PUBLIC_MEDIA_URL_TTL_SECONDS", { MARKETING_PUBLIC_MEDIA_URL_TTL_SECONDS: "3601" }],
  ["MARKETING_INSTAGRAM_JPEG_QUALITY", { MARKETING_INSTAGRAM_JPEG_QUALITY: "69" }],
  ["MARKETING_PUBLIC_MEDIA_RATE_LIMIT", { MARKETING_PUBLIC_MEDIA_RATE_LIMIT: "0" }],
  ["MARKETING_PUBLIC_MEDIA_RATE_WINDOW_MS", { MARKETING_PUBLIC_MEDIA_RATE_WINDOW_MS: "999" }],
]
```

Also reject `https://localhost/...`, `https://127.0.0.1/...`,
`https://10.0.0.1/...`, `https://172.16.0.1/...`,
`https://192.168.1.1/...`, `https://[::1]/...`, and `.local` hosts.
Retain the existing reserved-documentation-domain cases. Assert that
simulation still parses without any live-media secret.

**Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm --filter @opendx/api exec vitest run src/shared/config/environment.test.ts
```

Expected: FAIL because the new variables and unsafe-host checks are absent.

**Step 3: Implement the typed schema and discriminated configuration**

Add schema fields with these exact bounds:

```ts
MARKETING_PUBLIC_MEDIA_SIGNING_SECRET: optionalSecret,
MARKETING_PUBLIC_MEDIA_URL_TTL_SECONDS: positiveInteger
  .pipe(z.number().int().min(60).max(3_600))
  .default(900),
MARKETING_INSTAGRAM_JPEG_QUALITY: positiveInteger
  .pipe(z.number().int().min(70).max(100))
  .default(90),
MARKETING_PUBLIC_MEDIA_RATE_LIMIT: positiveInteger
  .pipe(z.number().int().min(1).max(1_000))
  .default(120),
MARKETING_PUBLIC_MEDIA_RATE_WINDOW_MS: positiveInteger
  .pipe(z.number().int().min(1_000).max(3_600_000))
  .default(60_000),
```

In the live `superRefine` branch, require a signing secret of at least 32
characters and reject non-public hosts through a focused
`isPublicMediaHostname(hostname)` helper. Do not reject the generated
`*.trycloudflare.com` hostname. Extend the live union member with:

```ts
readonly signingSecret: string;
readonly urlTtlSeconds: number;
readonly jpegQuality: number;
readonly rateLimit: number;
readonly rateWindowMs: number;
```

Map only validated values in `parseApiEnvironment`. Keep the existing
`INSTAGRAM_ACCESS_TOKEN` name for backward compatibility; document that it is
the Page access token used for Instagram Graph publication.

**Step 4: Verify GREEN**

Run the focused command from Step 2 and expect all environment tests to pass.

**Step 5: Commit**

```bash
git add apps/api/src/shared/config/environment.ts apps/api/src/shared/config/environment.test.ts
git commit -m "feat(marketing): validate live media delivery config"
```

---

### Task 2: Add the JPEG transformation boundary

**Files:**
- Create: `apps/api/src/modules/marketing/application/ports/marketing-image-transformer.port.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/adapters/sharp-marketing-image-transformer.adapter.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/adapters/sharp-marketing-image-transformer.adapter.test.ts`
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: Install the reviewed dependency**

Run:

```bash
pnpm --filter @opendx/api add sharp@0.35.4
```

The lockfile must resolve the Apache-2.0 package without vendoring source.

**Step 2: Define the inward-facing contract**

Create:

```ts
export interface MarketingJpegVariant {
  readonly bytes: Buffer;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly sha256Digest: string;
}

export interface MarketingImageTransformerPort {
  toJpeg(source: Buffer, quality: number): Promise<MarketingJpegVariant>;
}
```

Include the repository SPDX header.

**Step 3: Write failing adapter tests**

Use `create1x1SquarePngBuffer(1080, 1080)` as real input. Assert that:

```ts
expect(result.bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
expect(result.width).toBe(1080);
expect(result.height).toBe(1080);
expect(result.byteSize).toBe(result.bytes.byteLength);
expect(result.sha256Digest).toMatch(/^[a-f0-9]{64}$/);
```

Add a test that invalid bytes reject rather than producing a placeholder.

**Step 4: Run tests and verify RED**

```bash
pnpm --filter @opendx/api exec vitest run src/modules/marketing/infrastructure/adapters/sharp-marketing-image-transformer.adapter.test.ts
```

Expected: FAIL because the adapter does not exist.

**Step 5: Implement the Sharp adapter**

Implement `MarketingImageTransformerPort` using:

```ts
const { data, info } = await sharp(source, { failOn: "error" })
  .rotate()
  .jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4" })
  .toBuffer({ resolveWithObject: true });
```

Validate quality in the constructor call boundary, require positive output
dimensions, check the JPEG signature, and calculate SHA-256 with
`node:crypto`. Never fall back to fabricated bytes.

**Step 6: Verify GREEN and commit**

Run the focused test, then:

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/modules/marketing/application/ports/marketing-image-transformer.port.ts apps/api/src/modules/marketing/infrastructure/adapters/sharp-marketing-image-transformer.adapter.ts apps/api/src/modules/marketing/infrastructure/adapters/sharp-marketing-image-transformer.adapter.test.ts
git commit -m "feat(marketing): generate private Instagram JPEG variants"
```

---

### Task 3: Extend private MinIO storage for reusable variants

**Files:**
- Create: `apps/api/src/modules/marketing/application/ports/marketing-public-media-storage.port.ts`
- Modify: `apps/api/src/modules/marketing/infrastructure/storage/minio-marketing-artifact.storage.ts`
- Modify: `apps/api/src/modules/marketing/infrastructure/storage/minio-marketing-artifact.storage.test.ts`

**Step 1: Define the storage contract**

```ts
export interface MarketingPublicMediaVariant {
  readonly bytes: Buffer;
  readonly mediaType: "image/jpeg";
  readonly sourceAssetId: string;
  readonly sourceDigest: string;
  readonly outputDigest: string;
  readonly policyFingerprint: string;
  readonly width: number;
  readonly height: number;
}

export interface WriteMarketingPublicMediaVariant {
  readonly key: string;
  readonly bytes: Buffer;
  readonly sourceAssetId: string;
  readonly sourceDigest: string;
  readonly outputDigest: string;
  readonly policyFingerprint: string;
  readonly width: number;
  readonly height: number;
}

export interface MarketingPublicMediaStoragePort {
  readVariant(key: string): Promise<MarketingPublicMediaVariant | null>;
  writeVariant(input: WriteMarketingPublicMediaVariant): Promise<void>;
}
```

**Step 2: Write failing MinIO tests**

Prove that `readVariant` returns `null` only for MinIO `NoSuchKey` or
`NotFound`, propagates transport errors, and concatenates an existing stream.
Prove that `writeVariant` sends `image/jpeg` plus source asset, source digest,
output digest, policy fingerprint, width, and height metadata. Prove that
`readVariant` parses all provenance case-insensitively and reports a typed
integrity error for missing or malformed metadata without manufacturing
defaults. Keep the existing unsafe-key test and add denial for a variant key
containing `..` or a non-Marketing prefix.

**Step 3: Run tests and verify RED**

```bash
pnpm --filter @opendx/api exec vitest run src/modules/marketing/infrastructure/storage/minio-marketing-artifact.storage.test.ts
```

Expected: FAIL because variant methods and `statObject` support are absent.

**Step 4: Implement storage methods**

Expand the injected MinIO client type to `Pick<Client,
"getObject" | "putObject" | "statObject">`. `readVariant` must call
`statObject` first, accept only a stored `image/jpeg` content type, and then
parse the complete trusted provenance metadata before reading the object.
`writeVariant` must call `putObject` with the exact metadata from Step 2. Reuse
`assertMarketingStorageKey`; do not accept an object key from HTTP input.

**Step 5: Verify GREEN and commit**

Run the focused test, then:

```bash
git add apps/api/src/modules/marketing/application/ports/marketing-public-media-storage.port.ts apps/api/src/modules/marketing/infrastructure/storage/minio-marketing-artifact.storage.ts apps/api/src/modules/marketing/infrastructure/storage/minio-marketing-artifact.storage.test.ts
git commit -m "feat(marketing): store reusable private JPEG variants"
```

---

### Task 4: Implement signed media materialization and retrieval

**Files:**
- Create: `apps/api/src/modules/marketing/application/services/interfaces/marketing-public-media.service.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/marketing-public-media.service.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/marketing-public-media.service.test.ts`

**Step 1: Define the application contract**

```ts
import type { SocialPublishMediaItem } from "../../ports/social-publisher.port";

export interface ReadMarketingPublicMediaInput {
  readonly assetId: string;
  readonly sourceDigest: string;
  readonly policy: string;
  readonly outputDigest: string;
  readonly expires: number;
  readonly signature: string;
}

export interface MarketingPublicMediaPayload {
  readonly bytes: Buffer;
  readonly mediaType: "image/jpeg";
  readonly outputDigest: string;
}

export interface MarketingPublicMediaService {
  prepareUrl(media: SocialPublishMediaItem): Promise<string>;
  read(input: ReadMarketingPublicMediaInput): Promise<MarketingPublicMediaPayload>;
}
```

Add a `MarketingPublicMediaAccessError` whose public message is always
`Marketing media is unavailable`.

**Step 2: Write the service test list**

Create deterministic fakes for repository, storage, transformer, and clock.
Cover these behaviors one at a time:

1. Source bytes must hash to the persisted `VisualAsset.imageDigest`.
2. A named, versioned JPEG conversion policy fingerprint includes the configured
   quality. The key is
   `marketing/public-media/<assetId>/<sourceDigest>/<policy>.jpg` and never
   comes from the caller. Changing quality or policy must produce a distinct
   key and variant.
3. An existing JPEG variant is reused without calling the transformer or
   writer only when its asset, source digest, policy fingerprint, output
   digest, dimensions, JPEG magic, and actual byte digest all match. Any cache
   integrity mismatch is regenerated and overwritten before signing.
4. A missing variant is transformed once and written with complete metadata.
5. The returned URL uses the configured HTTPS base and contains only
   `v=1`, `digest`, `policy`, `outputDigest`, `expires`, and `signature` query
   parameters.
6. A valid claim returns the exact stored JPEG bytes only when their actual
   SHA-256 digest matches the signed `outputDigest`.
7. Expired, excessive-future, malformed, tampered, asset-substituted,
   source-digest-substituted, policy-substituted, and output-digest-substituted
   claims all throw the same access error.
8. Signature verification happens before repository or storage lookup.
9. A missing asset or object does not reveal which resource was absent.
10. Public retrieval validates stored asset, source, policy, output digest, and
    dimensions against both the signed claim and `VisualAsset`; it never
    regenerates during a public request.

Use a fixed clock and assert `expires === nowEpochSeconds + urlTtlSeconds`.

**Step 3: Run tests and verify RED**

```bash
pnpm --filter @opendx/api exec vitest run src/modules/marketing/application/services/implementations/marketing-public-media.service.test.ts
```

Expected: FAIL because the service does not exist.

**Step 4: Implement the service**

Constructor dependencies are:

```ts
{
  repository: MarketingRepository;
  storage: MarketingPublicMediaStoragePort;
  transformer: MarketingImageTransformerPort;
  publicBaseUrl: string;
  signingSecret: string;
  urlTtlSeconds: number;
  jpegQuality: number;
  now?: () => string;
}
```

Use the canonical HMAC input:

```text
v1\n<assetId>\n<sourceDigest>\n<policy>\n<outputDigest>\n<expires>
```

Create a lowercase hexadecimal SHA-256 HMAC. Before any repository lookup,
validate expiry (including a configured maximum future lifetime) and compare
the supplied signature to the expected signature with `timingSafeEqual`. For
malformed signature length, compare against a same-sized zero buffer and still
return the generic error. Validate JPEG magic on both newly transformed and
reused bytes. Calculate the output digest for every variant before signing and
again on retrieval; deny access when the stored bytes no longer match the
signed digest. Treat the storage boundary's typed integrity error as a cache
miss only during `prepareUrl`, then regenerate and overwrite the deterministic
variant. All transport errors remain fail-closed, and `read` never regenerates.

**Step 5: Verify GREEN and commit**

Run the focused suite, then:

```bash
git add apps/api/src/modules/marketing/application/services/interfaces/marketing-public-media.service.ts apps/api/src/modules/marketing/application/services/implementations/marketing-public-media.service.ts apps/api/src/modules/marketing/application/services/implementations/marketing-public-media.service.test.ts
git commit -m "feat(marketing): sign expiring Instagram media URLs"
```

---

### Task 5: Make the Instagram adapter consume signed JPEG URLs

**Files:**
- Modify: `apps/api/src/modules/marketing/infrastructure/adapters/meta-graph-instagram-publisher.adapter.test.ts`
- Modify: `apps/api/src/modules/marketing/infrastructure/adapters/meta-graph-instagram-publisher.adapter.ts`

**Step 1: Update tests before production code**

Replace `publicMediaBaseUrl` in the test fixture with:

```ts
preparePublicMediaUrl: vi.fn(async ({ id }) =>
  `https://random.trycloudflare.com/v1/public/marketing/media/${id}?v=1&digest=${"a".repeat(64)}&expires=1788330000&signature=${"b".repeat(64)}`,
),
```

For Feed, Story, and every carousel child, parse the submitted form body and
assert that `image_url` is the exact prepared HTTPS URL, contains no `.png`,
and never contains the access token. Add a preparation-failure test proving
that Meta is never called. Change the permalink fallback expectation to
`publicationUrl: null` so no account username or guessed post path is
hard-coded.

**Step 2: Run the adapter tests and verify RED**

```bash
pnpm --filter @opendx/api exec vitest run src/modules/marketing/infrastructure/adapters/meta-graph-instagram-publisher.adapter.test.ts
```

Expected: FAIL because the adapter still concatenates `.png` URLs and contains
a fixed Instagram profile fallback.

**Step 3: Implement the minimal adapter change**

Replace `publicMediaBaseUrl` with:

```ts
readonly preparePublicMediaUrl: (media: SocialPublishMediaItem) => Promise<string>;
```

Await this function for each target media item before creating a container.
Keep all token-bearing Graph calls inside the adapter. Initialize
`publicationUrl` to `null`, set it only from a successful Meta `permalink`
response, and return `null` when lookup fails. Do not infer an Instagram
username or permalink.

**Step 4: Verify GREEN and commit**

Run the focused suite, then:

```bash
git add apps/api/src/modules/marketing/infrastructure/adapters/meta-graph-instagram-publisher.adapter.ts apps/api/src/modules/marketing/infrastructure/adapters/meta-graph-instagram-publisher.adapter.test.ts
git commit -m "fix(marketing): submit signed JPEG URLs to Instagram"
```

---

### Task 6: Expose the bounded public media route and wire the module

**Files:**
- Create: `apps/api/src/modules/marketing/presentation/validators/marketing-public-media.validator.ts`
- Create: `apps/api/src/modules/marketing/presentation/controllers/marketing-public-media.controller.ts`
- Create: `apps/api/src/modules/marketing/presentation/routes/marketing-public-media.routes.ts`
- Create: `apps/api/src/modules/marketing/tests/marketing-public-media.api.test.ts`
- Modify: `apps/api/src/modules/marketing/marketing.module.ts`
- Modify: `apps/api/src/modules/marketing/index.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/api/src/server.ts`

**Step 1: Write route and mount tests**

The API test must inject a fake `MarketingPublicMediaService` and prove:

- `GET /:assetId` streams exact bytes with `Content-Type: image/jpeg`, an
  output-digest `ETag`, `X-Content-Type-Options: nosniff`, and
  `Cache-Control: private, no-store`;
- `HEAD /:assetId` returns the same safe headers and no body;
- malformed UUID, digest, policy, output digest, expiry, signature, expired URL,
  excessive-future URL, and unknown media all produce the same `404` code and
  message;
- no request accepts a bucket name or object key; and
- exceeding the injected limiter returns `429`.

Add an app mount assertion for:

```text
/v1/public/marketing/media/<assetId>
```

and prove that Console/Storefront origins do not add credentialed CORS headers
to this server-to-server route.

**Step 2: Run tests and verify RED**

```bash
pnpm --filter @opendx/api exec vitest run src/modules/marketing/tests/marketing-public-media.api.test.ts src/app.test.ts
```

Expected: FAIL because the validator, route, and app mount do not exist.

**Step 3: Implement validation, controller, and router**

The validator accepts only:

```ts
assetId: z.uuid(),
v: z.literal("1"),
digest: z.string().regex(/^[a-f0-9]{64}$/),
policy: z.string().regex(/^[a-f0-9]{64}$/),
outputDigest: z.string().regex(/^[a-f0-9]{64}$/),
expires: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().safe()),
signature: z.string().regex(/^[a-f0-9]{64}$/),
```

Map every validation or `MarketingPublicMediaAccessError` outcome to the same
`ApplicationError(404, "MARKETING_MEDIA_NOT_FOUND", "Marketing media is unavailable")`.
The controller delegates to the service and owns HTTP headers only. Create
explicit `GET` and `HEAD` handlers.

Build the router with an injected or configured `express-rate-limit` handler:

```ts
rateLimit({
  windowMs: configuration.rateWindowMs,
  limit: configuration.rateLimit,
  standardHeaders: "draft-8",
  legacyHeaders: false,
})
```

**Step 4: Wire live mode without affecting simulation**

In `createMarketingModule`, construct the Sharp transformer and public-media
service only when `instagram.mode === "live"`. Require the injected
`MarketingPublicMediaStoragePort`; otherwise fail composition instead of using
a placeholder. Inject `service.prepareUrl` into the Instagram adapter. Return
an optional `publicRouter` from the module.

Add `marketingPublicRouter?: Router` to `CreateApiAppOptions` and mount it at
`/v1/public/marketing/media` without browser CORS or staff authentication.
Pass `marketingStorage` into the module and pass `marketing.publicRouter` into
`createApiApp` from `server.ts`.

Export only the intended public contracts from `marketing/index.ts`.

**Step 5: Verify GREEN and commit**

Run the focused tests, then:

```bash
git add apps/api/src/modules/marketing/presentation/validators/marketing-public-media.validator.ts apps/api/src/modules/marketing/presentation/controllers/marketing-public-media.controller.ts apps/api/src/modules/marketing/presentation/routes/marketing-public-media.routes.ts apps/api/src/modules/marketing/tests/marketing-public-media.api.test.ts apps/api/src/modules/marketing/marketing.module.ts apps/api/src/modules/marketing/index.ts apps/api/src/app.ts apps/api/src/app.test.ts apps/api/src/server.ts
git commit -m "feat(marketing): serve signed private Instagram media"
```

---

### Task 7: Document dependency, environment, and local tunnel operation

**Files:**
- Modify: `.env.example`
- Modify: `infra/docker/docker-compose.yml`
- Modify: `docs/dependencies.md`
- Modify: `docs/build-from-source.md`
- Modify: `docs/plans/2026-09-02-instagram-live-local-tunnel-design.md`
- Modify: `CHANGELOG.md`

**Step 1: Add safe environment examples**

Append these non-secret defaults to the Marketing section and leave the secret
blank:

```dotenv
MARKETING_PUBLIC_MEDIA_SIGNING_SECRET=
MARKETING_PUBLIC_MEDIA_URL_TTL_SECONDS=900
MARKETING_INSTAGRAM_JPEG_QUALITY=90
MARKETING_PUBLIC_MEDIA_RATE_LIMIT=120
MARKETING_PUBLIC_MEDIA_RATE_WINDOW_MS=60000
```

Pass the same five values through the Compose API environment. Do not add a
real token, Instagram ID, tunnel hostname, or signing secret to any tracked
file.

**Step 2: Update contributor documentation**

In `docs/dependencies.md`, record `sharp` 0.35.4, Apache-2.0, Node >=20.9,
and its bounded Marketing PNG-to-JPEG purpose. Keep `cloudflared` outside the
application dependency list and describe it as an optional developer-operated
HTTPS tunnel.

In `docs/build-from-source.md`, add a development-only Instagram section with
this order:

```bash
set -a
. ./.env
set +a
cloudflared tunnel --url "http://localhost:${API_PORT}"
```

Explain that the generated `https://*.trycloudflare.com` origin must be
combined with `/v1/public/marketing/media`, placed only in ignored `.env`, and
that the API must be restarted afterward. State that the URL changes after a
tunnel restart and is not a deployment endpoint. Explain how to generate and
store a separate 32-byte signing secret without printing it into logs or
committing it. Never include the user's current token or ID.

Amend the design configuration name from
`INSTAGRAM_PAGE_ACCESS_TOKEN` to the repository-compatible
`INSTAGRAM_ACCESS_TOKEN`, with a note that it contains the Page access token.

Move the approved Planned changelog item into Added/Changed entries describing
the delivered JPEG transformer, signed route, live adapter wiring, and local
tunnel documentation. Include the removal of the fixed Instagram permalink
fallback under Fixed.

**Step 3: Verify documentation and Compose**

```bash
docker compose --env-file .env.example -f infra/docker/docker-compose.yml config --quiet
git diff --check
pnpm audit:repo
```

Expected: all commands exit 0 and no secret audit reports tracked credentials.

**Step 4: Commit**

```bash
git add .env.example infra/docker/docker-compose.yml docs/dependencies.md docs/build-from-source.md docs/plans/2026-09-02-instagram-live-local-tunnel-design.md CHANGELOG.md
git commit -m "docs(marketing): document local Instagram live publication"
```

---

### Task 8: Run broad verification and real local acceptance

**Files:**
- No tracked source file is created for credentials or acceptance evidence.
- Modify only ignored root `.env` during operator setup.

**Step 1: Run focused Marketing and configuration suites**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/shared/config/environment.test.ts \
  src/modules/marketing/application/services/implementations/marketing-public-media.service.test.ts \
  src/modules/marketing/infrastructure/adapters/sharp-marketing-image-transformer.adapter.test.ts \
  src/modules/marketing/infrastructure/adapters/meta-graph-instagram-publisher.adapter.test.ts \
  src/modules/marketing/infrastructure/storage/minio-marketing-artifact.storage.test.ts \
  src/modules/marketing/tests/marketing-public-media.api.test.ts
```

Expected: all focused tests pass with zero unhandled errors.

**Step 2: Run repository gates**

```bash
pnpm check:full
git diff --check
pnpm audit:repo
pnpm audit:secrets
```

Expected: every command exits 0. If a required Docker-backed check is
unavailable, report it rather than claiming completion.

**Step 3: Configure ignored local secrets**

In root `.env`, set:

```dotenv
INSTAGRAM_PUBLICATION_MODE=live
INSTAGRAM_ACCOUNT_CONFIGURATION_ID=<non-secret configuration reference>
INSTAGRAM_BUSINESS_ACCOUNT_ID=<verified Instagram professional account id>
INSTAGRAM_ACCESS_TOKEN=<Page access token with Instagram publication permissions>
INSTAGRAM_PUBLIC_MEDIA_BASE_URL=https://<current-random-host>.trycloudflare.com/v1/public/marketing/media
MARKETING_PUBLIC_MEDIA_SIGNING_SECRET=<independent random secret of at least 32 characters>
```

Do not echo, screenshot, commit, or include any real value in evidence. Verify
the configured account through a safe Meta `fields=id,username` request that
reports only whether the ID matches, never the token.

**Step 4: Start local services and Quick Tunnel**

Start the stack in simulation first so the API is available, start
`cloudflared` against the configured local API port, update only the ignored
base URL, then rebuild/restart the API in live mode. Verify health endpoints
and fetch one newly generated signed URL from outside localhost. Confirm the
response is JPEG and MinIO remains unreachable publicly.

**Step 5: Perform one governed live publication**

Create or reuse one Marketing campaign with an Instagram Feed image target,
complete the existing human approval, and publish exactly once. Confirm:

- the receipt is `executionMode: "live"` and `simulated: false`;
- Meta returns a real external media identifier;
- the post appears on the configured Instagram account;
- the stored publication record and target status show verified success;
- Facebook behavior is unchanged; and
- logs contain no access token, signing secret, or signed query string.

If Meta rejects the request, preserve the bounded error code and diagnose it;
do not switch to simulation or fabricate success.

**Step 6: Final verification commit only if acceptance required a tracked fix**

Do not create an empty acceptance commit. If a focused tracked correction is
needed, repeat TDD and commit it atomically with an appropriate Conventional
Commit message and changelog entry.
