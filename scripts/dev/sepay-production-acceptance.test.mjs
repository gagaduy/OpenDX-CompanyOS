/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { validateProductionAcceptanceEnvironment } from "./sepay-production-acceptance.mjs";

test("production acceptance refuses to run without explicit human confirmation", () => {
  assert.throws(
    () =>
      validateProductionAcceptanceEnvironment({
        SEPAY_ENVIRONMENT: "production",
        PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION: "",
      }),
    /confirmation/i,
  );
});

test("production acceptance refuses unsafe or tiny amount", () => {
  assert.throws(
    () =>
      validateProductionAcceptanceEnvironment({
        SEPAY_ENVIRONMENT: "production",
        PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION:
          "I_UNDERSTAND_THIS_CREATES_A_REAL_PAYMENT",
        PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND: "9999",
        STOREFRONT_URL: "https://shop.example.com",
        API_BASE_URL: "https://api.example.com",
      }),
    /amount/i,
  );
});

test("production acceptance accepts explicit safe minimum configuration", () => {
  assert.deepEqual(
    validateProductionAcceptanceEnvironment({
      SEPAY_ENVIRONMENT: "production",
      PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION:
        "I_UNDERSTAND_THIS_CREATES_A_REAL_PAYMENT",
      PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND: "10000",
      STOREFRONT_URL: "https://shop.merchant.example",
      API_BASE_URL: "https://api.merchant.example",
    }),
    {
      amountVnd: 10000,
      storefrontUrl: "https://shop.merchant.example",
      apiBaseUrl: "https://api.merchant.example",
    },
  );
});
