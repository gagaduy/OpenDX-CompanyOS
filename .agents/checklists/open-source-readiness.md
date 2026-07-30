<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Open-Source Readiness

Use this checklist before commits that affect repository presentation, governance, dependencies, build commands, or public handoff.

- README explains product purpose, status, setup, validation, security, contribution, and license.
- New license-capable files include SPDX headers.
- `CHANGELOG.md` has a matching `[Unreleased]` entry.
- Build and validation commands work from a source checkout without editing source files for configuration.
- Dependencies are declared in manifests and summarized in `docs/dependencies.md` when changed.
- No vendored dependency source, generated build output, local environment files, secrets, or production credentials are staged.
- GitHub issue and PR templates remain usable.
- Release notes, tags, and versioned artifacts are created only for an approved stable milestone.
- `git diff --check` and `pnpm audit:repo` pass before handoff.
