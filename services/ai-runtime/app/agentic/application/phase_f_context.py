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
            "Departments present in the Task Brief, select each Department at most once, "
            "and create independent branches with empty dependencies. "
            "Do not select models, budgets, tools, "
            "permissions, schemas, identifiers, or execution authority."
        )
    else:
        instruction = (
            "You are the AI CEO synthesizing the comprehensive Executive Report from the supplied resolved branches. "
            "Return valid JSON adhering strictly to this schema: "
            '{"schemaVersion": 1, "completionState": "complete", '
            '"summary": "Comprehensive, insightful executive summary directly addressing the task objective with specific findings and concrete metrics.", '
            '"acceptedResultReferences": [{"resultId": "...", "subtaskId": "...", "resultDigest": "..."}], '
            '"unavailableBranches": [], '
            '"conclusions": [{"code": "CODE", "statement": "Clear conclusion with specific facts/SKU/metrics from department analyses.", "provenanceIds": ["..."]}], '
            '"risks": [{"code": "CODE", "severity": "high", "statement": "Specific operational, stock, or order risk with exact details.", "provenanceIds": ["..."]}], '
            '"recommendedActions": [{"code": "CODE", "statement": "Actionable next step with target owners and items.", "provenanceIds": ["..."], "requiresHumanApproval": false}], '
            '"conflicts": []}. '
            "Rules: "
            "1. Deliver high-value, actionable insights: Directly answer the user's objective using concrete facts, SKU codes, numbers, and evidence from the branch analyses. "
            "2. In acceptedResultReferences, copy every usable branch from the input branches with its exact resultId, subtaskId, and resultDigest verbatim. "
            "3. In unavailableBranches, include an entry for each unavailable branch with its exact subtaskId and reasonCode (leave as [] if none). "
            "4. Set completionState to 'complete' if all branches are usable and there are no unavailable branches or partial branches; otherwise 'partial'. "
            "5. In conclusions, risks, recommendedActions, and conflicts, provide an uppercase alphanumeric code (e.g. INV-01, ORD-01), a detailed clear statement, and populate provenanceIds selecting only valid provenance IDs from the input branch provenanceIds. "
            "6. LANGUAGE RULE: All text fields (summary, conclusions statement, risks statement, recommendedActions statement, conflicts statement) MUST be written in clear, professional Vietnamese (tiếng Việt)."
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
