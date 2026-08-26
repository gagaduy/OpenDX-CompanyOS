# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from app.agentic.domain.execution_descriptor import canonical_digest
from app.agentic.domain.store_health_result_schemas import STORE_HEALTH_RESULT_SCHEMAS


def test_runtime_department_schemas_match_api_owned_catalog_digests() -> None:
    assert {
        name: canonical_digest(schema)
        for name, schema in STORE_HEALTH_RESULT_SCHEMAS.items()
    } == {
        "store_health_catalog_v1": "5e4189a1c9425c3fb863d084569de22a2d1c902426b5bf053b8ff47396d0e087",
        "store_health_inventory_v1": "d4c5a3e2a60a904b02d24abfbcb6b014aee346f0b022f0e216a7e0b7a26ef0c7",
        "store_health_order_v1": "a245f4dc12c3fa5c4dec37de0e4c08f6e20c5c79eb319508391b552dd92b2c24",
        "store_health_finance_v1": "d7f3da4436040d600106b7df9565a2b6006dfa36e508233dccd1363d93ae67cd",
        "store_health_crm_v1": "8687b161d1e7cd0344301b7544fc81e63ec0f0ac8caa81df081448cfdfa3703b",
        "store_health_support_v1": "d88d729676bc7c9a813f50ac17050a6a2f2abef07b02c824c2596bd7c536788e",
    }
