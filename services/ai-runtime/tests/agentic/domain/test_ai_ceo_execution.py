# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from copy import deepcopy
import json

import pytest

from app.agentic.domain.ai_ceo_execution import (
    AI_CEO_RESULT_SCHEMAS, AiCeoExecutionView, verify_ai_ceo_execution,
)
from app.agentic.domain.execution_descriptor import canonical_digest


def test_verifies_exact_frozen_ai_ceo_authority_and_payload_digests() -> None:
    raw = authority_view()

    view = AiCeoExecutionView.model_validate_json(json.dumps(raw))
    verify_ai_ceo_execution(view)

    assert view.authority.purpose == "orchestration_planning"
    with pytest.raises(TypeError):
        view.payload.authorized_context["changed"] = True  # type: ignore[index]


def test_rejects_payload_or_authority_digest_mismatch_and_sensitive_fields() -> None:
    changed = authority_view()
    changed["payload"]["authorizedContext"]["taskBrief"]["goal"] = "changed"  # type: ignore[index]
    with pytest.raises(ValueError, match="AI_CEO_EXECUTION_AUTHORITY_INVALID"):
        verify_ai_ceo_execution(AiCeoExecutionView.model_validate_json(json.dumps(changed)))

    sensitive = authority_view()
    sensitive["payload"]["authorizedContext"]["accessToken"] = "secret"  # type: ignore[index]
    with pytest.raises(ValueError, match="AI_CEO_EXECUTION_PAYLOAD_INVALID"):
        AiCeoExecutionView.model_validate_json(json.dumps(sensitive))


def test_ai_ceo_schema_digests_match_the_api_catalog() -> None:
    assert {name: canonical_digest(schema) for name, schema in AI_CEO_RESULT_SCHEMAS.items()} == {
        "orchestration_plan_proposal_v1": "7eded91450af684f3d83d1a38f1773ba165166e96139ea783e546e7f6d79efaa",
        "store_health_ai_ceo_report_v1": "5aa7bf4620581bfadd32407eb44f825c04fda99b2b2e5ced85c5b98929eb4174",
    }


def authority_view() -> dict[str, object]:
    payload = {
        "resultSchema": deepcopy(AI_CEO_RESULT_SCHEMAS["orchestration_plan_proposal_v1"]),
        "authorizedContext": {"taskBrief": {"goal": "Review Store Health"}},
    }
    authority = {
        "id": "00000000-0000-4000-8000-000000000001", "version": 1,
        "purpose": "orchestration_planning",
        "taskId": "00000000-0000-4000-8000-000000000002",
        "configurationRevisionId": "00000000-0000-4000-8000-000000000003",
        "policyVersion": 4, "primaryModel": "provider/primary",
        "fallbackModel": "provider/fallback", "resultSchemaName": "orchestration_plan_proposal_v1",
        "resultSchemaDigest": canonical_digest(payload["resultSchema"]),
        "authorizedContextDigest": canonical_digest(payload["authorizedContext"]),
        "budgetAuthorizationMicros": 10_000, "timeoutSeconds": 30,
        "createdAt": "2026-08-25T00:00:00.000Z", "expiresAt": "2026-08-25T00:10:00.000Z",
    }
    authority["payloadDigest"] = canonical_digest(payload)
    authority["authorityDigest"] = canonical_digest(authority)
    return deepcopy({"authority": authority, "payload": payload})
