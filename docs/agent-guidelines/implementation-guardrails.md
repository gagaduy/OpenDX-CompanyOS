<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Implementation Guardrails

AI coding agents working on OpenDX CompanyOS must follow these rules:

1. Do not turn the project into a chatbot with multiple personas.
2. Do not put business logic only in prompts.
3. Do not give agents direct database access through shared credentials.
4. Do not let agents decide their own permissions.
5. Do not let GraphRAG bypass actor, department, role, resource, or data-classification filters.
6. Do not use an LLM for calculations that deterministic code can perform.
7. Do not use an LLM to create operational relationships without authoritative sources.
8. Do not store secrets in source code, prompts, workflow JSON, or docs.
9. Do not mutate production workflows without versioning.
10. Do not rely on frontend-only authorization.
11. Do not automate risky financial or legal actions without human approval.
12. Do not build every department at equal depth in the MVP.
13. Do not add technology only to make the architecture look more complex.
14. Every meaningful feature must serve at least one cross-department demo.
15. Every important result must include audit and provenance.
