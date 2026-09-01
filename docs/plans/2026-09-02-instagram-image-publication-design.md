<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Governed Instagram Image Publication Design

## Status

Approved by the product owner on 2026-09-02.

## Goal

Extend the implemented Marketing & Creative department so one governed
campaign can prepare, approve, schedule, publish, verify, retry, and report
Facebook and Instagram image publications without duplicating Marketing
business logic or weakening the existing human-approval boundary.

The first delivery is credential-free and provider-ready. Local development
uses a truthful fake Instagram publisher and does not call Meta. Live Instagram
publication remains disabled until a later operator supplies an approved Meta
application, an Instagram Professional account, deployment HTTPS, public media
delivery, and deployment-owned secrets.

## Approved Scope

The first Instagram slice supports image-based:

- single-image Feed publications;
- image Stories;
- ordered image carousels;
- immediate and scheduled publication;
- one immutable human approval covering every Facebook and Instagram target in
  a campaign revision;
- target-level attempts, receipts, verification, reconciliation, and retries;
- truthful local simulation in API responses, artifacts, and Staff Console;
- an additive migration and compatibility path for existing Facebook-only
  campaigns.

Video Feed, Reels, and video Stories are represented only as disabled provider
capabilities. The backend rejects them with `FORMAT_NOT_ENABLED`. This design
does not create a video generator, placeholder workflow, fake video UI, or a
claim that video works. The media and publisher contracts remain sufficiently
neutral for a separately approved video phase to extend them without changing
Marketing ownership.

## Explicit Non-Goals

This slice does not implement TikTok, paid advertising, comment management,
post editing or deletion, analytics ingestion, recurring schedules, email,
customer-support messaging, Company Memory, GraphRAG, or a generic integration
module. It does not activate live Meta calls or accept provider credentials
through browser requests.

## Architecture

`apps/api/src/modules/marketing` remains the owner of campaign, content,
assets, approval packages, publication state, artifacts, and reporting. No new
business module is introduced.

The application layer depends on a platform-neutral `SocialPublisherPort` and
a publisher registry. Infrastructure supplies separate Facebook, Instagram,
and fake Instagram adapters. Meta request shapes, endpoints, response mapping,
and provider errors remain inside adapters. Domain and application code do not
import a Meta SDK, read environment variables, or know concrete credentials.

The API composition root receives typed Marketing publication configuration
and selects adapters explicitly. Invalid or incomplete live configuration
fails closed. There are no fallback account IDs, placeholder access tokens,
implicit model IDs, or request-body credentials. Existing Marketing fallbacks
encountered in the touched publication path are removed or moved behind typed
configuration as part of this focused change; this is not authorization for a
repository-wide refactor.

Private MinIO remains authoritative for generated assets. The local fake
adapter reads private storage references without exposing them. A future live
adapter requires a bounded HTTPS media-delivery mechanism that Meta can fetch;
live mode cannot be enabled merely by adding an access token.

## Domain and Persistence Model

A `PublicationPackage` remains the immutable unit bound to one approval, but it
contains one or more `PublicationTarget` records. Each target records:

- platform and image format;
- non-secret account configuration reference;
- ordered content and media references;
- scheduled publication time in UTC;
- content, media, and target digests;
- required/optional participation in campaign completion;
- simulation or live execution mode;
- independent lifecycle status.

The package digest covers the ordered set of target digests. Changing any
caption, image, order, account reference, format, execution mode, or schedule
supersedes the package and invalidates its approval. A single approval can
therefore authorize multiple platforms without becoming an open-ended approval
for later mutations.

Publication attempts and records are unique per target rather than per package.
An Instagram failure cannot cause an already successful Facebook target to be
submitted again. Provider responses are retained only as bounded error codes,
classes, digests, external identifiers, and verification evidence; raw tokens
and unbounded provider payloads are not persisted.

A new forward migration adds the target model and evolves attempt/record
constraints. It backfills existing Facebook packages as `facebook/feed_image`
targets and preserves their historical records. Historical migrations are not
edited, and legacy columns are not dropped in this slice. Migration up, down,
backfill, and mixed old/new reads require PostgreSQL integration coverage.

## Content and Asset Variants

One campaign revision may contain platform-specific content variants and image
assets. Feed, Story, and carousel previews are not derived in React from one
unvalidated generic payload. The backend produces purpose-specific variants,
records their provenance and digests, and validates them against the active
Instagram capability policy.

Platform constraints are centralized in typed policy/configuration and
deterministic validation. Controllers and components do not contain scattered
caption, media, dimension, or carousel limits. Assets retain MIME type,
dimensions, byte size, storage key, digest, alternative text, generation
provenance, model-run reference, and settled cost. Carousel order participates
in the target digest.

