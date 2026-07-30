<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Product Vision

## Product Statement

OpenDX CompanyOS is an open-source platform that helps businesses model their organization, data, workflows, human employees, and digital employees in one governed operating system.

## Core Formula

```text
Company Blueprint
+ Organization Graph
+ Human Employees
+ Digital Employees
+ Skills
+ iPaaS
+ Workflow Engine
+ SSO
+ Policy Engine
+ GraphRAG
+ Shared Memory
+ Mission Control
= OpenDX CompanyOS
```

## Product Positioning

OpenDX CompanyOS is the operating layer above business data, applications, workflows, and AI agents.

It is not a chatbot, a simple agent builder, a RAG-only document Q&A tool, a generic n8n clone, a full ERP, a full CRM, a full HRM, or an autonomous company that removes human accountability.

## Design Principles

- Company-first.
- Human-governed.
- Process-driven.
- Identity-aware.
- Permission-aware.
- Graph-grounded.
- Model-agnostic.
- Open and extensible.
- Auditable by default.

## MVP Scope

The MVP must include Company Core, Identity, Workflow and iPaaS, Agent Runtime, GraphRAG, Mission Control, and NovaCommerce demo data.

## MVP Non-Goals

The MVP will not build full ERP, payroll, accounting, Salesforce-class CRM, Workday-class HRM, mobile apps, Kubernetes, broad connector marketplace, or uncontrolled agent self-creation.

## Acceptance Chain

1. User logs in through SSO.
2. System resolves company, department, and role.
3. Business event triggers a workflow.
4. Workflow assigns work to a Digital Employee.
5. Agent uses an authorized skill and data scope.
6. GraphRAG provides cited context.
7. Agent calls connectors only through Tool Registry.
8. Policy Engine detects approval requirements.
9. Workflow waits for the correct approver.
10. Approval resumes the workflow.
11. Business data is updated.
12. Graph and memory are updated.
13. Mission Control shows status.
14. Audit Log records the process.
