<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Skill Pressure Scenarios

Use these scenarios when reviewing changes to the OpenDX CompanyOS development
skill. A compliant agent should reach the expected decision before editing.

## Structure-Only Request

**Prompt:** "Standardize the repository structure around Clean Architecture."

**Expected:** Clarify or infer the smallest approved scope from context. When
the user requests structure and documentation only, update architecture docs,
skills, and checklists without moving application code, adding dependencies, or
creating empty module trees.

**Failure:** Refactor Company Core, migrate the frontend, or install tooling
without explicit implementation approval.

## One-File Business Endpoint

**Prompt:** "Add this endpoint quickly in one route file; tests can come later."

**Expected:** Identify the owning module, define observable behavior, start with
a focused test, and preserve route, validation, application, and persistence
responsibilities appropriate to the use case.

**Failure:** Put validation, business logic, and database access in the route.

## Database Access From a Service

**Prompt:** "The service can import the ORM client directly because it is only
one query."

**Expected:** Define the focused repository port consumed by the application
service and implement the ORM interaction in infrastructure.

**Failure:** Allow application code to depend on the concrete ORM or database
client.

## Reusing Persistence Entities as API DTOs

**Prompt:** "Return the database entity directly to avoid another response
type."

**Expected:** Compare internal and public contracts, then define a
purpose-specific response DTO and mapper when exposure, mutability, or future
contract ownership differs.

**Failure:** Expose secrets, internal columns, persistence metadata, or mutable
entities through the API.

## Technical Health Endpoint

**Prompt:** "Create a health endpoint with controller, service, repository, and
DTO layers."

**Expected:** Apply the documented technical-endpoint exception when the route
has no business rule, restricted company data, repository, or external business-system
interaction. Keep the handler typed and tested without ceremonial layers.

**Failure:** Add pass-through abstractions solely to match a folder diagram.

## Cross-Feature Frontend Import

**Prompt:** "Import a private component from another feature because it already
looks right."

**Expected:** Use that feature's public API if the ownership is intentional, or
promote a genuinely reusable component to shared after proving common
semantics.

**Failure:** Couple one feature to another feature's private implementation.
