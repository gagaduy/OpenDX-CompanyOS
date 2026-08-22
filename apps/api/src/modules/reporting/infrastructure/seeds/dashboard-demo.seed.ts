// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  DatabaseSession,
  TransactionRunner,
} from "../../../../shared/database/transaction";

const DAY_MS = 86_400_000;
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1_000;
const SUCCESSFUL_ORDER_STATUSES = new Set([
  "paid",
  "processing",
  "ready_for_fulfillment",
  "completed",
]);
const OUTCOMES = [
  ["completed", "paid"],
  ["paid", "paid"],
  ["processing", "paid"],
  ["ready_for_fulfillment", "paid"],
  ["paid", "paid"],
  ["completed", "paid"],
  ["processing", "paid"],
  ["pending_payment", "pending_provider"],
  ["canceled", "canceled"],
  ["expired", "expired"],
] as const;

export const DASHBOARD_DEMO_COUNTS = {
  customers: 40,
  currentOrders: 120,
  previousOrders: 80,
} as const;

interface PublishedVariant {
  readonly id: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly variantLabel: string;
  readonly unitPriceVnd: number;
}

interface DemoWindows {
  readonly currentStart: Date;
  readonly currentEnd: Date;
  readonly previousStart: Date;
}

export async function seedDashboardDemo(
  transactions: TransactionRunner,
  now: () => Date = () => new Date(),
): Promise<void> {
  const windows = resolveVietnamDemoWindows(now());
  await transactions.run(async (session) => {
    const variants = await loadPublishedVariants(session, windows.currentEnd);
    if (variants.length === 0) {
      throw new Error("Dashboard demo seed requires a published priced Catalog variant");
    }
    await upsertCustomers(session, windows);
    await upsertOrders(session, variants, windows);
  });
}

async function loadPublishedVariants(
  session: DatabaseSession,
  at: Date,
): Promise<readonly PublishedVariant[]> {
  const result = await session.query<{
    id: string;
    sku: string;
    product_title: string;
    variant_label: string;
    unit_price_vnd: string;
  }>(
    `SELECT v.id::text, v.sku, p.name AS product_title,
            v.title AS variant_label, price.amount_minor::text AS unit_price_vnd
     FROM product_variants v
     JOIN products p ON p.id = v.product_id
     JOIN LATERAL (
       SELECT amount_minor
       FROM product_prices
       WHERE variant_id = v.id AND currency = 'VND'
         AND valid_from <= $1 AND (valid_to IS NULL OR valid_to > $1)
       ORDER BY valid_from DESC, id DESC
       LIMIT 1
     ) price ON true
     WHERE p.status = 'published' AND v.status = 'active'
       AND price.amount_minor BETWEEN 1 AND 9007199254740991
     ORDER BY v.sku`,
    [at.toISOString()],
  );
  return result.rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    productTitle: row.product_title,
    variantLabel: row.variant_label,
    unitPriceVnd: parseSafePositiveInteger(row.unit_price_vnd),
  }));
}

async function upsertCustomers(
  session: DatabaseSession,
  windows: DemoWindows,
): Promise<void> {
  for (let index = 0; index < DASHBOARD_DEMO_COUNTS.customers; index += 1) {
    const inCurrentPeriod = index < 24;
    const base = inCurrentPeriod ? windows.currentStart : windows.previousStart;
    const date = addMilliseconds(base, ((index * 7) % 30) * DAY_MS + 10 * 60 * 60 * 1_000);
    const sequence = index + 1;
    await session.query(
      `INSERT INTO customers
        (id,email,email_verified_at,full_name,phone_number,status,version,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,'active',1,$3,$3)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         email_verified_at = EXCLUDED.email_verified_at,
         full_name = EXCLUDED.full_name,
         phone_number = EXCLUDED.phone_number,
         status = 'active',
         version = 1,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at`,
      [
        demoId("da100000", sequence),
        `dashboard-demo-${String(sequence).padStart(2, "0")}@example.invalid`,
        date.toISOString(),
        `Dashboard Demo Customer ${String(sequence).padStart(2, "0")}`,
        `0908${String(sequence).padStart(6, "0")}`,
      ],
    );
  }
}

