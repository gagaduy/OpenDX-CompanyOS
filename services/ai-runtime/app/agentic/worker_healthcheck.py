# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import os
import re
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from app.agentic.infrastructure.temporal_client import connect_temporal
from app.shared.config import RuntimeSettings, TemporalSettings


class WorkerReadiness:
    def __init__(self, path: Path, identity: str) -> None:
        self._path = path
        self._identity = _identity(identity)

    def publish(self) -> None:
        temporary = self._path.with_name(f".{self._path.name}.tmp")
        temporary.write_text(self._identity, encoding="ascii")
        temporary.replace(self._path)

    async def aclose(self) -> None:
        self._path.unlink(missing_ok=True)


async def check_worker_health(
    settings: TemporalSettings,
    readiness_path: Path,
    *,
    connect: Callable[..., Awaitable[Any]] = connect_temporal,
) -> None:
    try:
        expected_identity = _identity(readiness_path.read_text(encoding="ascii").strip())
    except FileNotFoundError as error:
        raise RuntimeError("Worker readiness marker is unavailable") from error

    temporal = await connect(settings, identity="opendx-ai-worker-healthcheck")
    try:
        await temporal.wait_until_identity_polling(expected_identity, 3)
    finally:
        await temporal.aclose()


def _identity(value: str) -> str:
    if not re.fullmatch(r"opendx-ai-worker:[0-9a-f]{32}", value):
        raise RuntimeError("Worker readiness identity is invalid")
    return value


def main() -> None:
    settings = RuntimeSettings.from_environment()
    path = Path(os.environ.get("WORKER_READINESS_PATH", "/tmp/opendx-worker-ready"))
    asyncio.run(check_worker_health(settings.temporal, path))


if __name__ == "__main__":
    main()
