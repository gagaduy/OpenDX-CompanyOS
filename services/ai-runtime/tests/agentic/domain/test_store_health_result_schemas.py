# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from app.agentic.domain.execution_descriptor import canonical_digest
from app.agentic.domain.store_health_result_schemas import STORE_HEALTH_RESULT_SCHEMAS


def test_runtime_department_schemas_match_api_owned_catalog_digests() -> None:
    assert {
        name: canonical_digest(schema)
        for name, schema in STORE_HEALTH_RESULT_SCHEMAS.items()
    } == {
        "store_health_catalog_v1": "5d7d44acf03e476a39e0d7c4e8f0f09122484c0f4f6cc80e13b5ebb30d9c099b",
        "store_health_inventory_v1": "68ac55f52c24e8ebe0a73cf0abeec936aec3dc3bafa2e1decd0c012282a2f1bb",
        "store_health_order_v1": "699dd01bbf72fb91507796f14c351cc70aa066139f97f72626b6aa5e018f6fc7",
        "store_health_finance_v1": "05c87bd85daa7ff1b6342bd2acd39bb0f7d076bed745b7e597d118a3c36618e4",
        "store_health_crm_v1": "4bd2583413a265f4c7dc20fb757a55df60e815a02d438a9476ea2747c2e41ab3",
        "store_health_support_v1": "efb91b4c0e73147cd0a6c66b5de3c881fe20c5a87d93b12d3f936e476c417dce",
    }
