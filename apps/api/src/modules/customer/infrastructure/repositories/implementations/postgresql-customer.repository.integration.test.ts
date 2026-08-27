// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runCatalogMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { runCustomerMigrations } from "../../database/run-customer-migrations";
import { PostgresqlCustomerRepository } from "./postgresql-customer.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;
const firstCustomer = "c1000000-0000-4000-8000-000000000001";
const secondCustomer = "c1000000-0000-4000-8000-000000000002";
const products = [
  "c2000000-0000-4000-8000-000000000001",
  "c2000000-0000-4000-8000-000000000002",
  "c2000000-0000-4000-8000-000000000003",
] as const;

suite("PostgresqlCustomerRepository wishlist", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const repository = new PostgresqlCustomerRepository();

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up");
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE customers, categories CASCADE");
    await pool.query(
      `INSERT INTO customers
        (id,email,email_verified_at,status,version,created_at,updated_at)
       VALUES
        ($1,'first@example.com',NOW(),'active',1,NOW(),NOW()),
        ($2,'second@example.com',NOW(),'active',1,NOW(),NOW())`,
      [firstCustomer, secondCustomer],
    );
    await pool.query(
      `INSERT INTO categories
        (id,name,slug,sort_order,status,created_at,updated_at,version)
       VALUES ('c3000000-0000-4000-8000-000000000001','Phones','phones',0,
        'active',NOW(),NOW(),1)`,
    );
    await pool.query(
      `INSERT INTO products
        (id,category_id,name,slug,description,attributes,status,created_at,updated_at,version)
       VALUES
        ($1,'c3000000-0000-4000-8000-000000000001','One','one','One','{}','draft',NOW(),NOW(),1),
        ($2,'c3000000-0000-4000-8000-000000000001','Two','two','Two','{}','draft',NOW(),NOW(),1),
        ($3,'c3000000-0000-4000-8000-000000000001','Three','three','Three','{}','draft',NOW(),NOW(),1)`,
      [...products],
    );
  });

  afterAll(async () => {
    await runCustomerMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCatalogMigrations(databaseUrl!, "down").catch(() => undefined);
    await pool.end();
  });

  it("adds concurrently and lists newest items with a stable product tiebreaker", async () => {
    await Promise.all([
      transactions.run((session) =>
        repository.addWishlistItem(
          session,
          firstCustomer,
          products[1],
          "2026-08-27T10:00:00.000Z",
        ),
      ),
      transactions.run((session) =>
        repository.addWishlistItem(
          session,
          firstCustomer,
          products[1],
          "2026-08-27T10:00:00.000Z",
        ),
      ),
    ]);
    await transactions.run((session) =>
      repository.addWishlistItem(
        session,
        firstCustomer,
        products[0],
        "2026-08-27T11:00:00.000Z",
      ),
    );
    await transactions.run((session) =>
      repository.addWishlistItem(
        session,
        firstCustomer,
        products[2],
        "2026-08-27T11:00:00.000Z",
      ),
    );

    await expect(
      transactions.runReadOnly((session) =>
        repository.listWishlist(session, firstCustomer, {
          page: 1,
          pageSize: 2,
        }),
      ),
    ).resolves.toEqual({
      productIds: [products[0], products[2]],
      totalItems: 3,
    });
    await expect(
      transactions.runReadOnly((session) =>
        repository.listWishlist(session, secondCustomer, {
          page: 1,
          pageSize: 24,
        }),
      ),
    ).resolves.toEqual({ productIds: [], totalItems: 0 });
  });

  it("removes only the owning customer's item and repeated removes stay safe", async () => {
    await transactions.run((session) =>
      repository.addWishlistItem(
        session,
        firstCustomer,
        products[0],
        "2026-08-27T11:00:00.000Z",
      ),
    );

    await transactions.run((session) =>
      repository.removeWishlistItem(session, secondCustomer, products[0]),
    );
    await transactions.run((session) =>
      repository.removeWishlistItem(session, firstCustomer, products[0]),
    );
    await transactions.run((session) =>
      repository.removeWishlistItem(session, firstCustomer, products[0]),
    );

    await expect(
      transactions.runReadOnly((session) =>
        repository.listWishlist(session, firstCustomer, {
          page: 1,
          pageSize: 24,
        }),
      ),
    ).resolves.toEqual({ productIds: [], totalItems: 0 });
  });
});
