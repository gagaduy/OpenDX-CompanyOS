# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import pytest

from app.agentic.worker_healthcheck import (
    WorkerReadiness,
    check_worker_health,
)
from app.shared.config import TemporalSettings


def test_readiness_marker_is_published_after_polling_and_removed_on_close(
    tmp_path: Path,
) -> None:
    path = tmp_path / "worker-ready"
    readiness = WorkerReadiness(path, f"opendx-ai-worker:{'a' * 32}")

    readiness.publish()
    assert path.read_text(encoding="ascii") == f"opendx-ai-worker:{'a' * 32}"

    asyncio.run(readiness.aclose())
    assert path.exists() is False


def test_healthcheck_requires_the_marker_identity_to_be_polling(tmp_path: Path) -> None:
    path = tmp_path / "worker-ready"
    expected = f"opendx-ai-worker:{'b' * 32}"
    path.write_text(expected, encoding="ascii")
    observed: dict[str, Any] = {}

    class Adapter:
        async def wait_until_identity_polling(
            self, identity: str, timeout_seconds: int
        ) -> None:
            observed["identity"] = identity
            observed["timeout"] = timeout_seconds

        async def aclose(self) -> None:
            observed["closed"] = True

    async def connect(
        _settings: TemporalSettings, *, identity: str
    ) -> Adapter:
        observed["client_identity"] = identity
        return Adapter()

    settings = TemporalSettings("temporal:7233", "opendx", "store-health-v1", None)
    asyncio.run(check_worker_health(settings, path, connect=connect))

    assert observed == {
        "identity": expected,
        "timeout": 3,
        "closed": True,
        "client_identity": "opendx-ai-worker-healthcheck",
    }


def test_healthcheck_rejects_missing_or_unbound_identity(tmp_path: Path) -> None:
    settings = TemporalSettings("temporal:7233", "opendx", "store-health-v1", None)
    with pytest.raises(RuntimeError, match="readiness marker"):
        asyncio.run(check_worker_health(settings, tmp_path / "missing"))

    invalid = tmp_path / "invalid"
    invalid.write_text("other-worker", encoding="ascii")
    with pytest.raises(RuntimeError, match="identity"):
        asyncio.run(check_worker_health(settings, invalid))
