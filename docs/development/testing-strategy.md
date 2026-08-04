<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Testing Strategy

Tests scale with behavior risk and module boundaries. They protect observable
contracts, business invariants, permission isolation, auditability,
and recovery behavior rather than mirroring implementation details.

## Development Loop

For behavior changes and refactors:

```text
Write a focused failing test
-> confirm it fails for the intended reason
-> implement the minimum behavior
-> run the focused test
-> refactor while green
-> run broader checks
```

Documentation-only work does not require artificial failing tests. It requires
link validation, repository audits, and review against the documented scope.

## Test Layers

| Layer | Purpose |
| --- | --- |
| Domain unit | Verify invariants, value behavior, and deterministic calculations |
| Application unit | Verify use cases through fake inward-facing ports |
| Repository contract | Hold multiple adapters to the same behavior |
| Controller or handler | Verify transport orchestration without persistence |
| API integration | Exercise routes, validation, composition, and error translation |
| Frontend unit/component | Verify user-visible states and interactions |
| Python unit/API | Verify service behavior and FastAPI contracts |
| End-to-end | Verify a critical cross-system workflow when infrastructure exists |

Not every feature needs every layer. Choose the smallest set that covers its
risks and public boundaries.

## Critical CompanyOS Coverage

Tests are mandatory around:

- Actor, department, role, resource, and data-classification isolation.
- Backend authorization and policy decisions.
- `ALLOW`, `REQUIRE_APPROVAL`, and `DENY` behavior.
- Human approval pause, resume, reject, reassign, and audit behavior.
- Workflow retry, timeout, recovery, and idempotency when introduced.
- Agent tool and memory scope enforcement.
- GraphRAG permission filtering before context construction.
- Citation and provenance retention.
- Secret handling and prevention of unauthorized connector access.
- Simulation mode avoiding production writes.

Permission-leakage tests must expect zero unauthorized records or context.

## Fixtures and Fakes

- Keep fixtures deterministic and owned by the relevant module.
- Include actors from different departments and permission scopes in access
  isolation tests.
- Preserve IDs, timestamps, correlation IDs, and causation IDs when a demo flow
  depends on them.
- Fakes implement the same focused interface as production adapters.
- Repository contract suites should be reusable by in-memory and future
  database adapters.
- Do not place test-only behavior in production implementations.

## Frontend States

Feature tests cover visible behavior rather than component internals. Exercise:

- Initial loading.
- Empty data.
- Recoverable and terminal errors.
- Successful data rendering.
- Permission-denied controls.
- Approval-waiting states.
- Responsive layouts for high-value workflows.

Visual changes also require desktop and mobile inspection following the
frontend design checklist.

## Verification

Use the cheapest relevant command while iterating. Before handoff, run the
commands documented in [`build-from-source.md`](../build-from-source.md) for the
workspaces changed by the implementation.

Always run:

```bash
git diff --check
pnpm audit:repo
```

Do not claim tests passed when a required runtime, dependency, or service was
unavailable. Report the skipped check and remaining risk explicitly.

## Coverage Policy

The project does not use an arbitrary global coverage target at this stage.
Coverage expectations follow risk. New critical business rules and public
contracts require direct assertions even when neighboring lines are already
executed incidentally.
