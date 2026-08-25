<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Single-Admin Agentic Configuration Design

## Status

Approved by the user on 2026-08-22. This focused design changes Agentic
configuration activation from two-person review to direct, accountable
activation by one authorized human Administrator in every environment.

## Purpose

The person responsible for the Digital Workforce must be able to choose an
Agent's approved model, token limits, fallback, tool grants, policy rules, and
budget without waiting for another Administrator. The change removes only the
second-human approval requirement; it does not permit an Agent to grant itself
permissions, change its own budget, or take risky business actions without the
required human approval.

## Scope

This design changes the lifecycle of Agentic configuration revisions in the API
and its persisted governance records. It applies identically to local and
production deployments.

It does not add OpenRouter calls, broaden Agent tool access, change Commerce
truth, alter workflow/action approvals, or weaken emergency revocation. Phase D
live acceptance remains blocked until an active configuration contains all
seven approved model and budget records.

## Approved Decisions

- A holder of `agentic_governance_admin` may create, edit, and directly
  activate their own valid configuration revision. `administrator` retains the
  same authority.
- Activation has no submit, reviewer, second decision, or self-review
  prohibition. One authorized human is accountable for the whole change.
- The direct activation operation validates the complete immutable revision,
  atomically supersedes the current active revision, activates the new one,
  and appends its audit event in the same transaction.
- The active revision remains the only configuration used for new tasks. A task
  that is already ready or running stays pinned to its prior immutable
  revision; current emergency revocation continues to win.
- Audit and provenance remain mandatory. Each direct activation records the
  actor subject, timestamp, previous and new revision IDs/versions, normalized
  revision digest, and changed policy/tool/model/budget summaries. It contains
  neither secrets nor prompt/response bodies.
- Existing historical submit and decision records remain readable for audit.
  New configuration revisions do not use the submit/decision path.
- The existing human approval flow for risky workflow actions remains separate
  and unchanged. This design governs configuration responsibility, not
  approval of financial, legal, publishing, permission-changing, or production
  business actions.

## Lifecycle and Authorization

```text
authorized Agentic Admin
  -> create or edit owned draft
  -> backend validates complete revision
  -> direct activate
  -> atomically supersede previous active revision
  -> append audit/provenance
  -> new tasks pin the new revision
```

Only the backend authorizes this flow from the authenticated subject and role
claims. Payload-provided identities are never trusted. A caller without
`agentic_governance_admin` or `administrator` receives `403`. Draft ownership,
optimistic revision versions, one-active-revision database protection, and
append-only audit/provenance constraints remain enforced.

The direct activation endpoint accepts only a draft owned by the caller. It
revalidates all referenced Digital Employees, policy rules, tool descriptors
and grants, model primary/fallback configuration, token limits, and task/daily/
monthly budgets immediately before activation. Invalid, revoked, stale, or
concurrently changed revisions fail without changing the active revision.

## API Compatibility

The API adds a direct `activate` operation for configuration revisions. It
reuses the existing revision detail and diff DTOs and returns the activated
revision plus its audit reference.

The legacy `submit` and `decision` operations stay readable for historical
records but reject attempts to use them for new revisions with a clear
configuration-lifecycle error. There is no implicit activation when a draft is
created or edited: the responsible Administrator explicitly invokes direct
activation, making the accountable mutation auditable without involving a
second person.

## Data and Failure Handling

No prompt, provider response, credential, or model API key enters the
configuration or audit records. Model cost and budget values are integers in
microunits as in the existing governance schema.

If activation fails validation, authorization, optimistic concurrency, audit
append, or database constraints, the transaction rolls back and leaves the
previous active revision intact. Existing submitted revisions and their
historical decisions are preserved; an operator may create a new direct-activate
draft instead of mutating that historical record.

Emergency revocation remains immediately effective and is not bypassed by
activating a configuration revision.

## Acceptance Criteria

- One `agentic_governance_admin` can activate their own valid draft in local
  and production composition without a second human identity.
- A configuration activation is atomic: exactly one active revision exists and
  the audit event exists exactly once, even under concurrent activation.
- A caller without the authorized role, a non-owner, a stale draft, an invalid
  model/budget/tool/policy reference, or a revoked dependency cannot activate.
- New tasks receive the new revision; existing pinned tasks retain their prior
  revision; emergency revocation still denies future use.
- Legacy two-person submit/decision records remain queryable, while the new
  direct activation path is covered by unit, PostgreSQL concurrency,
  authorization API, migration/lifecycle, and repository audit checks.
