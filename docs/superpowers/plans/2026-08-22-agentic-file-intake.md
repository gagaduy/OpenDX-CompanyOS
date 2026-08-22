<!-- SPDX-License-Identifier: Apache-2.0 -->

# Agentic CSV/TXT File Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely turn an approved private CSV or TXT upload into one auditable Agentic intake task.

**Architecture:** The Agentic API owns an immutable file/preview lifecycle and uses inward-facing storage and malware-scan ports. MinIO and ClamAV remain infrastructure adapters; parsing is bounded deterministic TypeScript. Approval atomically binds one preview digest to one new `draft` Agentic task without Agent execution.

**Tech Stack:** TypeScript, Express, multer 2.2.0, PostgreSQL migrations, MinIO, ClamAV, Vitest, Docker Compose.

---

## File structure

- Create `apps/api/src/modules/agentic/domain/entities/agentic-file.ts` — lifecycle entities and DTOs.
- Create `apps/api/src/modules/agentic/domain/services/agentic-file-rules.ts` — closed type/limit/transition rules.
- Create `apps/api/src/modules/agentic/application/{storage,security,parsing}/agentic-file-*.ts` — ports.
- Create `apps/api/src/modules/agentic/application/services/implementations/agentic-file.service.ts` — orchestration.
- Create `apps/api/src/modules/agentic/infrastructure/{storage,security,parsing}/` adapters.
- Modify Agentic repository, module, routes, validators, controller, server wiring, migrations and docs.

### Task 1: Domain lifecycle and bounded parser contract

**Files:** create entities/rules plus `*.test.ts` beside them.

- [ ] Write failing tests for CSV/TXT-only MIME/signature agreement, 2 MiB size, UTF-8/no-NUL, 10,000 rows, 64 columns, 16 KiB cell/line, and the only valid lifecycle transitions.
- [ ] Run `pnpm --filter @opendx/api test -- agentic-file-rules` and confirm failure.
- [ ] Implement `AgenticIntakeFile`, `AgenticFilePreview`, `AgenticFileStatus`, constants, and pure rules. Use `uploaded -> scanning -> clean -> previewed -> approved|rejected -> deleted`; reject all other transitions.
- [ ] Re-run the focused tests; commit `feat(agentic): define file intake lifecycle`.

### Task 2: PostgreSQL persistence and migration guards

**Files:** modify `apps/api/src/modules/agentic/infrastructure/database/migrations/`, repository interface/implementation, integration tests.

- [ ] Write migration integration tests asserting immutable file metadata, guarded versions, unique `(file_id, preview_version)`, one task per approved file, no delete, and audit/provenance rows.
- [ ] Add one numbered Agentic migration for `agentic_intake_files`, `agentic_file_previews`, and approval/task binding. Store opaque key, SHA-256 source/preview digests, parser version, status/timestamps; do not store raw content.
- [ ] Add repository methods for create/find/claim/settle scan, append/find preview, and atomic approval task creation.
- [ ] Run the migration and repository integration tests; commit `feat(agentic): persist file intake lifecycle`.

### Task 3: Private storage, scanner, and parser adapters

**Files:** create ports/adapters/tests; modify `agentic.module.ts` and `server.ts`.

- [ ] Write adapter tests: MinIO writes/opens/deletes only `agentic-intake/<uuid>` keys; ClamAV clean/infected/unavailable/timeout responses; parser returns bounded CSV headers/rows/errors and TXT lines without evaluating content.
- [ ] Implement `AgenticFileStorage`, `AgenticFileScanner`, and `AgenticFileParser` ports. Reuse MinIO/ClamAV clients but not Support modules. Scanner uncertainty is rejection. Parser reads validated UTF-8 bytes, treats formulas/URLs/instructions as strings, caps preview at 256 KiB and samples at 50/100.
- [ ] Wire private bucket and timeout/retention environment values through `server.ts` readiness without public URLs or client credentials.
- [ ] Run focused unit/integration tests; commit `feat(agentic): add safe file intake adapters`.

### Task 4: Application service, preview, and approval

**Files:** create service/interface/tests; modify Agentic repository and task service only through public contracts.

- [ ] Write failing service tests for orphan-storage compensation, scan race, malformed/infected rejection, preview digest stability, approval replay, concurrent approval, and stale version/digest rejection.
- [ ] Implement upload metadata reservation, private write, scan/parse claim, immutable preview, reject/delete, and `approvePreview`. Approval must use a transaction to create exactly one `draft` task with file/preview provenance; it creates no subtask and never invokes runtime/model/tool ports.
- [ ] Return aggregate preview DTOs only: counts, bounded samples, source references and digests; never raw quarantined file bytes.
- [ ] Run focused service tests; commit `feat(agentic): approve bounded file previews`.

### Task 5: Staff transport and authorization

**Files:** modify `presentation/routes/agentic.routes.ts`, controller, validator, API tests and API docs.

- [ ] Write failing route tests for multipart one-file/2 MiB enforcement, role denial, unknown fields, private metadata/preview responses, duplicate idempotency key, and approve/reject/delete version checks.
- [ ] Add `/v1/admin/agentic/files` endpoints: `POST /`, `GET /:fileId`, `GET /:fileId/preview`, `POST /:fileId/approve`, `POST /:fileId/reject`, `POST /:fileId/delete`. Require governance admin/administrator in backend guards.
- [ ] Use `multer.memoryStorage()` with the exact 2 MiB limit, accept only field `file`, and pass normalized metadata to the service. Do not add download/content endpoints.
- [ ] Update `docs/api/agentic.md`, `docs/build-from-source.md`, `.env.example`, and `CHANGELOG.md`; run API tests and commit `feat(agentic): expose governed file intake`.

### Task 6: Worker, retention, and Phase E acceptance gate

**Files:** create worker/acceptance script/tests; modify Compose/server lifecycle and roadmap only after passing evidence.

- [ ] Write deterministic tests for scan/parse worker restart, seven-day rejected and 30-day terminal object tombstones, hostile CSV/TXT, and private MinIO access.
- [ ] Add a bounded Agentic file lifecycle worker, start/stop it in the API composition root, and add a `pnpm check:agentic-phase-e-exit` gate that uploads clean CSV/TXT then approves exactly one task; it must also prove unsupported/oversized/invalid/infected/scanner-unavailable rejection.
- [ ] Run focused API/PostgreSQL/MinIO/ClamAV tests, `pnpm check:agentic-phase-e-exit`, `pnpm check`, `git diff --check`, and `pnpm audit:repo`.
- [ ] Record fresh evidence in roadmap and commit `docs(agentic): close phase e file intake` only after all gates pass.

## Plan self-review

The tasks cover every spec boundary: CSV/TXT limits, private storage, fail-closed scanning, immutable preview/provenance, approval-to-one-task, no Phase F/G behavior, transport authorization, retention, and deterministic exit evidence. No dependency is added; parser behavior is implemented with existing TypeScript facilities. Each task has a focused failing test, validation command, and atomic commit boundary.
