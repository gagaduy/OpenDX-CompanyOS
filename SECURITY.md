<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Security Policy

## Supported Versions

OpenDX CompanyOS is currently unreleased. Security reports for the `main` branch and unreleased code are accepted.

## Reporting a Vulnerability

Do not create a public GitHub issue for vulnerabilities.

Report vulnerabilities privately through GitHub Security Advisories for `gagaduy/OpenDX-CompanyOS`.

## Response Expectations

Maintainers will acknowledge valid reports as soon as practical, investigate impact, and coordinate remediation before public disclosure when possible.

## Sensitive Data

Never include secrets, real credentials, private endpoints, personal data, `.env` files, signing keys, or production dumps in reports, tests, fixtures, prompts, workflow JSON, or documentation.

Repository security workflows intentionally do not deploy and do not reference
SSH keys, server IPs, or production secrets. Use `pnpm audit:env` and
`pnpm audit:secrets` before opening a pull request that changes configuration,
fixtures, or operations documentation.
