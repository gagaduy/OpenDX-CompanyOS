<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Master Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operate the OpenDX CompanyOS project from current foundation state to a complete MVP demo through phase-gated sub-specs, sub-plans, implementation units, and verification gates.

**Architecture:** This plan is a coordination plan, not a runtime implementation plan. It defines the concrete sequence for creating future specs and plans, executing phase work, and deciding whether each phase is complete before moving forward.

**Tech Stack:** Superpowers specs and plans, Markdown documentation, Conventional Commits, Keep a Changelog, GitHub repository workflow, repository audit script, and future phase-specific validation commands.

## Global Constraints

- Roadmap target is the MVP demo, not public 1.0 release.
- Product center is `Company`, not chatbot or agent persona.
- Every phase must preserve Company-first modeling, backend-enforced authorization, tenant isolation, agent service-account separation, Tool Registry mediation, human approval for risky actions, workflow versioning, GraphRAG permission filtering before LLM context construction, and audit/provenance for important operations.
- Every runtime architecture, data model, permission behavior, workflow behavior, agent behavior, GraphRAG behavior, or user-facing product surface requires an approved sub-spec before implementation.
- Every sub-spec must be followed by a committed sub-plan before implementation.
- Every repository-changing unit updates `CHANGELOG.md` under `[Unreleased]`.
- Every implementation unit uses atomic Conventional Commits.
- The README must only advertise commands and features that exist and have been verified.
- No secrets, real credentials, private endpoints, `.env`, signing keys, personal data, or production dumps may be committed.

---

## File Structure

This plan does not directly create runtime source files. It coordinates future phase files:

- `docs/superpowers/specs/`: approved design specs for each phase or module.
- `docs/superpowers/plans/`: implementation plans generated from approved specs.
- `docs/roadmap/mvp-status.md`: optional human-readable status tracker when Phase 1 starts.
- `CHANGELOG.md`: record each repository-changing unit.
- Phase-specific app, infra, test, and documentation files named by future sub-plans.

### Task 1: Establish Roadmap Tracking Discipline

**Files:**
- Create: `docs/roadmap/mvp-status.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-07-30-master-roadmap-design.md`
- Produces: `docs/roadmap/mvp-status.md` as the canonical human-readable project progress tracker.

- [ ] **Step 1: Create MVP status tracker**

Create `docs/roadmap/mvp-status.md`:

```markdown
<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# MVP Status

## Current Phase

Phase 1: Foundation

## Phase Status

| Phase | Status | Active Spec | Active Plan | Exit Decision |
| --- | --- | --- | --- | --- |
| Phase 1: Foundation | Not started | Not created | Not created | Not decided |
| Phase 2: Company Operating Core | Not started | Not created | Not created | Not decided |
| Phase 3: iPaaS and Workflow | Not started | Not created | Not created | Not decided |
| Phase 4: Digital Workforce | Not started | Not created | Not created | Not decided |
| Phase 5: GraphRAG | Not started | Not created | Not created | Not decided |
| Phase 6: Cross-Department Demo | Not started | Not created | Not created | Not decided |
| Phase 7: Hardening | Not started | Not created | Not created | Not decided |

## Latest Validation Evidence

- Repository audit: run before each handoff.
- Runtime validation: begins in Phase 1 after application scaffolding exists.

## Open Risks

- Runtime package manager is not selected.
- Monorepo tool is not selected.
- First UI shell is not implemented.
- Local infrastructure bootstrap is not implemented.
```

- [ ] **Step 2: Update changelog**

Add under `## [Unreleased]` / `### Added`:

```markdown
- Add the master MVP roadmap spec and plan for phase-gated delivery.
- Add the MVP status tracker for roadmap progress.
```

- [ ] **Step 3: Validate**

Run:

```bash
git diff --check
python3 /home/duy/Olympic/TraceGuard/.agents/skills/build-open-source-repository/scripts/audit_repo.py . --spdx-id Apache-2.0
```

Expected: both commands exit `0`.

- [ ] **Step 4: Commit**

Run:

```bash
git add docs/roadmap/mvp-status.md CHANGELOG.md
git diff --cached --stat
git diff --cached
git commit -m "docs(roadmap): add mvp status tracker"
```

Expected: one atomic commit with status tracker and changelog update.

### Task 2: Phase 1 Foundation Sub-Spec

**Files:**
- Create: `docs/superpowers/specs/2026-07-30-app-foundation-design.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: master roadmap spec and current repository foundation.
- Produces: approved Phase 1 design spec for app scaffold, local infrastructure, and validation baseline.

- [ ] **Step 1: Brainstorm Phase 1 scope**

Use `superpowers:brainstorming`. Present and get user approval for these choices:

```text
Recommended Phase 1 stack:
- Package manager: pnpm workspace.
- Frontend: Next.js App Router + TypeScript.
- Backend: Express + TypeScript.
- AI service: Python FastAPI shell.
- Database: PostgreSQL with pgvector extension target.
- Identity: Keycloak container.
- Workflow: Temporal container.
- Object storage: MinIO container.
- Validation: lint, typecheck, tests, repository audit.
```

Expected: user approves Phase 1 scope before writing the spec.

- [ ] **Step 2: Write Phase 1 spec**

Create `docs/superpowers/specs/2026-07-30-app-foundation-design.md` with sections:

```markdown
# App Foundation Design

