<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# MVP Status

## Current Phase

Phase 2: Company Operating Core

## Phase Status

| Phase | Status | Active Spec | Active Plan | Exit Decision |
| --- | --- | --- | --- | --- |
| Phase 1: Foundation | Complete | `docs/superpowers/specs/2026-07-30-app-foundation-design.md` | `docs/superpowers/plans/2026-07-30-app-foundation.md` | Complete after validation |
| Phase 2: Company Operating Core | Plan drafted | `docs/superpowers/specs/2026-07-31-company-operating-core-design.md` | `docs/superpowers/plans/2026-07-31-company-operating-core.md` | Not decided |
| Phase 3: iPaaS and Workflow | Not started | Not created | Not created | Not decided |
| Phase 4: Digital Workforce | Not started | Not created | Not created | Not decided |
| Phase 5: GraphRAG | Not started | Not created | Not created | Not decided |
| Phase 6: Cross-Department Demo | Not started | Not created | Not created | Not decided |
| Phase 7: Hardening | Not started | Not created | Not created | Not decided |

## Latest Validation Evidence

- Repository audit: run before each handoff.
- Runtime validation: begins in Phase 1 after application scaffolding exists.
- Phase 1 plan created; implementation validation begins after scaffold execution.
- Phase 1 validation: `git diff --check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:py`, `pnpm audit:repo`, and Docker Compose config all passed.
- Phase 2 spec drafted for backend/domain-first Company Operating Core.
- Phase 2 implementation plan drafted for domain contracts, in-memory repository, read-only API routes, documentation, and full validation.

## Open Risks

- Company Core models are not implemented.
- Real SSO login flow is not implemented.
- Workflow, agent runtime, and GraphRAG behavior are not implemented.
