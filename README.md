<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# OpenDX CompanyOS

OpenDX CompanyOS is an open-source Company-first operating platform for modeling and running a digital company.

## Status

OpenDX CompanyOS is in early foundation work. Runtime application code is being scaffolded after the repository, product, architecture, and design constraints are committed.

## What It Is

OpenDX CompanyOS models a company, its organization, people, digital employees, workflows, policies, business data, knowledge graph, integrations, approvals, and audit trail in one operating layer.

AI agents are represented as Digital Employees inside the company. They are governed by role, skill, tools, data scope, permissions, policies, and human approval.

## What It Is Not

- Not a chatbot product.
- Not a generic agent persona playground.
- Not a workflow builder without durable execution and governance.
- Not a full ERP, CRM, HRM, payroll, or accounting suite.
- Not a system that lets AI perform risky financial or legal actions without human approval.

## MVP Direction

The MVP is organized around:

- Company Core.
- Identity and RBAC.
- Workflow and iPaaS.
- Agent Runtime.
- GraphRAG.
- Mission Control.
- NovaCommerce cross-department demo data.

## Architecture

See:

- `docs/product/vision.md`
- `docs/architecture/system-baseline.md`
- `docs/architecture/mvp-phases.md`
- `docs/design/linear-product-canvas.md`
- `docs/agent-guidelines/implementation-guardrails.md`

## Development

Application setup commands will be added when the runtime workspace is scaffolded.

## Contributing

See `CONTRIBUTING.md`.

## Security

Do not open public issues for vulnerabilities. See `SECURITY.md`.

## License

Apache-2.0. See `LICENSE`.
