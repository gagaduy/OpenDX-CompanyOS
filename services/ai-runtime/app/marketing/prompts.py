# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import json
from typing import Any

from app.marketing.schemas import CatalogProductSummary, MarketingCampaignBrief


MARKETING_GOVERNANCE_RULES = (
    "1. Fail-closed compliance: NEVER output or imply any prohibited claim listed in the brief.\n"
    "2. Mandatory message: You MUST incorporate the mandatory message clearly in the copy.\n"
    "3. Channel fidelity: Craft content optimized for a Facebook Page Image Post (engaging hook, informative body, hashtags, clear call-to-action).\n"
    "4. Language: If the requested language is Vietnamese ('vi'), all copy must be in natural, professional Vietnamese.\n"
    "5. Return strictly valid JSON adhering to the specified schema."
)


def build_content_draft_prompt(
    brief: MarketingCampaignBrief,
    product: CatalogProductSummary | None = None,
) -> tuple[dict[str, str], dict[str, str]]:
    product_context = ""
    if product:
        product_context = (
            f"\nCatalog Product Details:\n"
            f"- Title: {product.title}\n"
            f"- Description: {product.description or 'N/A'}\n"
            f"- Default Price: {f'{product.default_price_vnd:,} VND' if product.default_price_vnd else 'N/A'}\n"
            f"- Primary Image: {product.primary_image_url or 'N/A'}\n"
        )

    prohibited_list = (
        ", ".join([f'"{c}"' for c in brief.prohibited_claims])
        if brief.prohibited_claims
        else "None"
    )

    system_instruction = (
        "You are the Marketing Content Specialist Digital Employee for OpenDX CompanyOS.\n"
        "Your task is to write compelling, accurate Facebook post copy based strictly on the campaign brief and product data.\n\n"
        f"Governance & Policy Constraints:\n{MARKETING_GOVERNANCE_RULES}\n\n"
        f"PROHIBITED CLAIMS (STRICTLY FORBIDDEN): {prohibited_list}\n"
    )

    user_payload = {
        "campaign_name": brief.campaign_name,
        "objective": brief.objective,
        "subject_kind": brief.subject.kind,
        "subject_reference": brief.subject.reference,
        "audience": brief.audience or "General audience",
        "language": brief.language,
        "tone": brief.tone or "Professional and engaging",
        "mandatory_message": brief.mandatory_message,
        "call_to_action": brief.call_to_action,
        "product_details": product.model_dump() if product else None,
    }

    user_content = (
        f"CAMPAIGN BRIEF:\n{json.dumps(user_payload, ensure_ascii=False, indent=2)}\n"
        f"{product_context}\n"
        "Generate a structured Facebook post draft containing: primary_text, headline, hashtags, call_to_action."
    )

    return (
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": user_content},
    )


def build_visual_direction_prompt(
    brief: MarketingCampaignBrief,
    primary_text: str,
    headline: str | None = None,
    product: CatalogProductSummary | None = None,
) -> tuple[dict[str, str], dict[str, str]]:
    product_desc = f"Product: {product.title}" if product else f"Topic: {brief.subject.reference}"

    system_instruction = (
        "You are the Marketing Visual & Creative Specialist Digital Employee for OpenDX CompanyOS.\n"
        "Your task is to generate high-converting 1:1 square visual prompt direction and layout specifications for Facebook Image Posts.\n"
        "Focus on high visual contrast, clear product focal point, professional lighting, and no cluttered text.\n"
    )

    user_content = (
        f"CAMPAIGN OBJECTIVE: {brief.objective}\n"
        f"TARGET AUDIENCE: {brief.audience or 'General audience'}\n"
        f"TONE: {brief.tone or 'Modern and clean'}\n"
        f"{product_desc}\n"
        f"POST COPY:\nHeadline: {headline or 'N/A'}\nBody: {primary_text}\n\n"
        "Generate creative visual direction with prompt_summary, asset_name, and 1080x1080 PNG dimensions."
    )

    return (
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": user_content},
    )


def build_publisher_verification_prompt(
    brief: MarketingCampaignBrief,
    content_draft: dict[str, Any],
    visual_asset: dict[str, Any],
) -> tuple[dict[str, str], dict[str, str]]:
    system_instruction = (
        "You are the Marketing Publisher Digital Employee for OpenDX CompanyOS.\n"
        "Your task is to perform the final compliance checklist before assembling the publication package.\n"
        "Verify: (1) Mandatory message presence, (2) Absence of prohibited claims, (3) PNG visual validity, (4) Call to action clarity."
    )

    user_content = (
        f"CAMPAIGN BRIEF:\n{brief.model_dump_json(indent=2)}\n\n"
        f"CONTENT DRAFT:\n{json.dumps(content_draft, ensure_ascii=False, indent=2)}\n\n"
        f"VISUAL ASSET:\n{json.dumps(visual_asset, ensure_ascii=False, indent=2)}\n\n"
        "Provide verification checklist results and confirm readiness for publication package assembly."
    )

    return (
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": user_content},
    )
