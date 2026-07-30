<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Agent Workspace

`.agents` contains repository-local guidance for AI coding agents. Product specs, architecture notes, implementation plans, and roadmap documents stay in `docs/`.

## Layout

```text
.agents/
|-- README.md
|-- checklists/
`-- skills/
```

## Usage

- Read `AGENTS.md` first for repository-wide rules.
- Load `.agents/skills/opendx-companyos-development/SKILL.md` before changing product behavior, architecture, frontend UI, repository structure, or contributor-facing documentation.
- Use `checklists/` before commits, PRs, and implementation handoffs.

Do not store secrets, private prompts, production credentials, generated agent memory, or one-off task plans in this directory.
