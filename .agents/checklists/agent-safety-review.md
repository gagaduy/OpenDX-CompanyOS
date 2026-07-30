<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Agent Safety Review

Use this checklist before shipping agent runtime, Digital Employee, Skill, Tool Registry, Workflow Agent Node, GraphRAG, approval, or policy changes.

- Agent identity is distinct from human identity and from other agents.
- Agent actions go through Tool Registry and permission checks.
- Agents cannot read, write, or expose credentials directly.
- ALLOW, REQUIRE_APPROVAL, and DENY paths are represented explicitly.
- Risky financial, legal, production, publishing, discount, or permission-changing actions require human approval.
- GraphRAG retrieval filters by tenant and permission before LLM context construction.
- Outputs that rely on documents or graph data include provenance.
- Audit records include actor, action, resource, tool call, decision, approval state, retry, and error where relevant.
- Tests cover at least one denied action and one approval-required action when permission behavior changes.
