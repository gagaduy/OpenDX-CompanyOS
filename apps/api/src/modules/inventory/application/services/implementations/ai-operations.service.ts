// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  ApplyOperationsRequestDto,
  ApplyOperationsResultDto,
  ApplyOperationsResultItemDto,
  GenerateOperationsProposalRequestDto,
  OperationsProposalDto,
  OperationsProposalItemDto,
  StockRiskClassification,
} from "../../dtos/ai-operations-response.dto";
import { generateOperationsReportDocx } from "../../../infrastructure/generators/operations-report-docx.generator";

interface InventoryDbSnapshot {
  readonly variantId: string;
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly sku: string;
  readonly categoryName: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly priceMinor: number;
}

export class AiOperationsService {
  private readonly proposalsCache = new Map<string, OperationsProposalDto>();

  constructor(
    private readonly database: Pool,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly generateId: () => string = randomUUID,
  ) {}

  async generateOperationsProposal(
    request: GenerateOperationsProposalRequestDto,
  ): Promise<OperationsProposalDto> {
    // 1. Query live inventory, variants, products, and prices from PostgreSQL
    const { rows } = await this.database.query<InventoryDbSnapshot>(`
      SELECT 
        pv.id AS "variantId",
        p.id AS "productId",
        p.name AS "productName",
        p.slug AS "productSlug",
        pv.sku AS "sku",
        COALESCE(c.name, 'Linh kiện & Phụ kiện') AS "categoryName",
        COALESCE(ii.on_hand, 0) AS "onHand",
        COALESCE(ii.reserved, 0) AS "reserved",
        COALESCE(pp.amount_minor, 1000000) AS "priceMinor"
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN inventory_items ii ON ii.variant_id = pv.id
      LEFT JOIN product_prices pp ON pp.variant_id = pv.id AND pp.valid_to IS NULL
      WHERE pv.status = 'active'
      ORDER BY p.id, pv.id;
    `);

    let rawAiResult: {
      inventoryHealthSummary?: string;
      riskAssessment?: string;
      recommendedAction?: string;
      items?: Array<{
        sku?: string;
        variantId?: string;
        productName?: string;
        stockStatus?: StockRiskClassification;
        safetyStockThreshold?: number;
        recommendedRestockQuantity?: number;
        estimatedUnitCostVnd?: number;
        actionRationale?: string;
      }>;
    } | null = null;

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (apiKey && process.env.OPENROUTER_EXECUTION_ENABLED === "true") {
      try {
        const inventoryContext = rows
          .map(
            (r) =>
              `- SKU: "${r.sku}" | Sản phẩm: "${r.productName}" | Tồn kho (On-hand): ${r.onHand} | Đang giữ chỗ: ${r.reserved} | Khả dụng: ${r.onHand - r.reserved} | Giá bán: ${r.priceMinor.toLocaleString("vi-VN")} VND`,
          )
          .join("\n");

        const systemPrompt = `Bạn là Giám đốc Vận hành & Kỹ sư Trưởng Quản lý Kho vận (Chief Operating & Inventory Logistics Engineer) của NovaCommerce (OpenDX CompanyOS).
Nhiệm vụ: Phân tích thực trạng dữ liệu kho hàng thực tế trong database theo chỉ đạo của Ban Giám đốc.

Nguyên tắc tính toán nghiệp vụ:
1. Tính Tồn khả dụng (Available) = Tồn thực tế (On-hand) - Tồn giữ chỗ (Reserved).
2. Phân loại trạng thái kho (StockRiskClassification):
   - "critical_low": Nếu Tồn khả dụng <= 5 (hoặc theo ngưỡng người dùng yêu cầu). Cần nhập khẩn cấp.
   - "slow_moving": Nếu Tồn khả dụng >= 25 nhưng nhu cầu thấp (ứ đọng vốn).
   - "balanced": Tồn kho mức an toàn ổn định.
3. Dự toán chi phí nhập hàng (Unit Cost ước tính ~60% - 70% giá bán lẻ).
4. Tính toán số lượng nhập bổ sung hợp lý dựa trên chỉ đạo cụ thể của người dùng.

Dữ liệu kho hàng thực tế trong cơ sở dữ liệu PostgreSQL:
${inventoryContext}

Trả về DUY NHẤT một chuỗi JSON hợp lệ:
{
  "inventoryHealthSummary": "Tóm tắt tổng thể tình trạng kho bãi, tỷ lệ SKU sẵn sàng đáp ứng đơn",
  "riskAssessment": "Phân tích các nút thắt rủi ro chuỗi cung ứng và cảnh báo nguy cơ đứt gãy",
  "recommendedAction": "Kế hoạch hành động cụ thể cho đội ngũ kho bãi và kế toán kho",
  "items": [
    {
      "sku": "Mã SKU chính xác trong bảng",
      "stockStatus": "critical_low | balanced | slow_moving",
      "safetyStockThreshold": 10,
      "recommendedRestockQuantity": số_lượng_nhập_thêm_đề_xuất,
      "estimatedUnitCostVnd": giá_vốn_ước_tính_1_đơn_vị,
      "actionRationale": "Lý do nhập hoặc điều phối cho SKU này"
    }
  ]
}`;

        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://opendx.vn",
            "X-Title": "OpenDX CompanyOS AI Operations & Inventory",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Yêu cầu chỉ đạo của Ban Giám đốc: ${request.prompt}` },
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
        console.error("OpenRouter operations proposal generation failed:", err);
      }
    }

    // 2. Build items from AI response or smart matching
    const items: OperationsProposalItemDto[] = [];
    const promptLower = request.prompt.toLowerCase();

    // Check if user requested a specific restock quantity (e.g. "nhập 20 cái", "nhập thêm 30 chiếc", "bổ sung 50")
    const qtyMatch = request.prompt.match(/(?:nhập|bổ sung|thêm)\s*(?:thêm)?\s*(\d+)\s*(?:cái|chiếc|đơn vị|sản phẩm)?/i);
    const explicitRestockQty = qtyMatch && qtyMatch[1] ? parseInt(qtyMatch[1], 10) : undefined;

    // Filter relevant rows if user specified a category or product
    const relevantRows = rows.filter((r) => {
      if (promptLower.includes("laptop") && r.productSlug.includes("laptop")) return true;
      if (promptLower.includes("chuột") && r.productSlug.includes("mouse")) return true;
      if (promptLower.includes("bàn phím") && r.productSlug.includes("keyboard")) return true;
      if (promptLower.includes("tai nghe") && r.productSlug.includes("headphones")) return true;
      if (promptLower.includes("điện thoại") && r.productSlug.includes("phone")) return true;
      if (promptLower.includes("đồng hồ") && r.productSlug.includes("watch")) return true;
      if (promptLower.includes("tablet") && r.productSlug.includes("tablet")) return true;
      if (promptLower.includes("linh kiện") || promptLower.includes("phụ kiện")) {
        return (
          r.productSlug.includes("mouse") ||
          r.productSlug.includes("keyboard") ||
          r.productSlug.includes("hub") ||
          r.productSlug.includes("drive") ||
          r.productSlug.includes("card")
        );
      }
      return true; // Default: include all active items
    });

    const targetRows = relevantRows.length > 0 ? relevantRows : rows;

    for (const row of targetRows) {
      const aiMatch = rawAiResult?.items?.find(
        (it) => it.sku === row.sku || (it.variantId && it.variantId === row.variantId),
      );

      const available = Math.max(0, row.onHand - row.reserved);
      const stockStatus: StockRiskClassification =
        aiMatch?.stockStatus || (available <= 5 ? "critical_low" : available >= 25 ? "slow_moving" : "balanced");

      const threshold = aiMatch?.safetyStockThreshold || 10;
      let restockQty = explicitRestockQty !== undefined
        ? (stockStatus === "critical_low" || available < threshold ? explicitRestockQty : 0)
        : (aiMatch?.recommendedRestockQuantity !== undefined
            ? Number(aiMatch.recommendedRestockQuantity)
            : available < threshold
              ? Math.max(10, threshold * 2 - available)
              : 0);

      // If user prompted to restock all items in scope
      if (explicitRestockQty !== undefined && restockQty === 0 && relevantRows.length <= 4) {
        restockQty = explicitRestockQty;
      }

      const unitCost = Math.round(row.priceMinor * 0.65);
      const totalCost = restockQty * unitCost;

      const rationale =
        aiMatch?.actionRationale ||
        (stockStatus === "critical_low"
          ? `Tồn khả dụng chỉ còn ${available} chiếc (dưới mức an toàn ${threshold}). Nguy cơ thiếu hàng cao khi có đơn lớn.`
          : stockStatus === "slow_moving"
            ? `Tồn khả dụng ${available} chiếc. Tốc độ luân chuyển chậm, không cần nhập thêm lúc này.`
            : `Tồn kho ổn định (${available} chiếc). Duy trì lượng tồn an toàn định kỳ.`);

      items.push({
        variantId: row.variantId,
        productId: row.productId,
        productName: row.productName,
        productSlug: row.productSlug,
        sku: row.sku,
        currentOnHand: row.onHand,
        currentReserved: row.reserved,
        availableQuantity: available,
        safetyStockThreshold: threshold,
        stockStatus,
        recommendedRestockQuantity: restockQty,
        estimatedUnitCostVnd: unitCost,
        estimatedTotalCostVnd: totalCost,
        actionRationale: rationale,
      });
    }

    const proposalId = this.generateId();
    const totalRestockUnits = items.reduce((acc, it) => acc + it.recommendedRestockQuantity, 0);
    const totalEstimatedBudgetVnd = items.reduce((acc, it) => acc + it.estimatedTotalCostVnd, 0);

    const inventoryHealthSummary =
      rawAiResult?.inventoryHealthSummary ||
      `Đã rà soát ${items.length} SKU sản phẩm trong kho. Phát hiện ${items.filter((i) => i.stockStatus === "critical_low").length} SKU có nguy cơ thiếu hàng cần nhập bổ sung khẩn cấp.`;

    const riskAssessment =
      rawAiResult?.riskAssessment ||
      "Chuỗi cung ứng đối mặt với nguy cơ cạn kiệt cục bộ tại một số mã sản phẩm chủ lực. Cần bổ sung tồn kho an toàn để tránh bỏ lỡ các đợt tăng trưởng đơn hàng đột biến.";

    const recommendedAction =
      rawAiResult?.recommendedAction ||
      `Ban Giám đốc phê duyệt phiếu nhập bổ sung ${totalRestockUnits} đơn vị hàng với tổng ngân sách dự kiến ${totalEstimatedBudgetVnd.toLocaleString("vi-VN")} VND.`;

    const proposal: OperationsProposalDto = {
      id: proposalId,
      prompt: request.prompt,
      items,
      totalItems: items.length,
      totalRestockUnits,
      totalEstimatedBudgetVnd,
      inventoryHealthSummary,
      riskAssessment,
      recommendedAction,
      status: "pending_approval",
      createdAt: this.now(),
      docxFilename: `bao_cao_kiem_toan_kho_van_${proposalId.slice(0, 8)}.docx`,
    };

    this.proposalsCache.set(proposalId, proposal);
    return proposal;
  }

  getProposal(proposalId: string): OperationsProposalDto | undefined {
    return this.proposalsCache.get(proposalId);
  }

  getProposalDocx(proposalId: string): {
    buffer: Buffer;
    filename: string;
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } {
    const proposal = this.proposalsCache.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found.`);
    }
    return generateOperationsReportDocx(proposal);
  }

