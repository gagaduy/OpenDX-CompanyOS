// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApiApp } from "../../../app";
import { runCatalogMigrations } from "../../../shared/database/run-migrations";
import { createPostgresPool } from "../../../shared/database/postgres";
import { PostgresTransactionRunner } from "../../../shared/database/transaction";
import type { GoogleIdentityVerifier } from "../application/identity/google-identity-verifier";
import { createCustomerModule } from "../customer.module";
import type { CustomerOperationsReader } from "../application/services/interfaces/customer-operations-reader";
import { runCustomerMigrations } from "../infrastructure/database/run-customer-migrations";
import { NodeSessionTokenService } from "../infrastructure/security/node-session-token-service";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;
const origin = "http://localhost:3100";
const cookies = {
  guestName: "opendx_guest",
  customerName: "opendx_customer",
  csrfName: "opendx_csrf",
  secure: false,
} as const;
const wishlistProductId = "b2000000-0000-4000-8000-000000000001";
const wishlistProduct = {
  id: wishlistProductId,
  categoryId: "b1000000-0000-4000-8000-000000000001",
  categoryName: "Phones",
  name: "Nova Phone",
  slug: "nova-phone",
  description: "Nova phone",
  attributes: {},
  primaryMedia: {
    id: "b3000000-0000-4000-8000-000000000001",
    altText: "Nova Phone",
    contentUrl: "/v1/storefront/products/b2000000-0000-4000-8000-000000000001/media/b3000000-0000-4000-8000-000000000001/content",
  },
  variants: [],
} as const;

