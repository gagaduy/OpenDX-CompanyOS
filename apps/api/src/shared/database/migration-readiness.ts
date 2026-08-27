// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

interface MigrationReadinessRow {
  readonly catalog: string;
  readonly company_core: string;
  readonly inventory: string;
  readonly customer: string;
  readonly cart: string;
  readonly promotion: string;
  readonly checkout: string;
  readonly orders: string;
  readonly payment: string;
  readonly crm: string;
  readonly support: string;
  readonly reporting: string;
  readonly agentic: string;
  readonly wishlist_migration: boolean;
  readonly wishlist_table: boolean;
}

interface MigrationReadinessPool {
  query(text: string): Promise<{ readonly rows: readonly MigrationReadinessRow[] }>;
}

const minimumMigrationCounts = {
  catalog: 4,
  company_core: 1,
  inventory: 2,
  customer: 2,
  cart: 1,
  promotion: 1,
  checkout: 2,
  orders: 2,
  payment: 2,
  crm: 1,
  support: 3,
  reporting: 2,
  agentic: 7,
} as const;

export async function assertRequiredMigrations(
  pool: MigrationReadinessPool,
): Promise<void> {
  const result = await pool.query(`SELECT
    (SELECT count(*)::text FROM catalog_migrations) AS catalog,
    (SELECT count(*)::text FROM company_core_migrations) AS company_core,
    (SELECT count(*)::text FROM inventory_migrations) AS inventory,
    (SELECT count(*)::text FROM customer_migrations) AS customer,
    (SELECT count(*)::text FROM cart_migrations) AS cart,
    (SELECT count(*)::text FROM promotion_migrations) AS promotion,
    (SELECT count(*)::text FROM checkout_migrations) AS checkout,
    (SELECT count(*)::text FROM order_migrations) AS orders,
    (SELECT count(*)::text FROM payment_migrations) AS payment,
    (SELECT count(*)::text FROM crm_migrations) AS crm,
    (SELECT count(*)::text FROM support_migrations) AS support,
    (SELECT count(*)::text FROM reporting_migrations) AS reporting,
    (SELECT count(*)::text FROM agentic_migrations) AS agentic,
    EXISTS (
      SELECT 1 FROM customer_migrations
      WHERE name = '202608270030_add_customer_wishlist'
    ) AS wishlist_migration,
    to_regclass('public.customer_wishlist_items') IS NOT NULL AS wishlist_table`);
  const row = result.rows[0];
  const migrationsComplete =
    row !== undefined &&
    Object.entries(minimumMigrationCounts).every(
      ([name, minimum]) =>
        Number(row[name as keyof typeof minimumMigrationCounts]) >= minimum,
    ) &&
    row.wishlist_migration &&
    row.wishlist_table;
  if (!migrationsComplete) {
    throw new Error("Database migrations are incomplete");
  }
}
