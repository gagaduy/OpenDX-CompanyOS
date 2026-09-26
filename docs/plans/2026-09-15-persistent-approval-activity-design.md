<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Persistent Approval Activity Design

## Goal

Show every successful approval or cancellation from the four AI Command Center departments in the real-time activity feed immediately, and restore the same events from PostgreSQL after a browser refresh.

## Chosen Approach

Use an append-only backend activity record owned by the Agentic Command Center boundary. React state remains an immediate presentation cache, while PostgreSQL is the durable source of truth. Browser storage is not used.

The API accepts only a constrained decision command after the corresponding domain action succeeds. It derives actor identity and occurrence time from the authenticated request and server clock. The client cannot supply arbitrary display titles, actors, timestamps, or outcomes. A unique idempotency key prevents duplicate events when a response is retried.

## Data Contract

Each persisted event contains:

- server-generated event ID and timestamp;
- authenticated staff actor ID;
- department: `marketing`, `merchandising`, `operations`, or `support`;
- decision: `approved` or `canceled`;
- bounded resource type and resource ID;
- a validated resource summary copied from the actual proposal or task;
- a client-generated idempotency key scoped to the decision and resource.

The database table is append-only. Update and delete operations are rejected. The API returns purpose-specific DTOs and supports a bounded recent-event list ordered newest first.

## Backend Flow

1. The existing department API completes the approval or cancellation.
2. The Console submits the resulting decision event to the authenticated Agentic activity endpoint.
3. The application service validates the department, decision, resource kind, summary length, and idempotency key.
4. The repository appends the event or returns the existing event for an idempotent retry.
5. The API returns the server-authored event DTO.

The event endpoint does not perform or replace the risky business action. It records only a successfully completed human decision. If event persistence fails after the business action succeeds, the Console reports that activity synchronization failed and refreshes the durable feed; it does not roll back or repeat the business action.

## Frontend Flow

The Command Center loads recent decision events on mount and during its existing refresh cycle. Returned events are mapped into `LiveEventItem` using department and decision enums:

- approved → success node and “đã phê duyệt” title;
- canceled → error node and “đã hủy duyệt” title.

After an approval or cancellation succeeds, the returned persisted event is inserted immediately into the current feed. Hydration deduplicates by backend event ID, sorts by server timestamp, and merges with existing task and completion events. “Xem kết quả” is shown only when the referenced resource still has a supported preview.

## Error Handling and Governance

- Authentication and approval permissions are enforced by the API.
- Invalid departments, decisions, resource types, summaries, and idempotency keys fail validation.
- Duplicate submissions return the existing record without creating another timeline row.
- No customer email body, credential, token, or unrestricted proposal payload is stored in the event.
- Approval and cancellation events remain visible across refreshes and sessions because they are loaded from PostgreSQL.

## Test Strategy

- Migration integration test: append-only table, constraints, ordering, and unique idempotency.
- Repository/application tests: actor and server timestamp ownership, validation, idempotent retry, and bounded listing.
- API tests: authenticated create/list and denied access.
- Console tests: approved and canceled events appear immediately, are deduplicated, and reappear when the component mounts with persisted API data.
- Existing department approval tests remain green to ensure the activity record never changes the underlying business decision.