suite("customer API integration", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let app: ReturnType<typeof createApiApp>;
  let operations: CustomerOperationsReader;

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up");
    await pool.query(
      `INSERT INTO categories
        (id,name,slug,sort_order,status,created_at,updated_at,version)
       VALUES ($1,'Phones','phones',0,'active',NOW(),NOW(),1)
       ON CONFLICT (id) DO NOTHING`,
      [wishlistProduct.categoryId],
    );
    await pool.query(
      `INSERT INTO products
        (id,category_id,name,slug,description,attributes,status,created_at,updated_at,version)
       VALUES ($1,$2,$3,$4,$5,'{}','published',NOW(),NOW(),1)
       ON CONFLICT (id) DO NOTHING`,
      [
        wishlistProduct.id,
        wishlistProduct.categoryId,
        wishlistProduct.name,
        wishlistProduct.slug,
        wishlistProduct.description,
      ],
    );
    const verifier: GoogleIdentityVerifier = {
      async verify(credential) {
        const second = credential === "second-google-credential";
        return {
          provider: "google",
          subject: second ? "subject-2" : "subject-1",
          email: second ? "second@example.com" : "customer@example.com",
          emailVerified: true,
          verifiedAt: "2026-08-05T00:00:00.000Z",
        };
      },
    };
    const module = createCustomerModule({
      transactions: new PostgresTransactionRunner(
        createPostgresPool({ databaseUrl: databaseUrl! }),
      ),
      verifier,
      tokens: new NodeSessionTokenService(),
      generateId: randomUUID,
      now: () => new Date().toISOString(),
      storefrontOrigin: origin,
      cookies,
      authenticationRateLimit: 100,
      wishlistProducts: {
        async getPublishedByIds(productIds) {
          return productIds.includes(wishlistProductId) ? [wishlistProduct] : [];
        },
      },
    });
    operations = module.operations;
    app = createApiApp({
      storefrontOrigin: origin,
      storefrontRouter: module.router,
    });
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE customer_addresses, customer_sessions, customer_external_identities, customers, guest_sessions, audit_events CASCADE",
    );
  });

  afterAll(async () => {
    await runCustomerMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("creates hash-only sessions with exact browser cookie boundaries", async () => {
    const agent = request.agent(app);
    const guest = await agent
      .post("/v1/storefront/guest-sessions")
      .set("Origin", origin)
      .expect(201);
    expectCookie(guest.headers["set-cookie"], "opendx_guest", [
      "HttpOnly",
      "SameSite=Lax",
      "Path=/v1/storefront",
      "Expires=",
    ]);

    const login = await loginAs(agent, "signed-google-credential");
    expect(login.body.data).toMatchObject({
      kind: "customer",
      email: "customer@example.com",
    });
    expect(JSON.stringify(login.body)).not.toContain("subject-1");
    expectCookie(login.headers["set-cookie"], "opendx_customer", [
      "HttpOnly",
      "SameSite=Lax",
      "Path=/v1/storefront",
      "Expires=",
    ]);
    expectCookie(
      login.headers["set-cookie"],
      "opendx_csrf",
      ["SameSite=Lax", "Path=/"],
      ["HttpOnly"],
    );
    expect(
      cookieLines(login.headers["set-cookie"]).some(
        (line) =>
          line.startsWith("opendx_csrf=;") &&
          line.includes("Path=/v1/storefront") &&
          line.includes("Expires=Thu, 01 Jan 1970 00:00:00 GMT"),
      ),
    ).toBe(true);

    const loginToken = cookiePair(
      login.headers["set-cookie"],
      "opendx_customer",
    );
    const restored = await agent.get("/v1/storefront/session").expect(200);
    expect(restored.body.data.kind).toBe("customer");
    const rotatedToken = cookiePair(
      restored.headers["set-cookie"],
      "opendx_customer",
    );
    expect(rotatedToken).not.toBe(loginToken);
    await request(app)
      .get("/v1/storefront/account")
      .set("Cookie", loginToken)
      .expect(401);
    const stored = await pool.query("SELECT token_hash FROM customer_sessions");
    expect(stored.rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);

    const logoutCsrf = cookieValue(
      restored.headers["set-cookie"],
      "opendx_csrf",
    );
    await agent
      .post("/v1/storefront/logout")
      .set("Origin", origin)
      .set("x-csrf-token", logoutCsrf)
      .expect(200);
    await request(app)
      .get("/v1/storefront/account")
      .set("Cookie", rotatedToken)
      .expect(401);
    await loginAs(agent, "signed-google-credential");
    await agent.get("/v1/storefront/account").expect(200);
  });

  it("serializes concurrent first login for the same Google subject", async () => {
    const attempts = await Promise.all([
      request(app)
        .post("/v1/storefront/auth/google")
        .set("Origin", origin)
        .send({ credential: "signed-google-credential" }),
      request(app)
        .post("/v1/storefront/auth/google")
        .set("Origin", origin)
        .send({ credential: "signed-google-credential" }),
    ]);
    expect(attempts.map(({ status }) => status)).toEqual([200, 200]);
    const counts = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM customers) AS customers,
        (SELECT count(*)::int FROM customer_external_identities) AS identities,
        (SELECT count(*)::int FROM customer_sessions) AS sessions
    `);
    expect(counts.rows[0]).toEqual({
      customers: 1,
      identities: 1,
      sessions: 2,
    });
  });

  it("does not rotate one customer token out from under parallel account reads", async () => {
    const login = await loginAs(request(app), "signed-google-credential");
    const customerCookie = cookiePair(
      login.headers["set-cookie"],
      "opendx_customer",
    );
    const reads = await Promise.all([
      request(app).get("/v1/storefront/account").set("Cookie", customerCookie),
      request(app)
        .get("/v1/storefront/account/addresses")
        .set("Cookie", customerCookie),
    ]);
    expect(reads.map(({ status }) => status)).toEqual([200, 200]);
    expect(
      reads.every(({ headers }) => headers["set-cookie"] === undefined),
    ).toBe(true);
  });

  it("clears an invalid customer cookie and restores a valid guest session", async () => {
    const guest = await request(app)
      .post("/v1/storefront/guest-sessions")
      .set("Origin", origin)
      .expect(201);
    const guestCookie = cookiePair(guest.headers["set-cookie"], "opendx_guest");
    const restored = await request(app)
      .get("/v1/storefront/session")
      .set("Cookie", `opendx_customer=invalid-token; ${guestCookie}`)
      .expect(200);
    expect(restored.body.data.kind).toBe("guest");
    const cleared = cookieLines(restored.headers["set-cookie"]).find((value) =>
      value.startsWith("opendx_customer="),
    );
    expect(cleared).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("revokes a newly issued session when login-time cart inspection fails", async () => {
    const verifier: GoogleIdentityVerifier = {
      async verify() {
        return {
          provider: "google",
          subject: "subject-cart-failure",
          email: "cart-failure@example.com",
          emailVerified: true,
          verifiedAt: "2026-08-05T00:00:00.000Z",
        };
      },
    };
    const module = createCustomerModule({
      transactions: new PostgresTransactionRunner(
        createPostgresPool({ databaseUrl: databaseUrl! }),
      ),
      verifier,
      tokens: new NodeSessionTokenService(),
      generateId: randomUUID,
      now: () => new Date().toISOString(),
      storefrontOrigin: origin,
      cookies,
      authenticationRateLimit: 20,
      wishlistProducts: { async getPublishedByIds() { return []; } },
      cartLoginResolver: {
        async inspect() {
          throw new Error("Cart dependency unavailable");
        },
      },
    });
    const failingApp = createApiApp({
      storefrontOrigin: origin,
      storefrontRouter: module.router,
    });
    await request(failingApp)
      .post("/v1/storefront/auth/google")
      .set("Origin", origin)
      .send({ credential: "signed-google-credential" })
      .expect(500);

    const sessions = await pool.query(
      "SELECT count(*)::int AS total, count(*) FILTER (WHERE revoked_at IS NULL)::int AS active FROM customer_sessions",
    );
    expect(sessions.rows[0]).toEqual({ total: 1, active: 0 });
    const audit = await pool.query(
      "SELECT action FROM audit_events WHERE actor_type = 'customer' ORDER BY occurred_at, action",
    );
    expect(audit.rows.map(({ action }) => action)).toEqual([
      "customer.auth.login",
      "customer.auth.logout",
    ]);
  });

  it("enforces origin, CSRF, credential audience, and address ownership", async () => {
    const first = request.agent(app);
    const firstLogin = await loginAs(first, "signed-google-credential");
    await first
      .post("/v1/storefront/account/addresses")
      .set("Origin", origin)
      .send(addressInput())
      .expect(403);
    const firstCsrf = cookieValue(
      firstLogin.headers["set-cookie"],
      "opendx_csrf",
    );
    const created = await first
      .post("/v1/storefront/account/addresses")
      .set("Origin", origin)
      .set("x-csrf-token", firstCsrf)
      .send(addressInput())
      .expect(201);
    expect(created.body.data.isDefault).toBe(true);
    await first
      .post("/v1/storefront/account/addresses")
      .set("Origin", "http://evil.example")
      .set("x-csrf-token", firstCsrf)
      .send(addressInput())
      .expect(403);

    const second = request.agent(app);
    const secondLogin = await loginAs(second, "second-google-credential");
    const secondCsrf = cookieValue(
      secondLogin.headers["set-cookie"],
      "opendx_csrf",
    );
    await second
      .patch(`/v1/storefront/account/addresses/${created.body.data.id}`)
      .set("Origin", origin)
      .set("x-csrf-token", secondCsrf)
      .send({ ...addressInput(), version: 1 })
      .expect(404);

    await request(app)
      .get("/v1/storefront/account")
      .set("Authorization", "Bearer staff-token")
      .expect(401);
  });

  it("searches normalized customer operations data with stable PostgreSQL pagination", async () => {
    await pool.query(
      `INSERT INTO customers
       (id,email,email_verified_at,full_name,phone_number,status,version,created_at,updated_at)
       VALUES
       ('b2400000-0000-4000-8000-000000000001','first@example.com',NOW(),'Nova Buyer','0901000001','active',1,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
       ('b2400000-0000-4000-8000-000000000002','second@example.com',NOW(),'Nova Buyer Two','0901000002','active',1,'2026-08-10T00:00:00.000Z','2026-08-10T00:00:00.000Z')`,
    );

    await expect(operations.search({ search: "  NOVA BUYER  ", page: 1, pageSize: 1 }))
      .resolves.toMatchObject({
        totalItems: 2,
        items: [{ id: "b2400000-0000-4000-8000-000000000002" }],
      });
    await expect(operations.search({ search: "nova buyer", page: 2, pageSize: 1 }))
      .resolves.toMatchObject({
        totalItems: 2,
        items: [{ id: "b2400000-0000-4000-8000-000000000001" }],
      });
    await expect(operations.search({ search: "0901000001", page: 1, pageSize: 20 }))
      .resolves.toMatchObject({
        totalItems: 1,
        items: [{ id: "b2400000-0000-4000-8000-000000000001" }],
      });
    await expect(operations.getMany([
      "b2400000-0000-4000-8000-000000000001",
      "b2400000-0000-4000-8000-000000000002",
    ])).resolves.toMatchObject([
      { id: "b2400000-0000-4000-8000-000000000001" },
      { id: "b2400000-0000-4000-8000-000000000002" },
    ]);
  });

  it("protects and isolates idempotent customer wishlist endpoints", async () => {
    await request(app).get("/v1/storefront/account/wishlist").expect(401);

    const first = request.agent(app);
    const firstLogin = await loginAs(first, "signed-google-credential");
    const firstCsrf = cookieValue(firstLogin.headers["set-cookie"], "opendx_csrf");
    await first
      .put(`/v1/storefront/account/wishlist/items/${wishlistProductId}`)
      .set("Origin", origin)
      .expect(403);
    const added = await first
      .put(`/v1/storefront/account/wishlist/items/${wishlistProductId}`)
      .set("Origin", origin)
      .set("x-csrf-token", firstCsrf)
      .expect(200);
    expect(added.body.data).toEqual({ productId: wishlistProductId, wished: true });
    await first
      .put(`/v1/storefront/account/wishlist/items/${wishlistProductId}`)
      .set("Origin", origin)
      .set("x-csrf-token", firstCsrf)
      .expect(200);

    const listed = await first.get("/v1/storefront/account/wishlist").expect(200);
    expect(listed.body).toMatchObject({
      data: [{ id: wishlistProductId }],
      meta: { page: 1, pageSize: 24, totalItems: 1, totalPages: 1 },
    });

    const second = request.agent(app);
    await loginAs(second, "second-google-credential");
    const isolated = await second.get("/v1/storefront/account/wishlist").expect(200);
    expect(isolated.body.meta.totalItems).toBe(0);

    const removed = await first
      .delete(`/v1/storefront/account/wishlist/items/${wishlistProductId}`)
      .set("Origin", origin)
      .set("x-csrf-token", firstCsrf)
      .expect(200);
    expect(removed.body.data).toEqual({ productId: wishlistProductId, wished: false });
    await first
      .delete(`/v1/storefront/account/wishlist/items/${wishlistProductId}`)
      .set("Origin", origin)
      .set("x-csrf-token", firstCsrf)
      .expect(200);
    await first
      .put("/v1/storefront/account/wishlist/items/b2000000-0000-4000-8000-000000000099")
      .set("Origin", origin)
      .set("x-csrf-token", firstCsrf)
      .expect(404);
  });
});

function addressInput() {
  return {
    recipientName: "Duy",
    phoneNumber: "0900000000",
    addressLine: "1 Nguyen Hue",
    ward: "Ben Nghe",
    provinceOrCity: "Ho Chi Minh City",
  };
}

interface LoginClient {
  post(path: string): request.Test;
}

async function loginAs(agent: LoginClient, credential: string) {
  return agent
    .post("/v1/storefront/auth/google")
    .set("Origin", origin)
    .send({ credential })
    .expect(200);
}

function cookieLines(header: string | string[] | undefined): readonly string[] {
  if (header === undefined) return [];
  return Array.isArray(header) ? header : [header];
}

function cookiePair(
  header: string | string[] | undefined,
  name: string,
): string {
  const line = cookieLines(header).find(
    (value) => value.startsWith(`${name}=`) && !value.startsWith(`${name}=;`),
  );
  if (line === undefined) throw new Error(`Missing ${name} cookie`);
  return line.split(";", 1)[0]!;
}

function cookieValue(
  header: string | string[] | undefined,
  name: string,
): string {
  return cookiePair(header, name).split("=", 2)[1]!;
}

function expectCookie(
  header: string | string[] | undefined,
  name: string,
  required: readonly string[],
  forbidden: readonly string[] = [],
): void {
  const line = cookieLines(header).find(
    (value) =>
      value.startsWith(`${name}=`) &&
      required.every((attribute) => value.includes(attribute)),
  );
  expect(line).toBeDefined();
  for (const attribute of required) expect(line).toContain(attribute);
  for (const attribute of forbidden) expect(line).not.toContain(attribute);
}
