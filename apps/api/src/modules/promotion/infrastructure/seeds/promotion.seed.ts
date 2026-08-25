// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../shared/database/transaction";
import type { Promotion } from "../../domain/entities/promotion";

const fixtureTimestamp = "2026-08-06T00:00:00.000Z";

export const promotionFixtures: readonly Promotion[] = [
  {
    id: "a1000000-0000-4000-8000-000000000001",
    code: "NOVA10",
    name: "NovaCommerce 10% welcome discount",
    type: "percentage",
    percentageBps: 1_000,
    maximumDiscountVnd: 2_000_000,
    minimumSubtotalVnd: 1_000_000,
    totalUsageLimit: 1_000,
    perCustomerLimit: 3,
    status: "active",
    version: 1,
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
  },
  {
    id: "a1000000-0000-4000-8000-000000000002",
    code: "NOVA50K",
    name: "NovaCommerce inactive 50,000 VND fixture",
    type: "fixed_amount",
    fixedAmountVnd: 50_000,
    minimumSubtotalVnd: 500_000,
    status: "inactive",
    version: 1,
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
  },
];

export async function seedPromotions(transactions: TransactionRunner): Promise<void> {
  await transactions.run(async (session) => {
    for (const promotion of promotionFixtures) {
      await session.query(
        `INSERT INTO promotions
          (id, code, name, promotion_type, percentage_bps, fixed_amount_vnd,
           maximum_discount_vnd, minimum_subtotal_vnd, starts_at, ends_at,
           total_usage_limit, per_customer_limit, status, version, created_at,
           updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (id) DO UPDATE SET
           code = EXCLUDED.code, name = EXCLUDED.name,
           promotion_type = EXCLUDED.promotion_type,
           percentage_bps = EXCLUDED.percentage_bps,
           fixed_amount_vnd = EXCLUDED.fixed_amount_vnd,
           maximum_discount_vnd = EXCLUDED.maximum_discount_vnd,
           minimum_subtotal_vnd = EXCLUDED.minimum_subtotal_vnd,
           starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
           total_usage_limit = EXCLUDED.total_usage_limit,
           per_customer_limit = EXCLUDED.per_customer_limit,
           status = EXCLUDED.status, version = EXCLUDED.version,
           created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at`,
        promotionValues(promotion),
      );
      await session.query(
        `INSERT INTO audit_events
          (id, actor_type, actor_id, action, resource_type, resource_id,
           outcome, correlation_id, metadata, occurred_at)
         VALUES ($1, 'service_account', 'system:promotion-seed',
                 'promotion.fixture.seeded', 'promotion', $2, 'success',
                 'seed:promotion', $3::jsonb, $4)
         ON CONFLICT (id) DO NOTHING`,
        [
          `seed_promotion_${promotion.code.toLowerCase()}`,
          promotion.id,
          JSON.stringify({ code: promotion.code, fixture: true }),
          fixtureTimestamp,
        ],
      );
    }
  });
}

function promotionValues(promotion: Promotion): readonly unknown[] {
  return [
    promotion.id,
    promotion.code,
    promotion.name,
    promotion.type,
    promotion.type === "percentage" ? promotion.percentageBps : null,
    promotion.type === "fixed_amount" ? promotion.fixedAmountVnd : null,
    promotion.maximumDiscountVnd ?? null,
    promotion.minimumSubtotalVnd,
    promotion.startsAt ?? null,
    promotion.endsAt ?? null,
    promotion.totalUsageLimit ?? null,
    promotion.perCustomerLimit ?? null,
    promotion.status,
    promotion.version,
    promotion.createdAt,
    promotion.updatedAt,
  ];
}