## Purpose

## Scope

## Workspace Structure

## Frontend Shell

## Backend Shell

## AI Service Shell

## Local Infrastructure

## Configuration and Secrets Policy

## Validation Commands

## Exit Criteria
```

Fill each section with concrete decisions approved in Step 1.

- [ ] **Step 3: Update roadmap status and changelog**

Set Phase 1 row in `docs/roadmap/mvp-status.md`:

```markdown
| Phase 1: Foundation | In progress | `docs/superpowers/specs/2026-07-30-app-foundation-design.md` | Not created | Not decided |
```

Add changelog entry:

```markdown
- Add the Phase 1 app foundation design spec.
```

- [ ] **Step 4: Validate and commit**

Run:

```bash
git diff --check
python3 /home/duy/Olympic/TraceGuard/.agents/skills/build-open-source-repository/scripts/audit_repo.py . --spdx-id Apache-2.0
```

Then commit:

```bash
git add docs/superpowers/specs/2026-07-30-app-foundation-design.md docs/roadmap/mvp-status.md CHANGELOG.md
git commit -m "docs(spec): define app foundation"
```

Expected: one atomic commit containing the Phase 1 spec, roadmap status update, and changelog entry.

### Task 3: Phase 1 Foundation Sub-Plan

**Files:**
- Create: `docs/superpowers/plans/2026-07-30-app-foundation.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: approved Phase 1 app foundation spec.
- Produces: executable plan for scaffolding the application foundation.

- [ ] **Step 1: Write implementation plan**

Use `superpowers:writing-plans`. The Phase 1 plan must include these task groups:

```text
1. Workspace and package manager scaffold.
2. Frontend shell.
3. Backend shell.
4. AI service shell.
5. Docker Compose infrastructure.
6. Configuration examples.
7. Shared validation commands.
8. README development instructions.
9. Final audit and push decision.
```

Each task must contain exact files, commands, validation steps, and commit commands.

- [ ] **Step 2: Update roadmap status and changelog**

Set Phase 1 row in `docs/roadmap/mvp-status.md`:

```markdown
| Phase 1: Foundation | In progress | `docs/superpowers/specs/2026-07-30-app-foundation-design.md` | `docs/superpowers/plans/2026-07-30-app-foundation.md` | Not decided |
```

Add changelog entry:

```markdown
- Add the Phase 1 app foundation implementation plan.
```

- [ ] **Step 3: Validate and commit**

Run:

```bash
git diff --check
python3 /home/duy/Olympic/TraceGuard/.agents/skills/build-open-source-repository/scripts/audit_repo.py . --spdx-id Apache-2.0
```

Then commit:

```bash
git add docs/superpowers/plans/2026-07-30-app-foundation.md docs/roadmap/mvp-status.md CHANGELOG.md
git commit -m "docs(plan): add app foundation plan"
```

Expected: one atomic commit containing the Phase 1 plan, roadmap status update, and changelog entry.

### Task 4: Execute Phase 1 Foundation

