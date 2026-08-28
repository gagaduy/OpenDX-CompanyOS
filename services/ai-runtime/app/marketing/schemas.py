# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class SubjectSpec(BaseModel):
    kind: Literal["catalog_product", "free_topic"]
    reference: str


class MarketingCampaignBrief(BaseModel):
    campaign_id: str = Field(..., description="UUID of the campaign")
    campaign_name: str = Field(..., description="Name of the marketing campaign")
    objective: str = Field(..., description="Core campaign objective")
    subject: SubjectSpec
    audience: str | None = None
    language: Literal["vi", "en"] = "vi"
    tone: str | None = None
    mandatory_message: str = Field(..., description="Mandatory message that must be included")
    prohibited_claims: list[str] = Field(default_factory=list, description="List of prohibited claims")
    call_to_action: str = Field(..., description="Primary call to action")
    facebook_page_configuration_id: str = Field(default="primary", description="Target page config")


class CatalogProductSummary(BaseModel):
    product_id: str
    title: str
    slug: str
    description: str | None = None
    default_price_vnd: int | None = None
    primary_image_url: str | None = None
    is_published: bool = True
    variant_count: int = 1


class ContentDraftOutput(BaseModel):
    primary_text: str = Field(..., min_length=10, max_length=5000, description="Facebook post body copy")
    headline: str | None = Field(default=None, max_length=500, description="Headline or title")
    hashtags: list[str] = Field(default_factory=list, max_length=30, description="List of relevant hashtags")
    call_to_action: str = Field(..., min_length=2, max_length=500, description="Call to action statement")
    model_provenance: dict[str, Any] | None = None


class VisualAssetDimensions(BaseModel):
    width: int = Field(default=1080, ge=100, le=4096)
    height: int = Field(default=1080, ge=100, le=4096)


class VisualAssetOutput(BaseModel):
    asset_name: str = Field(..., min_length=1, max_length=255)
    format: Literal["png"] = "png"
    dimensions: VisualAssetDimensions = Field(default_factory=VisualAssetDimensions)
    prompt_summary: str = Field(..., min_length=5, max_length=2000, description="Detailed visual prompt and creative direction")
    asset_bytes_base64: str | None = None


class PublicationPackageOutput(BaseModel):
    campaign_id: str
    content_version_id: str
    visual_asset_id: str
    verification_checklist: list[str] = Field(default_factory=list)
    status: Literal["draft", "ready_for_review"] = "ready_for_review"
