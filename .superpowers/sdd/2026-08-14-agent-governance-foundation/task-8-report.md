<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Task 8 Report: Agent Governance Foundation Exit

## Delivered

- Composed the PostgreSQL-backed Agentic module at the Console-only
  `/v1/admin/agentic` prefix and added the Agentic migration to readiness.
- Closed the final security review findings: active model revocations are
  enforced, approvals are purpose-scoped, intake provenance is atomic and
  immutable, configuration diffs are exact, Agent identities are database
  immutable, and audit readers receive purpose-specific resource allow-lists.
- Documented the four staff roles, seven separate service identities, API
  boundaries, migration order, local secret handling, lifecycle rules, and
  current non-executing scope.
- Kept Phase A free of Temporal, OpenRouter calls, file intake, generic SQL,
  Commerce adapters/mutations, and Agentic Console features.

## Commits

- `b84180c` `feat(agentic): separate workforce identities`
- `93b4b36` `feat(agentic): define governance domain rules`
- `52e91f7` `feat(agentic): persist governance control plane`
- `09b4f83` `feat(agentic): enforce policy tools and budgets`
- `b66ba1b` `feat(agentic): govern configuration approvals`
- `3ebbd57` `feat(agentic): manage governed task intake`
- `557fafd` `feat(agentic): expose governed staff api`
- `0ac6ac9` `fix(agentic): harden governance boundaries`

## Verification Evidence

- Complete API unit suite: 88 files, 462 tests passed.
- Focused Agentic PostgreSQL/API integration: 3 files, 13 tests passed against
  a disposable database named `opendx_test`.
- Complete API integration, run sequentially against a disposable PostgreSQL
  18 database named `opendx_test`: 44 files passed, 1 skipped; 161 tests passed,
  2 skipped. Parallel execution is invalid for this repository's shared-schema
  migration suites because they independently migrate and roll back the same
  tables.
- Full repository `pnpm check`: API 462, Console 113, Storefront 74, workspace
  packages 4, Python 1; production builds, repository audit, and Compose
  validation passed.
- Complete migration lifecycle `db:migrate:all -> db:rollback:all ->
  db:migrate:all` passed against a fresh disposable PostgreSQL 16
  `opendx_test` database, including both Agentic migrations.
- PostgreSQL tests cover immutable audit/provenance, draft-only configuration,
  one active revision, ownership, two-person activation, concurrent activation,
  budget reservation/settlement idempotency, and task/configuration pinning.

## Security and Scope Review

Diff and source searches found no OpenRouter/Temporal runtime, Agent secret,
generic SQL tool, Commerce-private import, file intake, in-memory production
repository, task-instruction logging, Console implementation, or Commerce
mutation in `apps/api/src/modules/agentic`. Staff and service principals remain
separate; backend role and ownership predicates protect every exposed route.
An independent final review reported no remaining Critical or Important
findings.

## Known Limitations

Phase A is a governance control plane only. Tasks can be drafted, made ready,
or canceled, but no worker executes them. Tool descriptors and model choices
remain inert until later phases receive focused approval and plans.
