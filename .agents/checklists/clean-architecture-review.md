<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Clean Architecture Review

Use this checklist before committing or reviewing application structure work.

## Scope

- [ ] The owning module or frontend feature is explicit.
- [ ] Existing code migration has a focused, approved spec and plan.
- [ ] The change contains no empty trees, `.gitkeep` placeholders, or
      speculative modules.
- [ ] The implementation serves an approved phase and use case.

## Boundaries

- [ ] Domain code imports no framework, transport, persistence, or adapter code.
- [ ] Application code depends on inward-facing contracts, not concrete
      infrastructure.
- [ ] Controllers and routes contain no business logic.
- [ ] Services contain no direct database queries.
- [ ] Repository implementations contain no business policy.
- [ ] Cross-module and cross-feature imports use public entry points.
- [ ] Shared code has proven consumers and imports no business owner.

## Contracts

- [ ] Untrusted input is validated before use.
- [ ] Request and response DTOs match their specific use cases.
- [ ] Persistence entities are not exposed as API contracts by convenience.
- [ ] External SDK and credential access stays behind owned boundaries.
- [ ] Single-company authorization, approval, audit, and provenance rules
      remain enforced where relevant.

## Quality

- [ ] Tests cover the changed behavior and boundary risks.
- [ ] Loading, empty, error, and success states are covered for frontend work.
- [ ] New dependencies are justified, locked, and documented.
- [ ] Architecture, API, build, and changelog documentation is current.
- [ ] Relevant typecheck, lint, test, build, audit, and infrastructure checks
      pass.
