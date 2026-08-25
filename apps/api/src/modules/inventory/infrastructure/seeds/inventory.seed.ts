// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../shared/database/transaction";

const fixtureTimestamp = "2026-08-05T00:00:00.000Z";

function id(prefix: 6 | 7 | 8 | 9, sequence: number): string {
  return `${prefix}0000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

function catalogId(prefix: 2 | 3, sequence: number): string {
  return `${prefix}0000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

export async function seedInventory(transactions: TransactionRunner): Promise<void> {
  await transactions.run(async (session) => {
    for (let sequence = 1; sequence <= 24; sequence += 1) {
      const variantId = catalogId(3, sequence);
      const inventoryItemId = id(6, sequence);
      const soldOut = sequence % 5 === 0;
      const hasReservation = sequence % 4 === 0 && !soldOut;
      const lowStock = sequence % 3 === 0 && !soldOut && !hasReservation;
      const onHand = soldOut ? 0 : hasReservation ? 8 : lowStock ? 3 : 12;
      const reserved = hasReservation ? 3 : 0;
      const receiptQuantity = soldOut ? 5 : onHand;

      await session.query(
        `INSERT INTO inventory_items
          (id, variant_id, on_hand, reserved, version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 1, $5, $5)
         ON CONFLICT (id) DO UPDATE SET
          variant_id = EXCLUDED.variant_id, on_hand = EXCLUDED.on_hand,
          reserved = EXCLUDED.reserved, version = 1, updated_at = EXCLUDED.updated_at`,
        [inventoryItemId, variantId, onHand, reserved, fixtureTimestamp],
      );
      await session.query(
        `INSERT INTO stock_movements
          (id, inventory_item_id, movement_type, on_hand_delta, reserved_delta,
           reason_code, reason_note, actor_type, actor_id, correlation_id,
           idempotency_key, occurred_at)
         VALUES ($1, $2, 'receive', $3, 0, 'INITIAL_STOCK',
                 'Deterministic technology fixture', 'system',
                 'system:inventory-seed', 'seed:inventory', $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [id(7, sequence), inventoryItemId, receiptQuantity,
          `seed:inventory:${variantId}`, fixtureTimestamp],
      );

      if (soldOut) {
        await session.query(
          `INSERT INTO stock_movements
            (id, inventory_item_id, movement_type, on_hand_delta, reserved_delta,
             reason_code, reason_note, actor_type, actor_id, correlation_id,
             idempotency_key, occurred_at)
           VALUES ($1, $2, 'adjustment', -5, 0, 'SEED_SOLD_OUT',
                   'Sold-out storefront fixture', 'system',
                   'system:inventory-seed', 'seed:inventory', $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [id(8, sequence), inventoryItemId,
            `seed:inventory:sold-out:${variantId}`, fixtureTimestamp],
        );
      }

      if (hasReservation) {
        const reservationId = id(9, sequence);
        await session.query(
          `INSERT INTO inventory_reservations
            (id, reference_type, reference_id, variant_id, quantity, status,
             expires_at, created_at, updated_at)
           VALUES ($1, 'checkout', $2, $3, 3, 'active',
                   '2099-01-01T00:00:00.000Z', $4, $4)
           ON CONFLICT (id) DO UPDATE SET
            status = 'active', quantity = 3, finalized_at = NULL,
            expires_at = EXCLUDED.expires_at, updated_at = EXCLUDED.updated_at`,
          [reservationId, `seed-checkout-${sequence}`, variantId, fixtureTimestamp],
        );
        await session.query(
          `INSERT INTO stock_movements
            (id, inventory_item_id, reservation_id, movement_type,
             on_hand_delta, reserved_delta, reason_code, reason_note,
             actor_type, actor_id, correlation_id, idempotency_key, occurred_at)
           VALUES ($1, $2, $3, 'reservation', 0, 3, 'CHECKOUT_RESERVATION',
                   'Reserved-stock storefront fixture', 'system',
                   'system:inventory-seed', 'seed:inventory', $4, $5)
           ON CONFLICT (id) DO NOTHING`,
          [id(8, sequence), inventoryItemId, reservationId,
            `seed:inventory:reservation:${variantId}`, fixtureTimestamp],
        );
      }
    }

    for (let productSequence = 1; productSequence <= 10; productSequence += 1) {
      const productId = catalogId(2, productSequence);
      await session.query(
        `UPDATE products SET status = 'published', updated_at = $2,
                version = CASE WHEN status = 'published' THEN version ELSE version + 1 END
         WHERE id = $1 AND status <> 'archived'`,
        [productId, fixtureTimestamp],
      );
      await session.query(
        `INSERT INTO audit_events
          (id, actor_type, actor_id, action, resource_type, resource_id,
           outcome, correlation_id, metadata, occurred_at)
         VALUES ($1, 'service_account', 'system:inventory-seed',
                 'catalog.product.published', 'product', $2, 'success',
                 'seed:inventory', '{"fixture":true}', $3)
         ON CONFLICT (id) DO NOTHING`,
        [`seed_catalog_product_published_${productSequence}`, productId, fixtureTimestamp],
      );
    }
  });
}
