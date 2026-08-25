# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Literal, Mapping

from app.agentic.application.prompt_builder import ModelPrompt, PromptMessage
from app.agentic.domain.ai_ceo_execution import AiCeoExecutionView, verify_ai_ceo_execution
from app.agentic.domain.model_runtime import FrozenJsonMapping


class PhaseFContextError(ValueError):
    pass


@dataclass(frozen=True)
class PhaseFContext:
    purpose: Literal["orchestration_planning", "executive_synthesis"]
    authorized_context: Mapping[str, object]

    def __post_init__(self) -> None:
        object.__setattr__(self, "authorized_context", FrozenJsonMapping(self.authorized_context))


def build_phase_f_context(view: AiCeoExecutionView) -> PhaseFContext:
    try:
        verify_ai_ceo_execution(view)
    except ValueError as error:
        raise PhaseFContextError("AI_CEO_EXECUTION_AUTHORITY_INVALID") from error
    context = _thaw(view.payload.authorized_context)
    if not isinstance(context, dict):
        raise PhaseFContextError("AI_CEO_EXECUTION_CONTEXT_INVALID")
    if view.authority.purpose == "orchestration_planning":
        if set(context) != {"taskBrief"} or not isinstance(context["taskBrief"], dict):
            raise PhaseFContextError("AI_CEO_EXECUTION_CONTEXT_INVALID")
    else:
        if set(context) != {"taskId", "planVersion", "planDigest", "branches"}:
            raise PhaseFContextError("AI_CEO_EXECUTION_CONTEXT_INVALID")
        if not isinstance(context["branches"], list):
            raise PhaseFContextError("AI_CEO_EXECUTION_CONTEXT_INVALID")
    return PhaseFContext(view.authority.purpose, context)


def build_phase_f_prompt(context: PhaseFContext) -> ModelPrompt:
    if type(context) is not PhaseFContext:
        raise TypeError("Phase F context is required")
    if context.purpose == "orchestration_planning":
        instruction = (
            "Return only a governed owner/dependency proposal. Select only eligible "
            "Departments present in the Task Brief. Do not select models, budgets, tools, "
            "permissions, schemas, identifiers, or execution authority."
        )
    else:
        instruction = (
            "Return only a governed executive synthesis from the supplied resolved branches. "
            "Do not invent evidence, unavailable branches, permissions, or execution authority."
        )
    serialized = json.dumps(
        _thaw(context.authorized_context), ensure_ascii=False, allow_nan=False,
        sort_keys=True, separators=(",", ":"),
    )
    return ModelPrompt(
        trusted_messages=(
            PromptMessage("system", "You are the governed AI CEO execution runtime."),
            PromptMessage("system", instruction),
        ),
        untrusted_message=PromptMessage(
            "user", f"UNTRUSTED_PHASE_F_CONTEXT\n{serialized}"
        ),
    )


def _thaw(value: object) -> object:
    if isinstance(value, Mapping):
        return {key: _thaw(item) for key, item in value.items()}
    if type(value) in (list, tuple):
        return [_thaw(item) for item in value]
    return value
