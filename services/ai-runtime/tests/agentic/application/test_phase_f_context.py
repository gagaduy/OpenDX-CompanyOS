# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

import json

import pytest

from app.agentic.application.phase_f_context import (
    PhaseFContext, PhaseFContextError, build_phase_f_context, build_phase_f_prompt,
)
from app.agentic.domain.ai_ceo_execution import AiCeoExecutionView
from tests.agentic.domain.test_ai_ceo_execution import authority_view


def test_builds_purpose_scoped_planning_context_and_prompt() -> None:
    view = AiCeoExecutionView.model_validate_json(json.dumps(authority_view()))

    context = build_phase_f_context(view)
    prompt = build_phase_f_prompt(context)

    assert context.purpose == "orchestration_planning"
    assert "owner/dependency" in prompt.trusted_messages[1].content
    assert "independent" in prompt.trusted_messages[1].content
    assert "empty dependencies" in prompt.trusted_messages[1].content
    assert prompt.untrusted_message.content.startswith("UNTRUSTED_PHASE_F_CONTEXT\n")
    assert "primaryModel" not in prompt.untrusted_message.content


def test_synthesis_prompt_forbids_citing_unavailable_branch_provenance() -> None:
    prompt = build_phase_f_prompt(PhaseFContext("executive_synthesis", {
        "taskId": "00000000-0000-4000-8000-000000000001",
        "planVersion": 1, "planDigest": "a" * 64, "branches": [],
    }))

    assert "unavailable branch provenance IDs MUST NOT be cited" in " ".join(
        message.content for message in prompt.trusted_messages
    )


def test_rejects_context_purpose_mismatch() -> None:
    raw = authority_view()
    raw["authority"]["purpose"] = "executive_synthesis"  # type: ignore[index]
    raw["authority"]["planVersion"] = 1  # type: ignore[index]

    with pytest.raises((ValueError, PhaseFContextError)):
        build_phase_f_context(AiCeoExecutionView.model_validate_json(json.dumps(raw)))
