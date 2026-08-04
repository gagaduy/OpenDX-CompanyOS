<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Clean Architecture Repository Structure Plan

**Goal:** Standardize repository structure guidance for future Express,
React, and Python work without changing application code or creating empty
module scaffolds.

**Scope:** Documentation, agent instructions, and review checklists only.

## Constraints

- Preserve all existing runtime behavior and tests.
- Do not move or create application source files.
- Do not install, remove, or update dependencies.
- Do not change package manifests, lockfiles, CI, Docker, or API contracts.
- Do not create empty directories, `.gitkeep` files, placeholder classes, or
  speculative modules.
- A later code refactor requires its own approved spec and plan.

## Task 1: Correct the Architecture Scope

**Files:**

- Modify:
  `docs/superpowers/specs/2026-08-04-clean-architecture-foundation-design.md`
- Modify:
  `docs/superpowers/plans/2026-08-04-clean-architecture-foundation.md`

- [x] State that this unit documents structure and conventions only.
- [x] Separate target architecture from current implementation state.
- [x] Remove code migration, dependency, framework, and tooling work from this
  plan.
- [x] Require separately approved specs before implementation refactors.

## Task 2: Publish Normative Architecture Guidance

**Files:**

- Create: `docs/architecture/clean-architecture.md`
- Create: `docs/architecture/dependency-rules.md`

- [x] Document feature ownership and inward dependency direction.
- [x] Document Express, React, and Python target layouts.
- [x] Define layer responsibilities and technical-endpoint exceptions.
- [x] Define public module APIs and cross-feature import rules.
- [x] Make clear that target trees must not be materialized while empty.

## Task 3: Publish Development Conventions

**Files:**

- Create: `docs/development/coding-conventions.md`
- Create: `docs/development/testing-strategy.md`
- Modify: `docs/project-structure.md`

- [x] Document DTO, mapper, validation, dependency injection, naming, and
  configuration conventions.
- [x] Document proportional unit, contract, integration, API, and frontend test
  responsibilities.
- [x] Show current repository structure separately from future module layouts.
- [x] Keep current framework descriptions accurate.

## Task 4: Align Agent Guidance and Review Gates

**Files:**

- Modify: `AGENTS.md`
- Modify: `.agents/README.md`
- Modify: `.agents/skills/opendx-companyos-development/SKILL.md`
- Create:
  `.agents/skills/opendx-companyos-development/tests/pressure-scenarios.md`
- Create: `.agents/checklists/clean-architecture-review.md`
- Modify: `CHANGELOG.md`

- [x] Require agents to identify the owning module before implementation.
- [x] Require a focused spec and plan before moving existing code.
- [x] Encode dependency, DTO, validation, testing, and no-empty-scaffold rules.
- [x] Add the Clean Architecture checklist to the agent workspace index.
- [x] Add pressure scenarios that distinguish structure documentation from code
  migration.
- [x] Record this documentation foundation under `[Unreleased]`.

## Task 5: Verify Documentation Integrity

- [x] Confirm the worktree contains no package, lockfile, runtime source, CI, or
  Docker changes.
- [x] Run `git diff --check`.
- [x] Run `pnpm audit:repo`.
- [x] Check local Markdown links referenced by modified guidance.
- [x] Inspect the final diff for implementation code or empty scaffolding.

## Completion

Commit the corrected documentation unit atomically:

```bash
git add AGENTS.md CHANGELOG.md .agents docs
git commit -m "docs(architecture): standardize clean architecture guidance"
```

Do not begin backend, frontend, or Python migration after this commit. Wait for
the user to start that implementation work explicitly.
