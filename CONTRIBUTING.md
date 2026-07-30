<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Contributing

OpenDX CompanyOS is built as a Company-first, human-governed platform. Contributions must preserve the product guardrails in `docs/agent-guidelines/implementation-guardrails.md`.

## Branches

Use task-scoped branches named:

```text
<type>/<issue>-<short-name>
```

Use `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, `security`, `hotfix`, or `release`. Omit the issue number when none exists.

## Commits

Use Conventional Commits:

```text
<type>(<scope>): <imperative summary>
```

Keep commits atomic. Update tests, docs, and `CHANGELOG.md` in the same commit as the change they describe.

## Changelog

Every repository-changing unit must update `CHANGELOG.md` under `[Unreleased]`.

## Validation

Before committing, run:

```bash
git diff --check
python3 /home/duy/Olympic/TraceGuard/.agents/skills/build-open-source-repository/scripts/audit_repo.py . --spdx-id Apache-2.0
```

Run project-specific tests once application code exists.

## Pull Requests

PRs should describe scope, tests, security impact, changelog changes, and breaking changes.
