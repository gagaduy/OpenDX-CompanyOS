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
import type {
  CampaignProposalDto,
  CampaignItemDto,
  ActiveCampaignDto,
} from "../../dtos/campaign-merchandising.dto";
import type { CampaignVisualGenerator } from "../../ports/campaign-visual-generator.port";
import type { ProductMediaStorage } from "../../storage/product-media.storage";
import { PostgresqlCampaignRepository } from "../../../infrastructure/repositories/implementations/postgresql-campaign.repository";
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
  readonly storageKey?: string;
}

export interface GenerateCampaignProposalInput {
  readonly prompt: string;
  readonly durationDays?: number;
  readonly discountPercent?: number;
  readonly themeKey?: string;
}

export interface ActivateCampaignOverrides {
  readonly endDate?: string;
  readonly excludedItemIds?: readonly string[];
}

export class AiMerchandisingService {
  private readonly proposals = new Map<string, MerchandisingProposalDto>();

  constructor(
    private readonly transactions: TransactionRunner,
    private readonly audit: CatalogAuditRepository,
    private readonly visualGenerator?: CampaignVisualGenerator,
    private readonly mediaStorage?: ProductMediaStorage,
    private readonly campaignRepository: PostgresqlCampaignRepository = new PostgresqlCampaignRepository(),
    private readonly generateId: () => string = randomUUID,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  // ---------------------------------------------------------------------------
  // CAMPAIGN ENGINE METHODS (DYNAMIC, TIME-BOUNDED, MULTI-MODAL)
  // ---------------------------------------------------------------------------

  async generateCampaignProposal(
    request: GenerateCampaignProposalInput,
    context?: { actorId?: string },
  ): Promise<CampaignProposalDto> {
    if (!request.prompt?.trim()) {
      throw new CatalogApplicationError("VALIDATION_ERROR", "Yêu cầu chiến dịch không được để trống.");
    }

    // 1. Duration extraction (default 7 days, bounded 1 - 60)
    let durationDays = request.durationDays;
    if (!durationDays) {
      const durationMatch = request.prompt.match(/(\d+)\s*(?:ngày|ngay|day|days)/i);
      durationDays = durationMatch && durationMatch[1] ? parseInt(durationMatch[1], 10) : 7;
    }
    durationDays = Math.min(Math.max(durationDays, 1), 60);

    // 2. Discount extraction (default 20%, bounded 1 - 90)
    let discountPercent = request.discountPercent;
    if (!discountPercent) {
      const percentMatch =
        request.prompt.match(/(?:giảm\s*(?:giá)?|sale|discount|ưu đãi|-)\s*(\d+)\s*%/i) ||
        request.prompt.match(/(\d+)\s*%/);
      discountPercent = percentMatch && percentMatch[1] ? parseInt(percentMatch[1], 10) : 20;
    }
    discountPercent = Math.min(Math.max(discountPercent, 1), 90);

    // 3. Theme inference
    let themeKey = request.themeKey;
    if (!themeKey) {
      const promptLower = request.prompt.toLowerCase();
      if (promptLower.includes("trung thu") || promptLower.includes("mid autumn") || promptLower.includes("đèn lồng")) {
        themeKey = "mid_autumn";
      } else if (promptLower.includes("tựu trường") || promptLower.includes("khai giảng") || promptLower.includes("school") || promptLower.includes("sinh viên")) {
        themeKey = "back_to_school";
      } else if (promptLower.includes("flash sale") || promptLower.includes("chớp nhoáng") || promptLower.includes("giờ vàng")) {
        themeKey = "flash_sale";
      } else if (promptLower.includes("black friday") || promptLower.includes("thứ sáu đen")) {
        themeKey = "black_friday";
      } else {
        themeKey = "general";
      }
    }

    // Default badge text based on theme
    let badgeText = "";
    switch (themeKey) {
      case "mid_autumn":
        badgeText = `🏮 TẾT TRUNG THU -${discountPercent}%`;
        break;
      case "back_to_school":
        badgeText = `🎓 MÙA TỰU TRƯỜNG -${discountPercent}%`;
        break;
      case "flash_sale":
        badgeText = `⚡ FLASH SALE -${discountPercent}%`;
        break;
      case "black_friday":
        badgeText = `🏷️ BLACK FRIDAY -${discountPercent}%`;
        break;
      default:
        badgeText = `✨ ƯU ĐÃI ĐẶC BIỆT -${discountPercent}%`;
        break;
    }

    // 4. Fetch live catalog snapshot from PostgreSQL
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
        storage_key: string | null;
      }>(`
        SELECT 
          p.id as product_id,
          p.name,
          p.slug,
          p.description,
          COALESCE(c.name, 'Chung') as category_name,
          v.id as variant_id,
          v.sku,
          COALESCE(pr.amount_minor, 0) as price_minor,
          pm.object_key as storage_key
        FROM products p
        JOIN product_variants v ON v.product_id = p.id AND v.status = 'active'
        JOIN product_prices pr ON pr.variant_id = v.id AND pr.valid_from <= NOW() AND (pr.valid_to IS NULL OR pr.valid_to > NOW())
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN product_media pm ON pm.product_id = p.id AND pm.is_primary = true
        WHERE p.status = 'published'
        ORDER BY p.created_at ASC
      `);

      return result.rows
        .filter((r) => r.variant_id && Number(r.price_minor) > 0)
        .map((r): CatalogProductSnapshot => ({
          productId: r.product_id,
          name: r.name,
          slug: r.slug,
          description: r.description,
          categoryName: r.category_name,
          variantId: r.variant_id,
          sku: r.sku,
          priceMinor: Number(r.price_minor),
          storageKey: r.storage_key ?? undefined,
        }));
    });

    if (catalogSnapshots.length === 0) {
      throw new CatalogApplicationError("NOT_FOUND", "Cơ sở dữ liệu danh mục hiện đang trống.");
    }

    // 5. LLM Call via OpenRouter if enabled
    let rawAiResult: {
      campaignName?: string;
      pricingRationale?: string;
      salesProjection?: string;
      themeKey?: string;
      badgeText?: string;
      items?: Array<{
        productId: string;
        optimizedTitle: string;
        optimizedDescription: string;
        badge?: string;
      }>;
    } | null = null;

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (apiKey && process.env.OPENROUTER_EXECUTION_ENABLED === "true") {
      try {
        const catalogContext = catalogSnapshots
          .map((s) => `- ProductID: "${s.productId}" | Tên: "${s.name}" (Slug: "${s.slug}") | Danh mục: "${s.categoryName}" | Giá gốc: ${s.priceMinor.toLocaleString("vi-VN")} VND`)
          .join("\n");

        const systemPrompt = `Bạn là Giám đốc Quản trị Danh mục & Định giá Chiến lược (Chief Merchandising & Pricing Strategist).
Nhiệm vụ: Tạo chiến dịch bán hàng động theo yêu cầu của Ban Giám đốc.
Danh mục sản phẩm hiện có:
${catalogContext}

Quy tắc lựa chọn sản phẩm:
- Nếu yêu cầu chỉ định sản phẩm hoặc danh mục cụ thể (ví dụ: chỉ laptop, chỉ Nova Phone Pro, chuột, bàn phím, phụ kiện...), CHỈ đưa đúng các sản phẩm đó vào mảng "items".
- Nếu yêu cầu là chung chung (toàn bộ, tất cả, tri ân, xả kho...), hãy đưa toàn bộ sản phẩm vào mảng "items".

Yêu cầu định dạng trả về DUY NHẤT một chuỗi JSON hợp lệ:
{
  "campaignName": "Tên chiến dịch hấp dẫn (ví dụ: Đại Tiệc Mừng Tết Trung Thu)",
  "themeKey": "mid_autumn | back_to_school | flash_sale | black_friday | general",
  "badgeText": "Nhãn huy hiệu gắn lên sản phẩm (ví dụ: 🏮 TẾT TRUNG THU -20%)",
  "pricingRationale": "Lý do định giá và chiến lược biên lợi nhuận",
  "salesProjection": "Dự kiến tăng trưởng lượng bán và doanh thu",
  "items": [
    {
      "productId": "ID chính xác của sản phẩm trong danh mục",
      "optimizedTitle": "Tiêu đề mới tối ưu SEO và kích thích mua hàng",
      "optimizedDescription": "• Mô tả ngắn gọn 3 dòng nổi bật tính năng và bảo hành chính hãng",
      "badge": "Nhãn huy hiệu riêng hoặc trùng với badgeText chung"
    }
  ]
}`;

        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://opendx.vn",
            "X-Title": "OpenDX Dynamic Campaign Engine",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Chiến lược CEO yêu cầu: ${request.prompt}` },
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
        console.error("OpenRouter campaign proposal generation failed:", err);
      }
    }

    if (rawAiResult?.themeKey && ["mid_autumn", "back_to_school", "flash_sale", "black_friday", "general"].includes(rawAiResult.themeKey)) {
      themeKey = rawAiResult.themeKey;
    }
    if (rawAiResult?.badgeText) {
      badgeText = rawAiResult.badgeText;
    }

    const campaignId = this.generateId();
    const campaignName =
      rawAiResult?.campaignName ||
      `Chiến dịch ${themeKey === "mid_autumn" ? "Tết Trung Thu" : themeKey === "back_to_school" ? "Mùa Tựu Trường" : themeKey === "flash_sale" ? "Flash Sale Giờ Vàng" : themeKey === "black_friday" ? "Black Friday" : "Ưu Đãi Đặc Biệt"} - Giảm ${discountPercent}%`;

    const slug = `${themeKey}-${discountPercent}pct-${campaignId.slice(0, 8)}`;
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + durationDays * 24 * 3600 * 1000);

    // Filter products matching prompt or take target products
    let selectedSnapshots: CatalogProductSnapshot[] = [];

    // 1. If LLM returned specific items matching prompt intent, prioritize LLM selection
    if (rawAiResult?.items && rawAiResult.items.length > 0) {
      const aiProductIds = new Set(rawAiResult.items.map((it) => it.productId));
      const matchedFromAi = catalogSnapshots.filter((s) => aiProductIds.has(s.productId));
      if (matchedFromAi.length > 0 && matchedFromAi.length < catalogSnapshots.length) {
        selectedSnapshots = matchedFromAi;
      }
    }

    // 2. Keyword & semantic matching across name, slug, category, and Vietnamese aliases
    if (selectedSnapshots.length === 0) {
      const promptLower = request.prompt.toLowerCase();

      const SYNONYM_MAP: Record<string, string[]> = {
        laptop: ["laptop", "máy tính xách tay"],
        phone: ["phone", "điện thoại", "smartphone"],
        tablet: ["tablet", "máy tính bảng", "ipad"],
        watch: ["watch", "đồng hồ", "smart watch"],
        mouse: ["mouse", "chuột"],
        keyboard: ["keyboard", "bàn phím"],
        "solid-state": ["ssd", "ổ cứng", "solid-state"],
        graphics: ["vga", "card", "đồ họa", "graphics"],
        accessories: ["phụ kiện", "accessories"],
        components: ["linh kiện", "components"],
      };

      const matchedSnapshots = catalogSnapshots.filter((s) => {
        const nameLower = s.name.toLowerCase();
        const slugLower = s.slug.toLowerCase();
        const catLower = s.categoryName.toLowerCase();

        // Exact substring in prompt (e.g. "nova laptop pro" or "laptop pro")
        if (promptLower.includes(nameLower) || promptLower.includes(slugLower) || promptLower.includes(catLower)) {
          return true;
        }

        // Check if prompt mentions a keyword or synonym from product
        for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
          const productMatchesKey = nameLower.includes(key) || slugLower.includes(key) || catLower.includes(key);
          if (productMatchesKey && synonyms.some((syn) => promptLower.includes(syn))) {
            return true;
          }
        }

        return false;
      });

      selectedSnapshots = matchedSnapshots.length > 0 ? matchedSnapshots : catalogSnapshots;
    }

    // Deduplicate by productId to take primary variant
    const seenProductIds = new Set<string>();
    const uniqueSnapshots: CatalogProductSnapshot[] = [];
    for (const snap of selectedSnapshots) {
      if (!seenProductIds.has(snap.productId)) {
        seenProductIds.add(snap.productId);
        uniqueSnapshots.push(snap);
      }
    }

    // 6. Build items and synthesize visual badge overlays via Sharp
    const items: CampaignItemDto[] = [];
    const dbItemsToInsert: Array<{
      id: string;
      productId: string;
      variantId: string;
      originalPriceMinor: bigint;
      campaignPriceMinor: bigint;
      originalMediaStorageKey?: string;
      campaignMediaStorageKey?: string;
      optimizedTitle: string;
      optimizedDescription: string;
      badge: string;
    }> = [];

    for (const snap of uniqueSnapshots) {
      const originalPriceVnd = snap.priceMinor;
      const campaignPriceVnd = Math.round((originalPriceVnd * (100 - discountPercent)) / 100);
      const savingAmountVnd = Math.max(0, originalPriceVnd - campaignPriceVnd);
      const itemId = this.generateId();

      const aiMatch = rawAiResult?.items?.find((it) => it.productId === snap.productId);
      const optimizedTitle = aiMatch?.optimizedTitle || `${snap.name} - ${badgeText}`;
      const optimizedDescription = aiMatch?.optimizedDescription || snap.description;
      const itemBadge = aiMatch?.badge || badgeText;

      let campaignMediaStorageKey: string | undefined = undefined;

      // Image generation via Sharp Campaign Visual Adapter
      if (this.visualGenerator && this.mediaStorage && snap.storageKey) {
        try {
          const rawBytes = await this.mediaStorage.get(snap.storageKey);
          const sourceBuffer = Buffer.from(rawBytes);
          const webpBuffer = await this.visualGenerator.generateBadgeOverlay({
            sourceBuffer,
            themeKey,
            badgeText: itemBadge,
            discountPercent,
          });

          const derivedKey = `campaigns/${campaignId}/${snap.variantId}.webp`;
          await this.mediaStorage.upload(derivedKey, webpBuffer, "image/webp");
          campaignMediaStorageKey = derivedKey;
        } catch (err) {
          console.warn(`[CampaignEngine] Failed to generate visual overlay for ${snap.productId}:`, err);
        }
      }

      const originalMediaUrl = snap.storageKey
        ? `/v1/admin/catalog/media-content?key=${encodeURIComponent(snap.storageKey)}`
        : undefined;
      const campaignMediaUrl = campaignMediaStorageKey
        ? `/v1/admin/catalog/media-content?key=${encodeURIComponent(campaignMediaStorageKey)}`
        : undefined;

      items.push({
        id: itemId,
        productId: snap.productId,
        variantId: snap.variantId,
        productName: snap.name,
        productSlug: snap.slug,
        originalPriceVnd,
        campaignPriceVnd,
        discountPercent,
        savingAmountVnd,
        originalMediaUrl,
        campaignMediaUrl,
        optimizedTitle,
        optimizedDescription,
        badge: itemBadge,
      });

      dbItemsToInsert.push({
        id: itemId,
        productId: snap.productId,
        variantId: snap.variantId,
        originalPriceMinor: BigInt(originalPriceVnd),
        campaignPriceMinor: BigInt(campaignPriceVnd),
        originalMediaStorageKey: snap.storageKey,
        campaignMediaStorageKey,
        optimizedTitle,
        optimizedDescription,
        badge: itemBadge,
      });
    }

    const pricingRationale =
      rawAiResult?.pricingRationale ||
      "Tối ưu biên lợi nhuận, thúc đẩy lượng đơn và giải phóng hàng tồn thông qua chiết khấu chiến lược.";
    const salesProjection =
      rawAiResult?.salesProjection ||
      "Dự kiến lượng bán ra tăng trưởng từ 30% đến 55% trong toàn thời gian chiến dịch.";

    // 7. Persist Draft Campaign into PostgreSQL
    await this.transactions.run(async (session) => {
      await this.campaignRepository.createCampaign(session, {
        id: campaignId,
        name: campaignName,
        slug,
        prompt: request.prompt,
        themeKey,
        badgeText,
        discountPercent,
        startTime,
        endTime,
        status: "draft",
        createdBy: context?.actorId ?? "system",
        items: dbItemsToInsert,
      });
    });

    return {
      id: campaignId,
      name: campaignName,
      slug,
      prompt: request.prompt,
      themeKey,
      badgeText,
      discountPercent,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationDays,
      status: "draft",
      items,
      totalProducts: items.length,
      pricingRationale,
      salesProjection,
    };
  }

  async activateCampaign(
    campaignId: string,
    context: CatalogCommandContext,
    overrides?: ActivateCampaignOverrides,
  ): Promise<{ success: boolean; campaignId: string; activatedAt: string }> {
    const activatedAt = this.now();

    await this.transactions.run(async (session) => {
      const campaign = await this.campaignRepository.getById(session, campaignId);
      if (!campaign) {
        throw new CatalogApplicationError("NOT_FOUND", `Không tìm thấy chiến dịch ID: ${campaignId}`);
      }
      if (campaign.status !== "draft") {
        throw new CatalogApplicationError("CONFLICT", `Chiến dịch không ở trạng thái nháp (trạng thái: ${campaign.status})`);
      }

      const targetEndTime = overrides?.endDate ? new Date(overrides.endDate) : new Date(campaign.endTime);
      const excludedSet = new Set(overrides?.excludedItemIds ?? []);

      // 1. Update campaign status to active with actual dates
      await session.query(
        `UPDATE merchandising_campaigns 
         SET status = 'active', start_time = NOW(), end_time = $1, updated_at = NOW() 
         WHERE id = $2`,
        [targetEndTime, campaignId],
      );

      // 2. For each active item: insert time-bounded price & update product attributes
      for (const item of campaign.items) {
        if (excludedSet.has(item.id)) continue;

        // Insert new time-bounded price row in product_prices
        const priceId = this.generateId();
        await session.query(
          `INSERT INTO product_prices 
            (id, variant_id, amount_minor, currency, tax_inclusive, valid_from, valid_to, created_by)
           VALUES ($1, $2, $3, 'VND', true, NOW(), $4, $5)`,
          [priceId, item.variantId, item.campaignPriceVnd, targetEndTime, context.actorId],
        );

        // Update product attributes with campaign badge
        await session.query(
          `UPDATE products
           SET attributes = attributes || $1::jsonb, updated_at = NOW(), version = version + 1
           WHERE id = $2`,
          [
            JSON.stringify({
              badge: item.badge,
              campaignId,
              campaignActivatedAt: activatedAt,
            }),
            item.productId,
          ],
        );

        // Update primary product_media to campaign overlay if available
        if (item.campaignMediaUrl) {
          const keyParam = new URL(item.campaignMediaUrl, "http://dummy").searchParams.get("key");
          if (keyParam) {
            await session.query(
              `UPDATE product_media 
               SET object_key = $1, content_type = 'image/webp'
               WHERE product_id = $2 AND is_primary = true`,
              [keyParam, item.productId],
            );
          }
        }
      }

      await this.campaignRepository.updateStatus(session, campaignId, "active");

      // Append audit record
      await this.audit.append(session, {
        id: this.generateId(),
        actorId: context.actorId,
        action: "catalog.campaign.activated",
        resourceType: "campaign",
        resourceId: campaignId,
        outcome: "success",
        correlationId: context.correlationId,
        metadata: {
          campaignName: campaign.name,
          discountPercent: campaign.discountPercent,
          endTime: targetEndTime.toISOString(),
          activeItemCount: campaign.items.length - excludedSet.size,
        },
        occurredAt: activatedAt,
      });
    });

    return {
      success: true,
      campaignId,
      activatedAt,
    };
  }

  async revertCampaign(
    campaignId: string,
    context: CatalogCommandContext,
  ): Promise<{ success: boolean; campaignId: string; revertedAt: string }> {
    const revertedAt = this.now();

    await this.transactions.run(async (session) => {
      const campaign = await this.campaignRepository.getById(session, campaignId);
      if (!campaign) {
        throw new CatalogApplicationError("NOT_FOUND", `Không tìm thấy chiến dịch ID: ${campaignId}`);
      }

      // 1. Expire all campaign prices immediately (valid_to = NOW())
      await session.query(
        `UPDATE product_prices 
         SET valid_to = NOW()
         WHERE variant_id IN (SELECT variant_id FROM merchandising_campaign_items WHERE campaign_id = $1)
           AND valid_to > NOW()`,
        [campaignId],
      );

      // 2. Restore original media storage key
      await session.query(
        `UPDATE product_media pm
         SET object_key = mci.original_media_storage_key
         FROM merchandising_campaign_items mci
         WHERE pm.product_id = mci.product_id
           AND mci.campaign_id = $1
           AND mci.original_media_storage_key IS NOT NULL
           AND pm.is_primary = true`,
        [campaignId],
      );

      // 3. Remove campaign badge from product attributes
      await session.query(
        `UPDATE products
         SET attributes = attributes - 'badge' - 'campaignId' - 'campaignActivatedAt', updated_at = NOW()
         WHERE id IN (SELECT product_id FROM merchandising_campaign_items WHERE campaign_id = $1)`,
        [campaignId],
      );

      // 4. Update campaign status to reverted
      await this.campaignRepository.updateStatus(session, campaignId, "reverted");

      // Append audit record
      await this.audit.append(session, {
        id: this.generateId(),
        actorId: context.actorId,
        action: "catalog.campaign.reverted",
        resourceType: "campaign",
        resourceId: campaignId,
        outcome: "success",
        correlationId: context.correlationId,
        metadata: {
          campaignName: campaign.name,
        },
        occurredAt: revertedAt,
      });
    });

    return {
      success: true,
      campaignId,
      revertedAt,
    };
  }

  async getActiveCampaign(): Promise<ActiveCampaignDto | null> {
    return this.transactions.run(async (session) => {
      // First check if active campaign expired naturally
      const expiredCheck = await session.query<{ id: string }>(
        `SELECT id FROM merchandising_campaigns WHERE status = 'active' AND end_time <= NOW() LIMIT 1`,
      );
      if (expiredCheck?.rows?.[0]) {
        const expiredId = expiredCheck.rows[0].id;
        await this.campaignRepository.updateStatus(session, expiredId, "completed");

        // Restore media and attributes
        await session.query(
          `UPDATE product_media pm
           SET object_key = mci.original_media_storage_key
           FROM merchandising_campaign_items mci
           WHERE pm.product_id = mci.product_id
             AND mci.campaign_id = $1
             AND mci.original_media_storage_key IS NOT NULL
             AND pm.is_primary = true`,
          [expiredId],
        );

        await session.query(
          `UPDATE products
           SET attributes = attributes - 'badge' - 'campaignId' - 'campaignActivatedAt', updated_at = NOW()
           WHERE id IN (SELECT product_id FROM merchandising_campaign_items WHERE campaign_id = $1)`,
          [expiredId],
        );

        return null;
      }

      return this.campaignRepository.findActive(session);
    });
  }

  // ---------------------------------------------------------------------------
  // LEGACY PROPOSAL METHODS (PRESERVED FOR BACKWARD COMPATIBILITY)
  // ---------------------------------------------------------------------------

  async generateProposal(
    request: GenerateMerchandisingProposalRequestDto,
  ): Promise<MerchandisingProposalDto> {
    if (!request.prompt.trim()) {
      throw new CatalogApplicationError("VALIDATION_ERROR", "Yêu cầu tối ưu danh mục không được để trống.");
    }

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
1. Yêu cầu có thể áp dụng cho MỘT SẢN PHẨM hoặc NHIỀU SẢN PHẨM CÙNG LÚC.
2. Khi người dùng yêu cầu một mức giảm giá phần trăm cụ thể (ví dụ: "giảm 30%"):
   Hãy tính toán chính xác giá mới = Giá gốc * (1 - phần trăm_giảm / 100) và làm tròn đến hàng nghìn gần nhất.

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
      "optimizedDescription": "• Tính năng 1\\n• Tính năng 2\\n• Bảo hành chính hãng",
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

    const percentMatch =
      request.prompt.match(/(?:giảm\s*(?:giá)?|sale|discount|ưu đãi|-)\s*(\d+)\s*%/i) ||
      request.prompt.match(/(\d+)\s*%/);
    const explicitPercent = percentMatch && percentMatch[1] ? parseInt(percentMatch[1], 10) : undefined;

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
      if (this.campaignRepository) {
        const campaign = await this.transactions.runReadOnly(async (session) => {
          return this.campaignRepository.getById(session, request.proposalId);
        });
        if (campaign) {
          await this.activateCampaign(campaign.id, context);
          return {
            success: true,
            proposalId: campaign.id,
            updatedCount: campaign.items.length,
            items: campaign.items.map((it) => ({
              productId: it.productId,
              productName: it.optimizedTitle,
              originalPriceVnd: it.originalPriceVnd,
              newPriceVnd: it.campaignPriceVnd,
              discountPercent: campaign.discountPercent,
              badge: it.badge,
            })),
            appliedAt: this.now(),
          };
        }
      }
      throw new CatalogApplicationError("NOT_FOUND", `Không tìm thấy bản đề xuất ID: ${request.proposalId}`);
    }

    const appliedTimestamp = this.now();
    const resultItems: ApplyMerchandisingResultItemDto[] = [];

    await this.transactions.run(async (session) => {
      for (const item of proposal.items) {
        const titleToApply = item.optimizedTitle;
        const descriptionToApply = item.optimizedDescription;

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

          await session.query(
            `UPDATE product_prices
             SET valid_to = NOW()
             WHERE variant_id = $1 AND (valid_to IS NULL OR valid_to > NOW())`,
            [variant.id],
          );

          const newPriceId = this.generateId();
          await session.query(
            `INSERT INTO product_prices
              (id, variant_id, amount_minor, currency, tax_inclusive, valid_from, valid_to, created_by)
             VALUES ($1, $2, $3, 'VND', true, NOW(), NULL, $4)`,
            [newPriceId, variant.id, newVariantPrice, context.actorId],
          );
        }

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
