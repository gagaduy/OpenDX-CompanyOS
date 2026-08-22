# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

"""Local-only guard for one governed Catalog model execution."""

from __future__ import annotations

import os
from collections.abc import Awaitable, Callable, Mapping
from typing import Any


CONFIRMATION = "run-one-catalog"


class CatalogLiveAcceptanceError(ValueError):
    pass


async def run_catalog_acceptance(
    command: Mapping[str, object], execute: Callable[[Mapping[str, object]], Awaitable[Mapping[str, object]]],
    *, execution_enabled: bool, confirmation: str | None = None,
) -> Mapping[str, object]:
    if confirmation != CONFIRMATION:
        raise CatalogLiveAcceptanceError("LIVE_ACCEPTANCE_CONFIRMATION_REQUIRED")
    if not execution_enabled:
        raise CatalogLiveAcceptanceError("OPENROUTER_EXECUTION_DISABLED")
    if command.get("agentKind") != "catalog":
        raise CatalogLiveAcceptanceError("CATALOG_AGENT_REQUIRED")
    outcome = await execute(command)
    return {key: outcome[key] for key in ("runId", "status", "inputTokens", "outputTokens", "costMicros") if key in outcome}


def confirmation_from_environment() -> str | None:
    return os.environ.get("OPENROUTER_LIVE_ACCEPTANCE_CONFIRM")
