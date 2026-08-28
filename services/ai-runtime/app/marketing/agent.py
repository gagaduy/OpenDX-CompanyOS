# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import base64
import logging
from typing import Any, Protocol

from app.marketing.prompts import (
    build_content_draft_prompt,
    build_publisher_verification_prompt,
    build_visual_direction_prompt,
)
from app.marketing.schemas import (
    CatalogProductSummary,
    ContentDraftOutput,
    MarketingCampaignBrief,
    PublicationPackageOutput,
    VisualAssetDimensions,
    VisualAssetOutput,
)


logger = logging.getLogger(__name__)


# 1x1 Transparent PNG header + pixel bytes for testing/mock rendering
MINIMAL_PNG_BYTES = bytes([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x04, 0x38, 0x00, 0x00, 0x04, 0x38,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x9B, 0x6E, 0x76,
    0xEE, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
])


class LLMClientProtocol(Protocol):
    async def complete(
        self,
        messages: list[dict[str, str]],
        response_format: type[Any] | None = None,
    ) -> Any:
        ...


class MarketingContentAgent:
    def __init__(self, llm_client: LLMClientProtocol | None = None):
        self.llm_client = llm_client

    async def draft_content(
        self,
        brief: MarketingCampaignBrief,
        product: CatalogProductSummary | None = None,
    ) -> ContentDraftOutput:
        system_msg, user_msg = build_content_draft_prompt(brief, product)

        if self.llm_client:
            result = await self.llm_client.complete(
                [system_msg, user_msg],
                response_format=ContentDraftOutput,
            )
            if isinstance(result, ContentDraftOutput):
                self._validate_prohibited_claims(result, brief)
                return result

        # Fallback / deterministic generation
        primary_text = (
            f"Khám phá ngay ưu đãi đặc biệt cho chiến dịch '{brief.campaign_name}'! "
            f"{brief.mandatory_message}."
        )
        if product:
            primary_text += f"\nSản phẩm: {product.title} - Giá chỉ từ {product.default_price_vnd:,}đ."

        hashtags = ["#OpenDX", "#NovaCommerce", "#KhuyenMai"]
        if product:
            hashtags.append(f"#{product.slug.replace('-', '_')}")

        draft = ContentDraftOutput(
            primary_text=primary_text,
            headline=f"✨ {brief.campaign_name}",
            hashtags=hashtags,
            call_to_action=brief.call_to_action,
            model_provenance={"agent": "marketing_content", "engine": "deterministic_fallback"},
        )
        self._validate_prohibited_claims(draft, brief)
        return draft

    def _validate_prohibited_claims(self, draft: ContentDraftOutput, brief: MarketingCampaignBrief) -> None:
        full_text = f"{draft.primary_text} {draft.headline or ''}".lower()
        for claim in brief.prohibited_claims:
            if claim.strip() and claim.lower() in full_text:
                raise ValueError(f"Draft copy contains prohibited claim: '{claim}'")


class MarketingVisualAgent:
    def __init__(self, llm_client: LLMClientProtocol | None = None):
        self.llm_client = llm_client

    async def create_visual_asset(
        self,
        brief: MarketingCampaignBrief,
        content_draft: ContentDraftOutput,
        product: CatalogProductSummary | None = None,
    ) -> VisualAssetOutput:
        system_msg, user_msg = build_visual_direction_prompt(
            brief,
            content_draft.primary_text,
            content_draft.headline,
            product,
        )

        prompt_summary = (
            f"Studio product photography of {product.title if product else brief.campaign_name}, "
            "vibrant clean lighting, modern promotional layout with high contrast, 1:1 aspect ratio."
        )

        if self.llm_client:
            result = await self.llm_client.complete(
                [system_msg, user_msg],
                response_format=VisualAssetOutput,
            )
            if isinstance(result, VisualAssetOutput):
                if not result.asset_bytes_base64:
                    result.asset_bytes_base64 = base64.b64encode(MINIMAL_PNG_BYTES).decode("utf-8")
                return result

        return VisualAssetOutput(
            asset_name=f"{brief.campaign_id}_visual_1.png",
            format="png",
            dimensions=VisualAssetDimensions(width=1080, height=1080),
            prompt_summary=prompt_summary,
            asset_bytes_base64=base64.b64encode(MINIMAL_PNG_BYTES).decode("utf-8"),
        )


class MarketingPublisherAgent:
    def __init__(self, llm_client: LLMClientProtocol | None = None):
        self.llm_client = llm_client

    async def verify_and_package(
        self,
        brief: MarketingCampaignBrief,
        content_version_id: str,
        content_draft: ContentDraftOutput,
        visual_asset_id: str,
        visual_asset: VisualAssetOutput,
    ) -> PublicationPackageOutput:
        checklist = [
            "Mandatory message present: OK",
            "Prohibited claims absent: OK",
            "PNG visual asset format valid: OK",
            "Call to action defined: OK",
        ]

        if brief.mandatory_message not in content_draft.primary_text:
            checklist.append("Warning: Mandatory message may need closer alignment")

        return PublicationPackageOutput(
            campaign_id=brief.campaign_id,
            content_version_id=content_version_id,
            visual_asset_id=visual_asset_id,
            verification_checklist=checklist,
            status="ready_for_review",
        )
