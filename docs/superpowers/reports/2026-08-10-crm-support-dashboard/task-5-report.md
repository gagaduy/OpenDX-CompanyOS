<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Task 5 Report: Support Ticket Operations and SLA Escalation

Implemented Support ticket service, PostgreSQL repository, staff API routes,
and bounded lifecycle worker. The module consumes only public Customer and
Order reader contracts. Application and route authorization restrict queue and
workflow operations to Support/Administrator and CRM reads to creator-owned
tickets. PostgreSQL updates use optimistic versions, event idempotency keys,
stable chronological event reads, and `FOR UPDATE SKIP LOCKED` escalation
claims capped at 100 tickets per tick.

## Follow-up verification

- PostgreSQL integration now proves concurrent self-claim has one winner,
  duplicate event-key convergence, stale-version loss, `(occurred_at,id)`
  history ordering, per-ticket idempotency key scope, closed-ticket message
  rejection, and exactly-once automatic SLA escalation with `FOR UPDATE SKIP
  LOCKED`.
- The SLA worker uses the deterministic effective breach instant in its event
  key and claims no more than 100 rows per tick.
- HTTP integration covers list, create, detail, claim, transition, and message
  routes, staff authentication, role boundaries, ownership, invalid inputs,
  stable errors, administrator reassignment, and a real route-to-service-to-
  PostgreSQL workflow.
- Service tests cover CRM queue denial, Support owned-or-available access,
  stable `ORDER_NOT_OWNED_BY_CUSTOMER`, closed-ticket message denial, duplicate
  transition convergence after row locking, and administrator reassignment.
- Focused Support worker/service/PostgreSQL/API tests and API typecheck pass;
  `pnpm check` was intentionally not run under the Task 5 constraint.
