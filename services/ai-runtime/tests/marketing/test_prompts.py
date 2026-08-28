# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from app.marketing.prompts import (
    build_content_draft_prompt,
    build_publisher_verification_prompt,
    build_visual_direction_prompt,
)
from app.marketing.schemas import (
    CatalogProductSummary,
    MarketingCampaignBrief,
    SubjectSpec,
)


def test_build_content_draft_prompt():
    brief = MarketingCampaignBrief(
        campaign_id="00000000-0000-4000-8000-000000000001",
        campaign_name="NovaPhone 15 Launch",
        objective="Drive pre-orders",
        subject=SubjectSpec(kind="catalog_product", reference="novaphone-15"),
        audience="Tech lovers",
        language="vi",
        mandatory_message="Pre-order today to receive free wireless earbuds",
        prohibited_claims=["100% cure", "free money"],
        call_to_action="Order now at NovaStore",
    )

    product = CatalogProductSummary(
        product_id="novaphone-15",
        title="NovaPhone 15 Pro",
        slug="novaphone-15-pro",
        description="Flagship smartphone",
        default_price_vnd=25000000,
        primary_image_url="https://media.example.com/p1.jpg",
    )

    system_msg, user_msg = build_content_draft_prompt(brief, product)

    assert system_msg["role"] == "system"
    assert "Marketing Content Specialist" in system_msg["content"]
    assert '"100% cure"' in system_msg["content"]
    assert '"free money"' in system_msg["content"]

    assert user_msg["role"] == "user"
    assert "NovaPhone 15 Pro" in user_msg["content"]
    assert "25,000,000 VND" in user_msg["content"]
    assert "Pre-order today to receive free wireless earbuds" in user_msg["content"]


def test_build_visual_direction_prompt():
    brief = MarketingCampaignBrief(
        campaign_id="00000000-0000-4000-8000-000000000001",
        campaign_name="Summer Sale",
        objective="Boost summer revenue",
        subject=SubjectSpec(kind="free_topic", reference="summer_collection"),
        mandatory_message="Sale up to 50%",
        call_to_action="Shop online",
    )

    system_msg, user_msg = build_visual_direction_prompt(
        brief,
        primary_text="Summer Sale is here with 50% discount!",
        headline="Summer Vibes",
    )

    assert system_msg["role"] == "system"
    assert "Marketing Visual & Creative Specialist" in system_msg["content"]
    assert "1080x1080 PNG" in user_msg["content"]


def test_build_publisher_verification_prompt():
    brief = MarketingCampaignBrief(
        campaign_id="00000000-0000-4000-8000-000000000001",
        campaign_name="Summer Sale",
        objective="Boost revenue",
        subject=SubjectSpec(kind="free_topic", reference="sale"),
        mandatory_message="Buy 1 get 1",
        call_to_action="Shop now",
    )

    system_msg, user_msg = build_publisher_verification_prompt(
        brief,
        content_draft={"primary_text": "Sample"},
        visual_asset={"asset_name": "sample.png"},
    )

    assert system_msg["role"] == "system"
    assert "Marketing Publisher" in system_msg["content"]
    assert "verification checklist" in user_msg["content"]
