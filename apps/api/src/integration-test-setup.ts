// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { afterAll } from "vitest";
import { runCartMigrations } from "./modules/cart/infrastructure/database/run-cart-migrations";
import { runCheckoutMigrations } from "./modules/checkout/infrastructure/database/run-checkout-migrations";
import { runCustomerMigrations } from "./modules/customer/infrastructure/database/run-customer-migrations";
import { runInventoryMigrations } from "./modules/inventory/infrastructure/database/run-inventory-migrations";
import { runOrderMigrations } from "./modules/order/infrastructure/database/run-order-migrations";
import { runPaymentMigrations } from "./modules/payment/infrastructure/database/run-payment-migrations";
import { runPromotionMigrations } from "./modules/promotion/infrastructure/database/run-promotion-migrations";
import {
  runAgenticMigrations,
  runCatalogMigrations,
  runCompanyCoreMigrations,
  runCrmMigrations,
  runReportingMigrations,
  runSupportMigrations,
} from "./shared/database/run-migrations";

const databaseUrl = process.env.TEST_DATABASE_URL;

afterAll(async () => {
  if (databaseUrl === undefined) return;

  await runAgenticMigrations(databaseUrl, "down");
  await runReportingMigrations(databaseUrl, "down");
  await runSupportMigrations(databaseUrl, "down");
  await runCrmMigrations(databaseUrl, "down");
  await runPaymentMigrations(databaseUrl, "down");
  await runOrderMigrations(databaseUrl, "down");
  await runCheckoutMigrations(databaseUrl, "down");
  await runPromotionMigrations(databaseUrl, "down");
  await runCartMigrations(databaseUrl, "down");
  await runCustomerMigrations(databaseUrl, "down");
  await runInventoryMigrations(databaseUrl, "down");
  await runCompanyCoreMigrations(databaseUrl, "down");
  await runCatalogMigrations(databaseUrl, "down");
});
