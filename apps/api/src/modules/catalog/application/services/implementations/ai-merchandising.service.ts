// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type {
  ApplyMerchandisingProposalRequestDto,
  GenerateMerchandisingProposalRequestDto,
} from "../../dtos/requests/ai-merchandising-request.dto";
import type {
  ApplyMerchandisingResultDto,
  ApplyMerchandisingResultItemDto,
  MerchandisingItemDto,
  MerchandisingProposalDto,
} from "../../dtos/responses/ai-merchandising-response.dto";
import { CatalogApplicationError } from "../catalog-application.error";
import type { CatalogAuditRepository } from "../../repositories/interfaces/catalog-audit.repository";
import type { CatalogCommandContext } from "../interfaces/category.service";

export interface CatalogProductSnapshot {
  readonly productId: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly categoryName: string;
  readonly variantId: string;
  readonly sku: string;
  readonly priceMinor: number;
}

export class AiMerchandisingService {
  private readonly proposals = new Map<string, MerchandisingProposalDto>();

  constructor(
    private readonly transactions: TransactionRunner,
    private readonly audit: CatalogAuditRepository,
    private readonly generateId: () => string = randomUUID,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async generateProposal(
    request: GenerateMerchandisingProposalRequestDto,
  ): Promise<MerchandisingProposalDto> {
    if (!request.prompt.trim()) {
      throw new CatalogApplicationError("VALIDATION_ERROR", "Yêu cầu tối ưu danh mục không được để trống.");
    }

    // 1. Fetch current catalog snapshot from PostgreSQL
    const catalogSnapshots = await this.transactions.runReadOnly(async (session) => {
      const result = await session.query<{
        product_id: string;
        name: string;
        slug: string;
        description: string;
        category_name: string;
        variant_id: string;
        sku: string;
        price_minor: string | number;
      }>(`
        SELECT 
          p.id as product_id,
          p.name,
          p.slug,
          p.description,
          COALESCE(c.name, 'Chung') as category_name,
          v.id as variant_id,
          v.sku,
          COALESCE(pr.amount_minor, 0) as price_minor
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN product_variants v ON v.product_id = p.id
        LEFT JOIN product_prices pr ON pr.variant_id = v.id AND (pr.valid_to IS NULL OR pr.valid_to > NOW())
        ORDER BY p.created_at ASC
      `);

      return result.rows.map((r): CatalogProductSnapshot => ({
        productId: r.product_id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        categoryName: r.category_name,
        variantId: r.variant_id,
        sku: r.sku,
        priceMinor: Number(r.price_minor),
      }));
    });

    if (catalogSnapshots.length === 0) {
      throw new CatalogApplicationError("NOT_FOUND", "Cơ sở dữ liệu danh mục hiện đang trống.");
    }

    let rawAiResult: {
      pricingRationale?: string;
      salesProjection?: string;
      items?: Array<{
        productId?: string;
        productName?: string;
        optimizedTitle: string;
        optimizedDescription: string;
        badge?: string;
        proposedPriceVnd: number;
        discountPercent?: number;
      }>;
    } | null = null;

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (apiKey && process.env.OPENROUTER_EXECUTION_ENABLED === "true") {
      try {
        const catalogContext = catalogSnapshots
          .map(
            (s) =>
              `- ProductID: "${s.productId}" | Tên: "${s.name}" (Slug: "${s.slug}") | Danh mục: "${s.categoryName}" | Giá gốc: ${s.priceMinor.toLocaleString("vi-VN")} VND`,
          )
          .join("\n");

        const systemPrompt = `Bạn là Giám đốc Quản trị Danh mục & Chuyên gia Định giá Chiến lược (Chief Merchandising & Pricing Strategist) của NovaCommerce (OpenDX CompanyOS).
Nhiệm vụ: Phân tích yêu cầu của Giám đốc điều hành.
ĐẶC BIỆT LƯU Ý:
1. Yêu cầu có thể áp dụng cho MỘT SẢN PHẨM hoặc NHIỀU SẢN PHẨM CÙNG LÚC (ví dụ: toàn bộ dòng laptop, combo phụ kiện, v.v.).
2. Khi người dùng yêu cầu một mức giảm giá phần trăm cụ thể (ví dụ: "giảm 30%"):
   Hãy tính toán chính xác giá mới = Giá gốc * (1 - phần trăm_giảm / 100) và làm tròn đến hàng nghìn gần nhất.
   Ví dụ: Giá gốc 24.990.000đ giảm 30% -> Giá mới là 17.493.000đ (hoặc 17.500.000đ), discountPercent là 30.

Danh mục sản phẩm hiện có trong cơ sở dữ liệu:
${catalogContext}

Trả về DUY NHẤT một chuỗi JSON hợp lệ:
{
  "pricingRationale": "Lý do định giá chiến lược và tác động biên lợi nhuận",
  "salesProjection": "Dự báo tăng trưởng lượng đơn và doanh số kỳ vọng",
  "items": [
    {
      "productId": "ID chính xác của sản phẩm trong danh mục",
      "optimizedTitle": "Tên sản phẩm mới chuẩn SEO",
      "optimizedDescription": "• Tính năng 1\n• Tính năng 2\n• Bảo hành chính hãng",
      "badge": "Nhãn (ví dụ: ⚡ FLASH SALE -30%, 🎓 MÙA TỰU TRƯỜNG)",
      "proposedPriceVnd": số nguyên giá mới sau giảm (VND),
      "discountPercent": phần trăm giảm giá chính xác theo yêu cầu (nguyên từ 1 đến 90)
    }
  ]
}`;

        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://opendx.vn",
            "X-Title": "OpenDX CompanyOS AI Merchandising Batch",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Yêu cầu chiến lược của CEO: ${request.prompt}` },
            ],
            temperature: 0.2,
          }),
        });

        if (res.ok) {
          const data: any = await res.json();
          const content = data.choices?.[0]?.message?.content?.trim();
          if (content) {
            const cleanJson = content.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
            rawAiResult = JSON.parse(cleanJson);
          }
        }
      } catch (err) {
        console.error("OpenRouter batch proposal generation failed:", err);
      }
    }

    // Extract requested percent if explicitly mentioned in prompt (e.g. "giảm 30%", "giảm giá 30%", "-30%", "30%")
    const percentMatch =
      request.prompt.match(/(?:giảm\s*(?:giá)?|sale|discount|ưu đãi|-)\s*(\d+)\s*%/i) ||
      request.prompt.match(/(\d+)\s*%/);
    const explicitPercent = percentMatch && percentMatch[1] ? parseInt(percentMatch[1], 10) : undefined;

    // 2. Build Merchandising Items from AI response or smart matching
    const items: MerchandisingItemDto[] = [];
    const pricingRationale =
      rawAiResult?.pricingRationale ||
      "Mức giảm giá chiến lược giúp tối ưu tỷ lệ chuyển đổi, giải phóng hàng tồn và kích cầu tiêu dùng hiệu quả.";
    const salesProjection =
      rawAiResult?.salesProjection ||
      "Dự kiến thúc đẩy lượng bán ra tăng trưởng từ 35% đến 50% trong đợt chiến dịch.";

    if (rawAiResult?.items && Array.isArray(rawAiResult.items) && rawAiResult.items.length > 0) {
      for (const aiItem of rawAiResult.items) {
        const snapshot = catalogSnapshots.find(
          (s) =>
            s.productId === aiItem.productId ||
            (aiItem.productName && s.name.toLowerCase().includes(aiItem.productName.toLowerCase())),
        );
        if (snapshot) {
          const discountPercent =
            explicitPercent !== undefined
              ? explicitPercent
              : aiItem.discountPercent
                ? Number(aiItem.discountPercent)
                : 30;
          const proposedPrice =
            explicitPercent !== undefined
              ? Math.round((snapshot.priceMinor * (100 - explicitPercent)) / 100)
              : aiItem.proposedPriceVnd
                ? Number(aiItem.proposedPriceVnd)
                : Math.round((snapshot.priceMinor * (100 - discountPercent)) / 100);
          const savingAmountVnd = Math.max(0, snapshot.priceMinor - proposedPrice);

          // Guarantee badge displays the exact discount percent
          let rawBadge = aiItem.badge || `⚡ FLASH SALE -${discountPercent}%`;
          if (rawBadge.includes("%")) {
            rawBadge = rawBadge.replace(/-\d+%/g, `-${discountPercent}%`).replace(/\d+%/g, `${discountPercent}%`);
          } else {
            rawBadge = `${rawBadge} -${discountPercent}%`;
          }

          items.push({
            targetProductId: snapshot.productId,
            targetVariantId: snapshot.variantId,
            productName: snapshot.name,
            productSlug: snapshot.slug,
            categoryName: snapshot.categoryName,
            optimizedTitle: aiItem.optimizedTitle || `${snapshot.name} - Ưu Đãi Mới`,
            optimizedDescription: aiItem.optimizedDescription || snapshot.description,
            badge: rawBadge,
            originalPriceVnd: snapshot.priceMinor,
            proposedPriceVnd: proposedPrice,
            discountPercent,
            savingAmountVnd,
          });
        }
      }
    }

    // Fallback if AI didn't return matching items
    if (items.length === 0) {
      const promptLower = request.prompt.toLowerCase();
      const matchedSnapshots = catalogSnapshots.filter(
        (s) =>
          promptLower.includes(s.name.toLowerCase()) ||
          promptLower.includes(s.slug.toLowerCase()) ||
          promptLower.includes(s.categoryName.toLowerCase()),
      );
      const targetSnapshots = matchedSnapshots.length > 0 ? matchedSnapshots : [catalogSnapshots[0]!];
      const discountPercent = explicitPercent || 30;

      for (const snapshot of targetSnapshots) {
        const proposedPrice = Math.round((snapshot.priceMinor * (100 - discountPercent)) / 100);
        items.push({
          targetProductId: snapshot.productId,
          targetVariantId: snapshot.variantId,
          productName: snapshot.name,
          productSlug: snapshot.slug,
          categoryName: snapshot.categoryName,
          optimizedTitle: `${snapshot.name} - Mùa Tựu Trường - Giảm ${discountPercent}%`,
          optimizedDescription: `• Sản phẩm chính hãng NovaCommerce tối ưu cho người dùng hiện đại.\n• Chất liệu cao cấp, độ bền vượt trội và tính năng đa dạng.\n• Bảo hành chính hãng 12 tháng kèm dịch vụ hỗ trợ 24/7.`,
          badge: `⚡ FLASH SALE -${discountPercent}%`,
          originalPriceVnd: snapshot.priceMinor,
          proposedPriceVnd: proposedPrice,
          discountPercent,
          savingAmountVnd: snapshot.priceMinor - proposedPrice,
        });
      }
    }

    const proposalId = this.generateId();
    const primaryItem = items[0]!;

    const proposal: MerchandisingProposalDto = {
      id: proposalId,
      prompt: request.prompt,
      items,
      targetProductId: primaryItem.targetProductId,
      targetVariantId: primaryItem.targetVariantId,
      productName: primaryItem.productName,
      productSlug: primaryItem.productSlug,
      categoryName: primaryItem.categoryName,
      optimizedTitle: primaryItem.optimizedTitle,
      optimizedDescription: primaryItem.optimizedDescription,
      badge: primaryItem.badge,
      originalPriceVnd: primaryItem.originalPriceVnd,
      proposedPriceVnd: primaryItem.proposedPriceVnd,
      discountPercent: primaryItem.discountPercent,
      savingAmountVnd: primaryItem.savingAmountVnd,
      pricingRationale,
      salesProjection,
      status: "pending_approval",
      createdAt: this.now(),
    };

    this.proposals.set(proposalId, proposal);
    return proposal;
  }

  async getProposal(proposalId: string): Promise<MerchandisingProposalDto | null> {
    return this.proposals.get(proposalId) ?? null;
  }

  async applyProposal(
    request: ApplyMerchandisingProposalRequestDto,
    context: CatalogCommandContext,
  ): Promise<ApplyMerchandisingResultDto> {
    const proposal = this.proposals.get(request.proposalId);
    if (!proposal) {
      throw new CatalogApplicationError("NOT_FOUND", `Không tìm thấy bản đề xuất ID: ${request.proposalId}`);
    }

    const appliedTimestamp = this.now();
    const resultItems: ApplyMerchandisingResultItemDto[] = [];

    await this.transactions.run(async (session) => {
      for (const item of proposal.items) {
        const titleToApply = item.optimizedTitle;
        const descriptionToApply = item.optimizedDescription;

        // 1. Update products table
        await session.query(
          `UPDATE products
           SET name = $1, description = $2, attributes = attributes || $3::jsonb, updated_at = NOW(), version = version + 1
           WHERE id = $4`,
          [
            titleToApply,
            descriptionToApply,
            JSON.stringify({ badge: item.badge, optimizedBy: "ai_merchandising", optimizedAt: appliedTimestamp }),
            item.targetProductId,
          ],
        );

        // 2. Fetch ALL active variants of this product to update all of them proportionally!
        const variantsResult = await session.query<{
          id: string;
          amount_minor: string | number;
        }>(
          `SELECT v.id, COALESCE(pr.amount_minor, 0) as amount_minor
           FROM product_variants v
           LEFT JOIN product_prices pr ON pr.variant_id = v.id AND (pr.valid_to IS NULL OR pr.valid_to > NOW())
           WHERE v.product_id = $1 AND v.status = 'active'`,
          [item.targetProductId],
        );

        for (const variant of variantsResult.rows) {
          const currentVariantPrice = Number(variant.amount_minor);
          const newVariantPrice = Math.round((currentVariantPrice * (100 - item.discountPercent)) / 100);

          // Expire current price
          await session.query(
            `UPDATE product_prices
             SET valid_to = NOW()
             WHERE variant_id = $1 AND (valid_to IS NULL OR valid_to > NOW())`,
            [variant.id],
          );

          // Insert new active price for this variant
          const newPriceId = this.generateId();
          await session.query(
            `INSERT INTO product_prices
              (id, variant_id, amount_minor, currency, tax_inclusive, valid_from, valid_to, created_by)
             VALUES ($1, $2, $3, 'VND', true, NOW(), NULL, $4)`,
            [newPriceId, variant.id, newVariantPrice, context.actorId],
          );
        }

        // 3. Append catalog audit
        await this.audit.append(session, {
          id: this.generateId(),
          actorId: context.actorId,
          action: "catalog.ai_merchandising.applied",
          resourceType: "product",
          resourceId: item.targetProductId,
          outcome: "success",
          correlationId: context.correlationId,
          metadata: {
            proposalId: proposal.id,
            discountPercent: item.discountPercent,
            variantsUpdated: variantsResult.rows.length,
            badge: item.badge,
            title: titleToApply,
          },
          occurredAt: appliedTimestamp,
        });

        resultItems.push({
          productId: item.targetProductId,
          productName: titleToApply,
          originalPriceVnd: item.originalPriceVnd,
          newPriceVnd: item.proposedPriceVnd,
          discountPercent: item.discountPercent,
          badge: item.badge,
        });
      }
    });

    const updatedProposal: MerchandisingProposalDto = {
      ...proposal,
      status: "applied",
    };
    this.proposals.set(proposal.id, updatedProposal);

    const primaryResult = resultItems[0]!;

    return {
      success: true,
      proposalId: proposal.id,
      updatedCount: resultItems.length,
      items: resultItems,
      appliedAt: appliedTimestamp,
      productId: primaryResult.productId,
      productName: primaryResult.productName,
      originalPriceVnd: primaryResult.originalPriceVnd,
      newPriceVnd: primaryResult.newPriceVnd,
      discountPercent: primaryResult.discountPercent,
      badge: primaryResult.badge,
    };
  }
}
