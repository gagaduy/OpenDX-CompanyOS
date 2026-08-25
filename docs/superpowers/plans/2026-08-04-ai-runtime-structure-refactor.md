<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# AI Runtime Structure Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing FastAPI health behavior into an explicit
application factory and shared technical-health package without creating empty
business modules or changing the health contract.

**Architecture:** `create_app.py` is the composition root, `main.py` exports the
ASGI app, and `shared/health` owns the reduced technical route and response
schema. No service or repository layer is introduced because health has no
business rule or persistence.

**Tech Stack:** Python 3.13, FastAPI, Pydantic, pytest, uv.

## Global Constraints

- Preserve `GET /health` status and response exactly.
- Add no Python dependency and no business behavior.
- Use complete type hints.
- Do not create `app/modules` until an approved Python business feature exists.
- Keep tests under the owning shared health package.
- Update `[Unreleased]` in the same commit.

---

### Task 1: Characterize and Move Health Composition

**Files:**
- Create: `services/ai-runtime/app/create_app.py`
- Create: `services/ai-runtime/app/shared/__init__.py`
- Create: `services/ai-runtime/app/shared/health/__init__.py`
- Create: `services/ai-runtime/app/shared/health/router.py`
- Create: `services/ai-runtime/app/shared/health/schemas.py`
- Create: `services/ai-runtime/tests/shared/health/test_health_api.py`
- Modify: `services/ai-runtime/app/main.py`
- Delete: `services/ai-runtime/tests/test_health.py`

**Interfaces:**

```python
def create_app() -> FastAPI: ...

class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: Literal["opendx-ai-runtime"]
```

- [ ] Copy the existing health assertions to the target test path and import
  `create_app`; confirm failure because the factory does not exist.
- [ ] Implement `HealthResponse` and a router returning the exact current JSON.
- [ ] Implement `create_app()` and include the health router.
- [ ] Reduce `main.py` to `app = create_app()`.
- [ ] Remove the old test after the new test passes.
- [ ] Run pytest through the documented project environment.
- [ ] Commit with `refactor(ai-runtime): isolate health composition`.

### Task 2: Verify Python Structure and Docs

**Files:**
- Modify: `docs/project-structure.md`
- Modify: `docs/build-from-source.md` only if commands are inaccurate.
- Modify: `CHANGELOG.md`

- [ ] Confirm no empty `app/modules` directory exists.
- [ ] Confirm router imports no repository, database, connector, or business
  module.
- [ ] Run the AI runtime pytest command.
- [ ] Run `git diff --check` and `pnpm audit:repo`.
- [ ] Update structure documentation to match the implemented Python tree.
- [ ] Commit with `docs(ai-runtime): record health structure`.
