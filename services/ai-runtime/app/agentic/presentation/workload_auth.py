# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import re

from app.agentic.application.ports import WorkloadVerifier
from app.agentic.domain.contracts import WorkloadPrincipal


class WorkloadAuthenticationError(ValueError):
    pass


class WorkloadAuthenticator:
    def __init__(self, verifier: WorkloadVerifier) -> None:
        self._verifier = verifier

    def authenticate(self, authorization: str | None) -> WorkloadPrincipal:
        match = re.fullmatch(r"Bearer ([^\s]+)", authorization or "", re.IGNORECASE)
        if match is None:
            raise WorkloadAuthenticationError("WORKLOAD_AUTHENTICATION_REQUIRED")
        try:
            return self._verifier.verify(match.group(1))
        except Exception as error:
            raise WorkloadAuthenticationError("WORKLOAD_AUTHENTICATION_REQUIRED") from error
