<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Single-Agent Live Acceptance Design

## Goal

Provide an explicit local-only command that exercises one configured Catalog
model through the existing governed reservation, execution, settlement, audit,
and provenance path. It must never add a public API endpoint or make a live
provider call by default.

## Scope

The command accepts one `catalog` task/run fixture, requires an active
configuration, `OPENROUTER_EXECUTION_ENABLED=true`, an OpenRouter credential,
and an explicit confirmation environment variable. It uses the existing
internal model-run contracts to reserve and settle the run, invokes the
existing AI Runtime model executor once, and emits only safe aggregate output:
run ID, configured model, token usage, settled microunits, and outcome.

It rejects missing confirmation, missing configuration, a non-Catalog model,
disabled execution, unavailable model, denied policy, revocation, or a budget
limit before provider invocation. It neither reads prompt/response bodies nor
prints credentials.

## Safety and Operations

The command is for a developer machine or an explicitly opted-in credentialed
CI job. Normal CI runs only its static/unit tests and must not contain an
OpenRouter credential. The command uses the active revision's token/budget
limits; the current local Catalog cap is $0.10 per task. Production does not
gain a route, scheduler, or automatic trigger.

## Verification

Tests prove the command requires confirmation, targets exactly Catalog, uses
the governed internal reservation/settlement flow, and redacts secrets and
model bodies. A credentialed local run proves one completed model run with
audit/provenance and an amount no greater than the configured budget.
