# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

import pytest
from app.marketing.agent import (
    MarketingContentAgent,
    MarketingPublisherAgent,
    MarketingVisualAgent,
)
from app.marketing.schemas import (
    CatalogProductSummary,
    ContentDraftOutput,
    MarketingCampaignBrief,
    SubjectSpec,
)


@pytest.fixture
def sample_brief() -> MarketingCampaignBrief:
    return MarketingCampaignBrief(
        campaign_id="00000000-0000-4000-8000-000000000001",
        campaign_name="NovaPhone 15 Launch",
        objective="Drive pre-orders for flagship phone",
        subject=SubjectSpec(kind="catalog_product", reference="novaphone-15"),
        audience="Tech professionals",
        language="vi",
        mandatory_message="Tặng tai nghe không dây cho 100 khách hàng đầu tiên",
        prohibited_claims=["chữa bách bệnh", "làm giàu không khó"],
        call_to_action="Đặt hàng ngay tại NovaCommerce",
    )


@pytest.fixture
def sample_product() -> CatalogProductSummary:
    return CatalogProductSummary(
        product_id="novaphone-15",
        title="NovaPhone 15 Pro",
        slug="novaphone-15-pro",
        description="Điện thoại flagship thế hệ mới",
        default_price_vnd=25000000,
        primary_image_url="https://media.example.com/p1.jpg",
    )


@pytest.mark.asyncio
async def test_marketing_content_agent_drafts_valid_copy(sample_brief, sample_product):
    agent = MarketingContentAgent()
    draft = await agent.draft_content(sample_brief, sample_product)

    assert isinstance(draft, ContentDraftOutput)
    assert sample_brief.mandatory_message in draft.primary_text
    assert sample_product.title in draft.primary_text
    assert draft.call_to_action == sample_brief.call_to_action
    assert "#novaphone_15_pro" in draft.hashtags


@pytest.mark.asyncio
async def test_marketing_content_agent_detects_prohibited_claims(sample_brief, sample_product):
    class FakeLLMWithProhibitedClaim:
        async def complete(self, messages, response_format=None):
            return ContentDraftOutput(
                primary_text="Sản phẩm chữa bách bệnh và làm giàu không khó!",
                headline="Tin hot",
                hashtags=[],
                call_to_action="Mua ngay",
            )

    agent = MarketingContentAgent(llm_client=FakeLLMWithProhibitedClaim())
    with pytest.raises(ValueError, match="prohibited claim"):
        await agent.draft_content(sample_brief, sample_product)


@pytest.mark.asyncio
async def test_marketing_visual_agent_generates_valid_png_asset(sample_brief, sample_product):
    content_agent = MarketingContentAgent()
    draft = await content_agent.draft_content(sample_brief, sample_product)

    visual_agent = MarketingVisualAgent()
    asset = await visual_agent.create_visual_asset(sample_brief, draft, sample_product)

    assert asset.format == "png"
    assert asset.dimensions.width == 1080
    assert asset.dimensions.height == 1080
    assert asset.asset_bytes_base64 is not None


@pytest.mark.asyncio
async def test_marketing_publisher_agent_assembles_package(sample_brief, sample_product):
    content_agent = MarketingContentAgent()
    draft = await content_agent.draft_content(sample_brief, sample_product)

    visual_agent = MarketingVisualAgent()
    asset = await visual_agent.create_visual_asset(sample_brief, draft, sample_product)

    publisher_agent = MarketingPublisherAgent()
    package = await publisher_agent.verify_and_package(
        brief=sample_brief,
        content_version_id="content-ver-1",
        content_draft=draft,
        visual_asset_id="visual-asset-1",
        visual_asset=asset,
    )

    assert package.campaign_id == sample_brief.campaign_id
    assert package.content_version_id == "content-ver-1"
    assert package.visual_asset_id == "visual-asset-1"
    assert package.status == "ready_for_review"
    assert len(package.verification_checklist) >= 4
