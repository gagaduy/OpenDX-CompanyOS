// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { CreatePromotionRequest, PromotionCommandContext, PromotionDto, UpdatePromotionRequest } from "../../dtos/promotion.dto";
import type { PromotionRepository } from "../../repositories/interfaces/promotion.repository";
import type { PromotionCheckoutPort, HeldPromotionDto, HoldPromotionRequest } from "../interfaces/promotion-checkout-port";
import type { PromotionServiceContract } from "../interfaces/promotion.service";
import type { Promotion } from "../../../domain/entities/promotion";
import type { PromotionRedemption } from "../../../domain/entities/promotion-redemption";
import { commitRedemption, evaluatePromotion, normalizePromotionCode, releaseRedemption, validatePromotion } from "../../../domain/services/promotion-rules";
import { PromotionApplicationError } from "../promotion-application.error";

export class PromotionService implements PromotionServiceContract, PromotionCheckoutPort {
  constructor(
    private readonly repository: PromotionRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async list(): Promise<readonly PromotionDto[]> {
    return this.transactions.runReadOnly(async (session) => (await this.repository.list(session)).map(mapPromotion));
  }

  async create(request: CreatePromotionRequest, context: PromotionCommandContext): Promise<PromotionDto> {
    requireAdministrator(context);
    return await this.transactions.run(async (session) => {
      const timestamp = this.now();
      const promotion = buildPromotion(this.generateId(), request, 1, timestamp, timestamp);
      await this.repository.create(session, promotion);
      await this.audit(session, promotion.id, "promotion.created", context.actorId, context.correlationId, timestamp, { code: promotion.code });
      return mapPromotion(promotion);
    });
  }

  async update(id: string, request: UpdatePromotionRequest, context: PromotionCommandContext): Promise<PromotionDto> {
    requireAdministrator(context);
    return await this.transactions.run(async (session) => {
      const current = await this.repository.findByIdForUpdate(session, id);
      if (current === undefined) throw new PromotionApplicationError("NOT_FOUND", "Promotion not found");
      if (current.version !== request.version) throw new PromotionApplicationError("CONFLICT", "Promotion version is stale");
      const timestamp = this.now();
      const updated = buildPromotion(id, request, current.version + 1, current.createdAt, timestamp);
      if (!(await this.repository.update(session, updated, current.version))) throw new PromotionApplicationError("CONFLICT", "Promotion version is stale");
      await this.audit(session, id, "promotion.updated", context.actorId, context.correlationId, timestamp, { previousVersion: current.version, version: updated.version });
      return mapPromotion(updated);
    });
  }

  async hold(session: Parameters<PromotionCheckoutPort["hold"]>[0], request: HoldPromotionRequest): Promise<HeldPromotionDto> {
    const code = normalizePromotionCode(request.code);
    const existing = await this.repository.findRedemptionByCheckout(session, request.checkoutId);
    if (existing !== undefined) {
      if (existing.customerId !== request.customerId || existing.idempotencyKey !== request.idempotencyKey) {
        throw new PromotionApplicationError("IDEMPOTENCY_CONFLICT", "Checkout promotion hold conflicts with an existing request");
      }
      const promotion = await this.repository.findByIdForUpdate(session, existing.promotionId);
      if (promotion === undefined || promotion.code !== code) throw new PromotionApplicationError("IDEMPOTENCY_CONFLICT", "Checkout promotion code changed");
      return { promotionId: promotion.id, code, version: promotion.version, redemptionId: existing.id, discountVnd: existing.discountVnd, totalVnd: request.subtotalVnd - existing.discountVnd };
    }
    const promotion = await this.repository.findByCodeForUpdate(session, code);
    if (promotion === undefined) throw new PromotionApplicationError("NOT_FOUND", "Promotion not found");
    const usage = await this.repository.countUsage(session, promotion.id, request.customerId, request.now);
    const evaluation = evaluatePromotion(promotion, { subtotalVnd: request.subtotalVnd, now: request.now, totalUsageCount: usage.total, customerUsageCount: usage.customer });
    const redemption: PromotionRedemption = {
      id: this.generateId(), promotionId: promotion.id, customerId: request.customerId,
      checkoutId: request.checkoutId, discountVnd: evaluation.discountVnd, state: "held",
      idempotencyKey: request.idempotencyKey, expiresAt: request.expiresAt,
      createdAt: request.now, updatedAt: request.now,
    };
    await this.repository.createRedemption(session, redemption);
    await this.audit(session, redemption.id, "promotion.redemption.held", request.customerId, request.correlationId, request.now, { promotionId: promotion.id, checkoutId: request.checkoutId, discountVnd: evaluation.discountVnd });
    return { promotionId: promotion.id, code, version: promotion.version, redemptionId: redemption.id, ...evaluation };
  }

  async commit(session: Parameters<PromotionCheckoutPort["commit"]>[0], checkoutId: string, orderId: string, correlationId: string, now: string): Promise<void> {
    const current = await this.repository.findRedemptionByCheckout(session, checkoutId);
    if (current === undefined) return;
    if (current.state === "committed" && current.orderId === orderId) return;
    if (current.orderId !== undefined && current.orderId !== orderId) throw new PromotionApplicationError("IDEMPOTENCY_CONFLICT", "Promotion redemption belongs to another order");
    const updated = { ...commitRedemption(current, now), orderId };
    await this.repository.updateRedemption(session, updated);
    await this.audit(session, updated.id, "promotion.redemption.committed", "payment-system", correlationId, now, { orderId });
  }

  async release(session: Parameters<PromotionCheckoutPort["release"]>[0], checkoutId: string, correlationId: string, now: string): Promise<void> {
    const current = await this.repository.findRedemptionByCheckout(session, checkoutId);
    if (current === undefined || current.state === "released") return;
    const updated = releaseRedemption(current, now);
    await this.repository.updateRedemption(session, updated);
    await this.audit(session, updated.id, "promotion.redemption.released", "checkout-system", correlationId, now, {});
  }

  private audit(session: Parameters<PromotionCheckoutPort["hold"]>[0], resourceId: string, action: string, actorId: string, correlationId: string, occurredAt: string, metadata: Readonly<Record<string, unknown>>): Promise<void> {
    return this.repository.appendAudit(session, { id: this.generateId(), actorType: actorId.endsWith("-system") ? "system" : action.startsWith("promotion.redemption") ? "customer" : "staff", actorId, action, resourceType: action.startsWith("promotion.redemption") ? "promotion_redemption" : "promotion", resourceId, correlationId, metadata, occurredAt });
  }
}

function buildPromotion(id: string, request: CreatePromotionRequest, version: number, createdAt: string, updatedAt: string): Promotion {
  const common = {
    id, code: normalizePromotionCode(request.code), name: request.name.trim(),
    minimumSubtotalVnd: request.minimumSubtotalVnd,
    ...(request.maximumDiscountVnd === undefined ? {} : { maximumDiscountVnd: request.maximumDiscountVnd }),
    ...(request.startsAt === undefined ? {} : { startsAt: request.startsAt }),
    ...(request.endsAt === undefined ? {} : { endsAt: request.endsAt }),
    ...(request.totalUsageLimit === undefined ? {} : { totalUsageLimit: request.totalUsageLimit }),
    ...(request.perCustomerLimit === undefined ? {} : { perCustomerLimit: request.perCustomerLimit }),
    status: request.status, version, createdAt, updatedAt,
  };
  const promotion: Promotion = request.type === "percentage"
    ? { ...common, type: "percentage", percentageBps: request.percentageBps }
    : { ...common, type: "fixed_amount", fixedAmountVnd: request.fixedAmountVnd };
  validatePromotion(promotion);
  return promotion;
}

function requireAdministrator(context: PromotionCommandContext): void {
  if (!context.roles.includes("administrator")) throw new PromotionApplicationError("FORBIDDEN", "Administrator role is required");
}

function mapPromotion(promotion: Promotion): PromotionDto {
  return structuredClone(promotion);
}