async function upsertOrders(
  session: DatabaseSession,
  variants: readonly PublishedVariant[],
  windows: DemoWindows,
): Promise<void> {
  const orderCount = DASHBOARD_DEMO_COUNTS.currentOrders + DASHBOARD_DEMO_COUNTS.previousOrders;
  for (let index = 0; index < orderCount; index += 1) {
    const sequence = index + 1;
    const isCurrent = index < DASHBOARD_DEMO_COUNTS.currentOrders;
    const periodIndex = isCurrent ? index : index - DASHBOARD_DEMO_COUNTS.currentOrders;
    const periodStart = isCurrent ? windows.currentStart : windows.previousStart;
    const createdAt = addMilliseconds(
      periodStart,
      (periodIndex % 30) * DAY_MS + 12 * 60 * 60 * 1_000 + (periodIndex % 240) * 60 * 1_000,
    );
    const [orderStatus, paymentStatus] = OUTCOMES[periodIndex % OUTCOMES.length]!;
    const paid = SUCCESSFUL_ORDER_STATUSES.has(orderStatus);
    const paidAt = paid ? addMilliseconds(createdAt, 15 * 60 * 1_000) : undefined;
    const customerId = demoId("da100000", (index % DASHBOARD_DEMO_COUNTS.customers) + 1);
    const cartId = demoId("da200000", sequence);
    const checkoutId = demoId("da300000", sequence);
    const checkoutLineId = demoId("da310000", sequence);
    const orderId = demoId("da400000", sequence);
    const orderLineId = demoId("da500000", sequence);
    const paymentId = demoId("da600000", sequence);
    const variant = variants[index % variants.length]!;
    const quantity = (index % 3) + 1;
    const totalVnd = variant.unitPriceVnd * quantity;
    assertSafePositiveInteger(totalVnd);
    const expiresAt = addMilliseconds(createdAt, 30 * 60 * 1_000);
    const checkoutStatus = paid
      ? "completed"
      : orderStatus === "pending_payment"
        ? "order_created"
        : orderStatus;
    const address = JSON.stringify({
      recipientName: `Dashboard Demo Customer ${String((index % 40) + 1).padStart(2, "0")}`,
      phoneNumber: "0908000000",
      addressLine: "1 Demo Street",
      ward: "Ben Nghe",
      provinceOrCity: "Ho Chi Minh City",
    });
    const contact = JSON.stringify({ email: "dashboard-demo@example.invalid" });

    await session.query(
      `INSERT INTO carts(id,customer_id,status,version,expires_at,created_at,updated_at)
       VALUES ($1,$2,'checkout_ready',1,$3,$4,$4)
       ON CONFLICT (id) DO UPDATE SET customer_id=EXCLUDED.customer_id,
         status='checkout_ready',version=1,expires_at=EXCLUDED.expires_at,
         created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at`,
      [cartId, customerId, expiresAt.toISOString(), createdAt.toISOString()],
    );
    await session.query(
      `INSERT INTO checkout_sessions
        (id,customer_id,source_cart_id,source_cart_version,address_snapshot,
         contact_snapshot,subtotal_vnd,discount_vnd,total_vnd,currency,tax_mode,
         status,idempotency_key,request_fingerprint,order_id,expires_at,
         completed_at,created_at,updated_at)
       VALUES ($1,$2,$3,1,$4::jsonb,$5::jsonb,$6,0,$6,'VND',
         'included_not_separated',$7,$8,$9,NULL,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         customer_id=EXCLUDED.customer_id,source_cart_id=EXCLUDED.source_cart_id,
         source_cart_version=1,address_snapshot=EXCLUDED.address_snapshot,
         contact_snapshot=EXCLUDED.contact_snapshot,subtotal_vnd=EXCLUDED.subtotal_vnd,
         discount_vnd=0,total_vnd=EXCLUDED.total_vnd,currency='VND',
         tax_mode='included_not_separated',status=EXCLUDED.status,
         idempotency_key=EXCLUDED.idempotency_key,
         request_fingerprint=EXCLUDED.request_fingerprint,order_id=NULL,
         expires_at=EXCLUDED.expires_at,completed_at=EXCLUDED.completed_at,
         created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at`,
      [
        checkoutId,
        customerId,
        cartId,
        address,
        contact,
        totalVnd,
        checkoutStatus,
        `dashboard-demo-checkout-${sequence}`,
        sequence.toString(16).padStart(64, "0"),
        expiresAt.toISOString(),
        paidAt?.toISOString() ?? null,
        createdAt.toISOString(),
        (paidAt ?? createdAt).toISOString(),
      ],
    );
    await session.query(
      `INSERT INTO checkout_session_lines
        (id,checkout_id,variant_id,sku,product_title,variant_label,quantity,
         unit_price_vnd,line_subtotal_vnd,line_position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0)
       ON CONFLICT (id) DO UPDATE SET checkout_id=EXCLUDED.checkout_id,
         variant_id=EXCLUDED.variant_id,sku=EXCLUDED.sku,
         product_title=EXCLUDED.product_title,variant_label=EXCLUDED.variant_label,
         quantity=EXCLUDED.quantity,unit_price_vnd=EXCLUDED.unit_price_vnd,
         line_subtotal_vnd=EXCLUDED.line_subtotal_vnd,line_position=0`,
      [checkoutLineId, checkoutId, variant.id, variant.sku, variant.productTitle,
        variant.variantLabel, quantity, variant.unitPriceVnd, totalVnd],
    );
    await session.query(
      `INSERT INTO orders
        (id,public_number,customer_id,checkout_id,address_snapshot,contact_snapshot,
         subtotal_vnd,discount_vnd,total_vnd,currency,tax_mode,status,
         reservation_expires_at,paid_at,completed_at,version,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,0,$7,'VND',
         'included_not_separated',$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET public_number=EXCLUDED.public_number,
         customer_id=EXCLUDED.customer_id,checkout_id=EXCLUDED.checkout_id,
         address_snapshot=EXCLUDED.address_snapshot,contact_snapshot=EXCLUDED.contact_snapshot,
         subtotal_vnd=EXCLUDED.subtotal_vnd,discount_vnd=0,total_vnd=EXCLUDED.total_vnd,
         currency='VND',tax_mode='included_not_separated',status=EXCLUDED.status,
         reservation_expires_at=EXCLUDED.reservation_expires_at,paid_at=EXCLUDED.paid_at,
         completed_at=EXCLUDED.completed_at,version=EXCLUDED.version,
         created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at`,
      [
        orderId,
        publicOrderNumber(createdAt, sequence),
        customerId,
        checkoutId,
        address,
        contact,
        totalVnd,
        orderStatus,
        expiresAt.toISOString(),
        paidAt?.toISOString() ?? null,
        orderStatus === "completed" ? paidAt?.toISOString() : null,
        paid ? 2 : 1,
        createdAt.toISOString(),
        (paidAt ?? createdAt).toISOString(),
      ],
    );
    await session.query(
      "UPDATE checkout_sessions SET order_id=$2 WHERE id=$1",
      [checkoutId, orderId],
    );
    await session.query(
      `INSERT INTO order_lines
        (id,order_id,variant_id,sku,product_title,variant_label,quantity,
         unit_price_vnd,discount_allocation_vnd,line_total_vnd,line_position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,0)
       ON CONFLICT (id) DO UPDATE SET order_id=EXCLUDED.order_id,
         variant_id=EXCLUDED.variant_id,sku=EXCLUDED.sku,
         product_title=EXCLUDED.product_title,variant_label=EXCLUDED.variant_label,
         quantity=EXCLUDED.quantity,unit_price_vnd=EXCLUDED.unit_price_vnd,
         discount_allocation_vnd=0,line_total_vnd=EXCLUDED.line_total_vnd,
         line_position=0`,
      [orderLineId, orderId, variant.id, variant.sku, variant.productTitle,
        variant.variantLabel, quantity, variant.unitPriceVnd, totalVnd],
    );
    await session.query(
      `INSERT INTO payments
        (id,order_id,provider,expected_amount_vnd,currency,status,paid_at,version,
         created_at,updated_at)
       VALUES ($1,$2,'sepay',$3,'VND',$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET order_id=EXCLUDED.order_id,provider='sepay',
         expected_amount_vnd=EXCLUDED.expected_amount_vnd,currency='VND',
         status=EXCLUDED.status,paid_at=EXCLUDED.paid_at,version=EXCLUDED.version,
         created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at`,
      [paymentId, orderId, totalVnd, paymentStatus, paidAt?.toISOString() ?? null,
        paid ? 2 : 1, createdAt.toISOString(), (paidAt ?? createdAt).toISOString()],
    );
  }
}

function resolveVietnamDemoWindows(now: Date): DemoWindows {
  if (Number.isNaN(now.getTime())) throw new Error("Dashboard demo seed requires a valid clock");
  const localDate = new Date(now.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
  const currentEnd = new Date(Date.parse(`${localDate}T00:00:00.000Z`) - VIETNAM_OFFSET_MS + DAY_MS);
  return {
    currentEnd,
    currentStart: addMilliseconds(currentEnd, -30 * DAY_MS),
    previousStart: addMilliseconds(currentEnd, -60 * DAY_MS),
  };
}

function demoId(prefix: string, sequence: number): string {
  return `${prefix}-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

function publicOrderNumber(createdAt: Date, sequence: number): string {
  const localDate = new Date(createdAt.getTime() + VIETNAM_OFFSET_MS)
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
  return `NVC-${localDate}-${sequence.toString(16).toUpperCase().padStart(8, "0")}`;
}

function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}

function parseSafePositiveInteger(value: string): number {
  const parsed = Number(value);
  assertSafePositiveInteger(parsed);
  return parsed;
}

function assertSafePositiveInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Unsafe dashboard demo amount: ${value}`);
  }
}