  async applyOperationsProposal(
    proposalId: string,
    request: ApplyOperationsRequestDto,
  ): Promise<ApplyOperationsResultDto> {
    const proposal = this.proposalsCache.get(proposalId);
    const updatedItems: ApplyOperationsResultItemDto[] = [];

    const client = await this.database.connect();
    try {
      await client.query("BEGIN");

      for (const item of request.items) {
        if (item.restockQuantity <= 0) continue;

        // Query variant details
        const variantResult = await client.query<{ id: string; sku: string }>(
          `SELECT id, sku FROM product_variants WHERE id = $1`,
          [item.variantId],
        );
        const sku = variantResult.rows[0]?.sku ?? "SKU-UNKNOWN";

        // Query and lock existing inventory item row
        const invResult = await client.query<{ id: string; on_hand: number }>(
          `SELECT id, on_hand FROM inventory_items WHERE variant_id = $1 FOR UPDATE`,
          [item.variantId],
        );

        const current = invResult.rows[0];
        const previousOnHand = current?.on_hand ?? 0;
        const newOnHand = previousOnHand + item.restockQuantity;
        let inventoryItemId = current?.id;

        if (current?.id) {
          // Update existing inventory item
          await client.query(
            `UPDATE inventory_items 
             SET on_hand = $1, updated_at = NOW(), version = version + 1 
             WHERE id = $2`,
            [newOnHand, current.id],
          );
        } else {
          // Create new inventory item
          inventoryItemId = this.generateId();
          await client.query(
            `INSERT INTO inventory_items (id, variant_id, on_hand, reserved, version, created_at, updated_at) 
             VALUES ($1, $2, $3, 0, 1, NOW(), NOW())`,
            [inventoryItemId, item.variantId, newOnHand],
          );
        }

        // Append to stock movements
        const movementId = this.generateId();
        const correlationId = randomUUID();
        const idempotencyKey = randomUUID();
        await client.query(
          `INSERT INTO stock_movements (
             id, inventory_item_id, on_hand_delta, reserved_delta, occurred_at, 
             reason_code, reason_note, actor_type, actor_id, movement_type, correlation_id, idempotency_key
           ) VALUES ($1, $2, $3, 0, NOW(), 'PO_APPROVAL', 'AI Operations Restock Approval', 'staff', 'staff-operations-ai', 'receive', $4, $5)`,
          [movementId, inventoryItemId, item.restockQuantity, correlationId, idempotencyKey],
        );

        updatedItems.push({
          variantId: item.variantId,
          sku,
          previousOnHand,
          newOnHand,
          addedQuantity: item.restockQuantity,
        });
      }

      await client.query("COMMIT");

      if (proposal) {
        (proposal as any).status = "applied";
      }

      return {
        proposalId,
        appliedCount: updatedItems.length,
        updatedItems,
        appliedAt: this.now(),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
