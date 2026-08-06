// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { Promotion } from "../../../domain/entities/promotion";
import type { PromotionRedemption } from "../../../domain/entities/promotion-redemption";
import type { PromotionRepository } from "../../repositories/interfaces/promotion.repository";
import { PromotionApplicationError } from "../promotion-application.error";
import { PromotionService } from "./promotion.service";

const session: DatabaseSession = { query: async () => ({ rows: [], rowCount: 0 }) };
const transactions: TransactionRunner = {
  run: async (work) => work(session),
  runReadOnly: async (work) => work(session),
};
const timestamp = "2026-08-06T08:00:00.000Z";

class FakePromotionRepository implements PromotionRepository {
  readonly promotions: Promotion[] = [];
  readonly redemptions: PromotionRedemption[] = [];
  readonly audits: string[] = [];
  usage = { total: 0, customer: 0 };
  async list() { return this.promotions; }
  async findByCodeForUpdate(_session: DatabaseSession, code: string) { return this.promotions.find((promotion) => promotion.code === code); }
  async findByIdForUpdate(_session: DatabaseSession, id: string) { return this.promotions.find((promotion) => promotion.id === id); }
  async create(_session: DatabaseSession, promotion: Promotion) { this.promotions.push(promotion); }
  async update(_session: DatabaseSession, promotion: Promotion, expectedVersion: number) {
    const index = this.promotions.findIndex(({ id, version }) => id === promotion.id && version === expectedVersion);
    if (index < 0) return false;
    this.promotions[index] = promotion;
    return true;
  }
  async countUsage() { return this.usage; }
  async findRedemptionByCheckout(_session: DatabaseSession, checkoutId: string) { return this.redemptions.find((redemption) => redemption.checkoutId === checkoutId); }
  async createRedemption(_session: DatabaseSession, redemption: PromotionRedemption) { this.redemptions.push(redemption); }
  async updateRedemption(_session: DatabaseSession, redemption: PromotionRedemption) {
    const index = this.redemptions.findIndex(({ id }) => id === redemption.id);
    this.redemptions[index] = redemption;
  }
  async appendAudit(_session: DatabaseSession, entry: { action: string }) { this.audits.push(entry.action); }
}

function request() {
  return {
    code: "nova10", name: "Nova 10%", type: "percentage" as const,
    percentageBps: 1000, minimumSubtotalVnd: 100_000,
    status: "active" as const,
  };
}

describe("PromotionService", () => {
  it("restricts writes to administrators and uses optimistic versions", async () => {
    const repository = new FakePromotionRepository();
    let id = 0;
    const service = new PromotionService(repository, transactions, () => `id-${++id}`, () => timestamp);
    await expect(service.create(request(), { actorId: "finance", roles: ["finance_operator"], correlationId: "c-1" })).rejects.toEqual(expect.objectContaining({ code: "FORBIDDEN" }));
    const created = await service.create(request(), { actorId: "admin", roles: ["administrator"], correlationId: "c-2" });
    expect(created).toMatchObject({ code: "NOVA10", version: 1 });
    await expect(service.update(created.id, { ...request(), version: 2 }, { actorId: "admin", roles: ["administrator"], correlationId: "c-3" })).rejects.toEqual(expect.objectContaining({ code: "CONFLICT" }));
    expect((await service.update(created.id, { ...request(), name: "Updated", version: 1 }, { actorId: "admin", roles: ["administrator"], correlationId: "c-4" })).version).toBe(2);
    expect(repository.audits).toEqual(["promotion.created", "promotion.updated"]);
  });

  it("holds, replays, commits, and releases checkout redemptions", async () => {
    const repository = new FakePromotionRepository();
    repository.promotions.push({ id: "promotion-1", code: "NOVA10", name: "Nova 10%", type: "percentage", percentageBps: 1000, minimumSubtotalVnd: 100_000, status: "active", version: 1, createdAt: timestamp, updatedAt: timestamp });
    let id = 0;
    const service = new PromotionService(repository, transactions, () => `id-${++id}`, () => timestamp);
    const holdRequest = { code: "nova10", customerId: "customer-1", checkoutId: "checkout-1", subtotalVnd: 500_000, idempotencyKey: "key-1", expiresAt: "2026-08-06T08:15:00.000Z", correlationId: "c-1", now: timestamp };
    const held = await service.hold(session, holdRequest);
    expect(held).toMatchObject({ discountVnd: 50_000, totalVnd: 450_000 });
    expect(await service.hold(session, holdRequest)).toEqual(held);
    expect(repository.redemptions).toHaveLength(1);
    await service.commit(session, "checkout-1", "order-1", "c-2", timestamp);
    expect(repository.redemptions[0]).toMatchObject({ state: "committed", orderId: "order-1" });
    await expect(service.release(session, "checkout-1", "c-3", timestamp)).rejects.toBeInstanceOf(Error);
  });

  it("rejects a replay that changes customer or idempotency input", async () => {
    const repository = new FakePromotionRepository();
    repository.promotions.push({ id: "promotion-1", code: "NOVA10", name: "Nova 10%", type: "percentage", percentageBps: 1000, minimumSubtotalVnd: 1, status: "active", version: 1, createdAt: timestamp, updatedAt: timestamp });
    const service = new PromotionService(repository, transactions, () => "redemption-1", () => timestamp);
    const base = { code: "NOVA10", customerId: "customer-1", checkoutId: "checkout-1", subtotalVnd: 10_000, idempotencyKey: "key-1", expiresAt: "2026-08-06T08:15:00.000Z", correlationId: "c-1", now: timestamp };
    await service.hold(session, base);
    await expect(service.hold(session, { ...base, customerId: "customer-2" })).rejects.toBeInstanceOf(PromotionApplicationError);
  });
});