**Files:**
- Modify: files named by `docs/superpowers/plans/2026-07-30-app-foundation.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Phase 1 app foundation plan.
- Produces: validated application foundation ready for Company Operating Core work.

- [ ] **Step 1: Execute the approved Phase 1 plan**

Use either:

```text
superpowers:subagent-driven-development
```

or:

```text
superpowers:executing-plans
```

Expected: every task in the Phase 1 plan is implemented, validated, and committed atomically.

- [ ] **Step 2: Run Phase 1 exit validation**

Run the commands defined in the Phase 1 plan. At minimum, Phase 1 must provide successful commands for:

```bash
git diff --check
python3 /home/duy/Olympic/TraceGuard/.agents/skills/build-open-source-repository/scripts/audit_repo.py . --spdx-id Apache-2.0
```

Expected: all Phase 1 validation commands exit `0`.

- [ ] **Step 3: Update roadmap status**

Set Phase 1 status to `Complete` only after validation evidence exists:

```markdown
| Phase 1: Foundation | Complete | `docs/superpowers/specs/2026-07-30-app-foundation-design.md` | `docs/superpowers/plans/2026-07-30-app-foundation.md` | Complete after validation |
```

Add validation evidence under `Latest Validation Evidence`.

- [ ] **Step 4: Commit status update**

Run:

```bash
git add docs/roadmap/mvp-status.md CHANGELOG.md
git commit -m "docs(roadmap): mark foundation phase complete"
```

Expected: one atomic commit recording Phase 1 completion.

### Task 5: Repeat Phase Gates for Phases 2 Through 7

**Files:**
- Create: future sub-specs in `docs/superpowers/specs/`
- Create: future sub-plans in `docs/superpowers/plans/`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `CHANGELOG.md`
- Modify: phase-specific runtime files named by future plans.

**Interfaces:**
- Consumes: completed previous phase.
- Produces: complete MVP demo after Phase 7.

- [ ] **Step 1: Phase 2 Company Operating Core**

Create and execute sub-specs and sub-plans for:

```text
- Company core data model.
- Organization graph projection.
- Audit event model.
- NovaCommerce organization seed.
```

Phase 2 exit checks:

```text
- Company isolation is enforced in backend tests.
- Core entities can be created, listed, and read through authorized API boundaries.
- Audit events record important mutations.
```

- [ ] **Step 2: Phase 3 iPaaS and Workflow**

Create and execute sub-specs and sub-plans for:

```text
- Workflow DSL and versioning.
- Temporal execution integration.
- Approval node behavior.
- Connector registry MVP.
```

Phase 3 exit checks:

```text
- A business event can start a workflow run.
- Workflow run state survives process restart where Temporal is responsible.
- Approval nodes pause and resume through authorized signals.
- Published workflow versions cannot be mutated in place.
```

- [ ] **Step 3: Phase 4 Digital Workforce**

Create and execute sub-specs and sub-plans for:

```text
- Digital Employee profile model.
- Skill Registry format and versioning.
- Agent Harness execution boundary.
- Tool permission contract.
```

Phase 4 exit checks:

```text
- Agents cannot access tools or memory outside their authorized scope.
- Agents do not share credentials.
- Agent runs produce audit events and evaluation metadata.
- Handoff records include source references and expected output.
```

- [ ] **Step 4: Phase 5 GraphRAG**

Create and execute sub-specs and sub-plans for:

```text
- Graph storage model.
- Document ingestion pipeline.
- Permission-aware retrieval pipeline.
- Citation and provenance contract.
```

Phase 5 exit checks:

```text
- Retrieval tests prove tenant and permission filtering happens before context generation.
- Important answers include source references.
- Operational graph records are derived from source-of-truth data.
- Permission leakage tests pass.
```

- [ ] **Step 5: Phase 6 Cross-Department Demo**

Create and execute sub-specs and sub-plans for:

```text
- NovaCommerce seed data.
- Lead-to-Cash workflow demo.
- Complaint-to-Resolution workflow demo.
- Hire-to-Onboard workflow demo.
- Mission Control MVP UI.
```

Phase 6 exit checks:

```text
- Demo can be reset and rerun deterministically.
- The 14-step MVP acceptance chain can be shown end to end.
- Human approval is visible and enforceable.
- Mission Control and Audit Explorer show the relevant process state.
```

- [ ] **Step 6: Phase 7 Hardening**

Create and execute sub-specs and sub-plans for:

```text
- MVP hardening test matrix.
- Observability baseline.
- Demo verification checklist.
```

Phase 7 exit checks:

```text
- Full validation suite passes from a clean checkout.
- Permission leakage tests pass with zero leakage.
- Demo install and reset instructions are accurate.
- Changelog accounts for every committed unit.
```

### Task 6: MVP Completion Decision

**Files:**
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `CHANGELOG.md`
- Modify: release or demo docs named by Phase 7 plan.

**Interfaces:**
- Consumes: completed Phase 7.
- Produces: final MVP demo readiness decision.

- [ ] **Step 1: Verify MVP acceptance chain**

Run the final demo verification checklist created in Phase 7. It must prove all 14 target outcome steps from `docs/superpowers/specs/2026-07-30-master-roadmap-design.md`.

Expected: every checklist item passes with recorded evidence.

- [ ] **Step 2: Update roadmap status**

Set all phase rows in `docs/roadmap/mvp-status.md` to `Complete` and record the final validation command outputs under `Latest Validation Evidence`.

- [ ] **Step 3: Commit MVP readiness docs**

Run:

```bash
git add docs/roadmap/mvp-status.md CHANGELOG.md
git commit -m "docs(roadmap): record mvp demo readiness"
```

Expected: one atomic commit recording MVP demo readiness.

## Self-Review

Spec coverage:

- Target outcome is covered by Task 6.
- Phase-gated execution is covered by Tasks 1 through 5.
- Sub-spec and sub-plan rules are covered by Tasks 2, 3, and 5.
- Tracking rules are covered by Task 1 and per-phase status updates.
- Guardrail gates are copied into Global Constraints and enforced before each future phase.
- Documentation and validation gates are included in every task.

Completeness scan:

- No unresolved implementation details are hidden inside this master plan. Runtime implementation details are intentionally delegated to approved future sub-specs and sub-plans.

Type consistency:

- This plan defines documentation and coordination interfaces only. Runtime interfaces will be defined in phase sub-plans.

Scope:

- This plan ends at MVP demo readiness and does not include public 1.0 release work.
