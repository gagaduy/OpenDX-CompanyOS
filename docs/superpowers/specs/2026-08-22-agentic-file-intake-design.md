<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Agentic File Intake Design

## Status

Approved by the user on 2026-08-22. This focused Phase E design covers CSV and
TXT only. DOCX, XLSX, and PDF remain deferred to separately approved parser
adapters. The implementation plan will be
`docs/superpowers/plans/2026-08-22-agentic-file-intake.md`.

## Purpose and Boundary

File intake turns an administrator-uploaded CSV or TXT document into a safe,
auditable Company task source. It is not chat-with-file, an Agent execution
path, a bulk Commerce mutation, or a Console workspace. After an unchanged
preview is approved, the system creates exactly one immutable Agentic intake
task. Phase F may later decompose that task; Phase E creates no subtasks, calls
no model, and executes no tool.

## Architecture

```text
staff multipart upload
 -> Agentic API validation
 -> private MinIO quarantine object + immutable metadata
 -> ClamAV scan (fail closed)
 -> bounded CSV/TXT parser
 -> versioned preview + source provenance + audit
 -> staff approval bound to preview digest
 -> exactly one ready intake task
```

The Agentic module owns its entities, repositories, lifecycle service, and
staff API. It may reuse MinIO and ClamAV through new Agentic ports/adapters
based on the established Support patterns, but never imports Support internals.
The existing `multer@2.2.0`, MinIO client, and ClamAV service are reused; CSV
and TXT parsing use bounded in-process TypeScript with no parser dependency.

## File Rules

Only `text/csv` and `text/plain` are accepted. Both require valid UTF-8 without
NUL bytes; CSV additionally requires a non-empty first record and RFC 4180
quoting. Filename extension is display metadata only. The declared MIME type,
bounded byte inspection, and parser result must agree. ZIP signatures, PDF,
OLE, executable signatures, unsupported binary bytes, encrypted content, and
invalid UTF-8 are rejected.

The initial limits are: 2 MiB per file; 10,000 CSV rows; 64 columns; 16 KiB per
cell or TXT line; 256 KiB total retained preview text; 100 invalid-row samples;
50 source samples; and five seconds parse/scan work per file. CSV formulas,
URLs, scripts, and instruction-like text remain inert strings and are never
followed, evaluated, or supplied to a model. A ClamAV timeout, unavailable
scanner, uncertain result, or malware finding transitions the file to rejected.

Objects use opaque `agentic-intake/<file-id>` keys in a private quarantine
bucket. They have no public URL or browser credential. Clean source objects are
retained for 30 days after approval/rejection; rejected objects are retained for
seven days; deletion creates an immutable metadata tombstone and preserves audit
and provenance digests.

## Lifecycle and Preview

`uploaded -> scanning -> clean -> previewed -> approved | rejected -> deleted`
is append-only in intent and transition-guarded in PostgreSQL. Upload writes
metadata and audit before work is claimable. Scan and parse workers claim by
compare-and-swap; repeats replay the same state. Storage/database compensation
deletes an orphaned object, never an established metadata record.

`BulkPlanPreview` is immutable and contains its version, parser version,
payload digest, format, valid/invalid counts, at most 100 validation errors,
bounded source references (`fileId`, `line`, optional `column`), and the source
digest. CSV preview contains headers and bounded row samples; TXT preview
contains bounded line samples. It contains no generated task plan, department
assignment, subtask, model output, or executable content.

Approval accepts `fileId`, `expectedFileVersion`, `previewVersion`,
`previewPayloadDigest`, and an idempotency key. It rejects stale, changed,
unclean, rejected, deleted, or previously decided previews. A successful first
approval creates exactly one `agentic_tasks` intake task with immutable file and
preview provenance, then emits audit/provenance records atomically. Replay
returns that same task. Preview/parser/file/policy changes invalidate approval.

## Authorization and API

Only `agentic_governance_admin` or `administrator` may upload, inspect a
preview, approve, reject, or request deletion. Transport validates multipart
field names and one file, applies the 2 MiB limit before buffering, and never
returns raw quarantined content. Endpoints are staff-only under
`/v1/admin/agentic/files`: upload, metadata, preview, approve, reject, and
delete. Backend authorization, ownership, audit, and version checks apply to
every endpoint; the future Console is not a security boundary.

## Failure, Testing, and Exit

Tests must cover MIME/signature disagreement, size/row/column/cell limits,
UTF-8/NUL failures, CSV quote failures, hostile instruction text, ClamAV
unavailable/infected/timeout, scan races, parser timeout, duplicate upload,
preview digest/version mismatch, concurrent approval, task idempotency, MinIO
compensation, private-object access, retention tombstones, and audit/provenance
completeness. The Phase E exit gate proves a staff administrator can upload
clean CSV and TXT, receive a bounded source-linked preview, approve it once into
one task, and observe fail-closed deterministic rejection for invalid inputs.
