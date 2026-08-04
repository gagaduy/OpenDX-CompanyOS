<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# System Baseline

## Functional Layers

OpenDX CompanyOS has six functional layers:

- Experience Layer.
- Identity Plane.
- Company Operating Core.
- iPaaS and Workflow Engine.
- Agent Runtime.
- Company Graph and GraphRAG.

## MVP Deployment

- Frontend: React + TypeScript with Vite.
- Backend: Express + TypeScript modular monolith.
- Durable workflow: Temporal.
- Identity provider: Keycloak.
- Operational database: PostgreSQL.
- Vector search: pgvector.
- Graph storage: PostgreSQL graph projection tables.
- Object storage: MinIO.
- AI service: Python.
- Observability: structured logs, OpenTelemetry, metrics.
- Deployment: Docker Compose.

## Single-Company Boundary

One deployment operates one configured company. The Company Operating Core
does not use Company IDs, company selectors, multi-company repositories, or
tenant-scoped routes. Identity and policy checks still restrict access by
department, role, resource, action, data classification, workflow context, and
risk level.

## Backend Modules

- Company.
- Organization.
- Identity adapter.
- Workflow.
- Agent.
- Skill.
- Policy.
- Approval.
- Graph.
- Integration.
- Audit.

## Core Entity Families

- Company, Department, Position, User, HumanEmployee, DigitalEmployee.
- Role, Permission, Policy.
- Goal, KPI, Task, Decision.
- SkillDefinition, SkillVersion.
- AgentRun, AgentHandoff, ToolDefinition, ToolCall.
- WorkflowDefinition, WorkflowVersion, WorkflowRun, WorkflowNodeRun.
- ConnectorDefinition, ConnectorConnection, CredentialReference.
- BusinessEvent, ApprovalRequest, AuditEvent, Notification.
- Document, DocumentChunk, KnowledgeEntity, KnowledgeRelationship, GraphSource, MemoryEntry.

## Durable Workflow Boundary

Temporal owns durable state, retry, timers, signals, and resume after crash. OpenDX owns the workflow DSL, node model, connector registry, agent node, skill node, approval node, company event integration, and permission enforcement.

## GraphRAG Boundary

Operational graph is a projection of source-of-truth database records. Semantic graph is extracted from authorized documents and events with provenance. Retrieval must apply permission filters before context reaches an LLM.