## Publication Flow

1. Authorized Marketing staff creates a campaign with explicit publication
   targets and a UTC schedule.
2. The Marketing workflow creates platform content variants and image assets.
3. Quality review assembles one package containing every exact target.
4. An authorized human sees all previews and approves or rejects the complete
   package once.
5. The scheduler finds approved targets that are due and claims each through a
   PostgreSQL transaction/lease.
6. The registry resolves the configured publisher adapter.
7. The adapter submits or simulates the exact target and returns a bounded
   receipt.
8. The application persists attempt and verification evidence, advances target
   state, and derives the aggregate campaign state.

The campaign becomes complete only after every required target has a verified
success and required artifacts exist. Mixed results use an explicit partial
state rather than hiding the failed platform.

Retryable errors use bounded backoff. Deterministic provider rejection becomes
`platform_rejected`. A timeout after a possibly accepted submission becomes
`publication_unknown`; reconciliation must establish whether the post exists
before another submission is allowed. Retry operates on one failed target and
never republishes the entire package.

## API and Console

API changes are additive. Campaign intake accepts validated `targets[]` rather
than accepting provider secrets. Campaign detail returns platform variants,
assets, target state, attempts, records, and execution mode. A capability
endpoint exposes the backend-authoritative enabled formats and modes so the
Console does not hard-code availability. Retry requires an explicit target ID.

The Staff Console Marketing feature adds:

- Facebook/Instagram target and enabled-format selection;
- separate Feed, Story, and carousel previews;
- an approval summary containing every locked target;
- a per-platform publication timeline and retry action;
- an unavoidable `Local simulation - not published to Instagram` label for
  fake receipts;
- disabled video capability messaging without a fake action.

Pages and hooks coordinate state; presentational components render validated
view models and emit user intent. Publication rules remain in the backend.
Frontend data passes through runtime schemas before use and follows the
existing feature public API and Linear-inspired responsive design rules.

Artifacts use platform-neutral names for new campaigns and state whether a
result is simulated or live. Existing Facebook artifact kinds remain readable
for historical campaigns. No report may say `published` when only the fake
adapter ran.

## Authorization, Secrets, Audit, and Provenance

Backend authorization guards create, revise, approve, schedule, publish,
reconcile, and retry actions. Campaign creation does not imply approval
authority. The publication worker uses its own governed workload identity.

PostgreSQL stores only account configuration references and safe metadata.
Access tokens and future webhook secrets belong to ignored environment files or
deployment secret storage and are injected only into the infrastructure
adapter. Secrets are never returned through APIs, written to prompts, stored in
workflow history, or logged.

Every package revision, approval decision, scheduler claim, attempt,
reconciliation, retry, receipt, and aggregate state change records actor,
policy decision, input/output digest, approval binding, audit, and provenance.

## Configuration and Rollout

Local defaults are explicit and safe:

- Facebook retains its existing configured behavior;
- Instagram image formats run in `simulation` mode;
- Instagram live publishing is disabled;
- all video formats are disabled.

Configuration is parsed once into a typed object. Invalid combinations prevent
the affected adapter from being composed. A later live activation must verify
Meta application approval, Professional account authorization, public HTTPS
media delivery, configured account reference, credentials, and a focused live
acceptance run. Live activation is an operator decision, not a source-code
default.

## Test and Acceptance Strategy

Implementation follows red-green-refactor. Required coverage includes:

- package and target digest/approval invalidation rules;
- capability denial for every video format;
- old Facebook campaign compatibility and migration backfill;
- migration up/down without loss of historical records;
- target claim concurrency and exactly-once provider invocation;
- partial Facebook/Instagram success without duplicate Facebook publication;
- unknown-outcome reconciliation before retry;
- fail-closed missing account/credential/public-media configuration;
- authorization denials for approval, publication, reconciliation, and retry;
- fake/live truthfulness in API DTOs, artifacts, and Console labels;
- responsive Feed, Story, carousel, approval, partial, error, and retry states.

Credential-free local acceptance starts the Compose stack, creates one
multi-platform campaign, produces image variants, approves one immutable
package, waits for the schedule, and verifies fake Instagram receipts,
artifacts, audit, provenance, and Console rendering. It must make no Meta
network call.

Before handoff, run focused Marketing unit and PostgreSQL integration tests,
Console tests and production build, migration lifecycle, Compose validation,
`git diff --check`, and `pnpm audit:repo`. Update configuration, build,
dependency, API, and changelog documentation affected by the implementation.
