<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Agent Governance API

Phase A exposes staff-only governance endpoints below `/v1/admin/agentic`.
All requests require a Keycloak staff bearer token; authorization and ownership
are enforced by the API, not only by the Console. Service-account credentials
are a separate identity domain and never grant access to these staff routes.

| Area | Routes | Roles |
| --- | --- | --- |
| Tasks | `POST/GET /tasks`, `GET/PATCH /tasks/:id`, `POST /tasks/:id/ready`, `POST /tasks/:id/cancel` | Operator owns task content; Administrator/Governance Admin oversight; Approver sees approval-bound tasks |
| Approvals | `GET /approvals`, `GET /approvals/:id`, `POST /approvals/:id/decision` | requester-scoped reads or Approver/Administrator decision within the recorded approver scope |
| Employees | `GET /employees`, `GET /employees/:agentKind` | all Agentic roles and Administrator |
| Configuration | create/update/submit/diff/decision under `/configuration-revisions` | Governance Admin drafts; a different Governance Admin or Administrator activates/rejects after inspecting the exact payload diff |
| Revocation | `POST /revocations` | Administrator immediate; Governance Admin with a different-human approval |
| Evidence | filtered `GET /audit` | Auditor, Governance Admin, Administrator; Auditor and Governance Admin receive explicit purpose-specific resource allow-lists, while Administrator may inspect all Agentic audit resources |

Inputs are strict and reject unknown fields. Tasks only have `draft`, `ready`,
and `canceled` states. Moving a task to `ready` pins the currently active
configuration revision. Configuration revisions move through `draft`,
`pending_approval`, `active`, `rejected`, and `superseded`; a creator cannot
decide their own revision or approval request.

The fixed workforce identities are `agent-ai-ceo`, `agent-catalog`,
`agent-inventory`, `agent-order`, `agent-finance`, `agent-crm`, and
`agent-support`. They are confidential Keycloak service clients with service
accounts enabled and interactive login disabled. Their secrets belong in the
deployment secret store or local untracked environment only; they must not be
committed, persisted in PostgreSQL, or copied into audit/provenance metadata.

Phase A does not execute tasks, call OpenRouter, start Temporal, expose a generic
SQL tool, ingest files, provide an Agentic Console UI, or read/mutate Commerce
through an Agent. Tool and model records are inert governance configuration for
later focused phases.
