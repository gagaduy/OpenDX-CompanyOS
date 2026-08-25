#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const confirmation = "I_UNDERSTAND_THIS_CREATES_A_REAL_PAYMENT";

export function validateProductionAcceptanceEnvironment(env) {
  if (env.SEPAY_ENVIRONMENT !== "production") {
    throw new Error("SEPAY_ENVIRONMENT must be production");
  }
  if (env.PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION !== confirmation) {
    throw new Error(
      "Production SePay acceptance requires explicit human confirmation",
    );
  }

  const amountVnd = Number(env.PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND);
  if (!Number.isInteger(amountVnd) || amountVnd < 10_000) {
    throw new Error(
      "Production SePay acceptance amount must be at least 10000 VND",
    );
  }

  for (const key of ["STOREFRONT_URL", "API_BASE_URL"]) {
    const value = env[key];
    if (
      value === undefined ||
      !value.startsWith("https://") ||
      value.includes("example.com")
    ) {
      throw new Error(`${key} must be a real HTTPS URL`);
    }
  }

  return {
    amountVnd,
    storefrontUrl: env.STOREFRONT_URL,
    apiBaseUrl: env.API_BASE_URL,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = validateProductionAcceptanceEnvironment(process.env);
  console.info(
    JSON.stringify(
      {
        status: "blocked_until_manual_flow_is_implemented",
        amountVnd: config.amountVnd,
        storefrontUrl: "[REDACTED]",
        apiBaseUrl: "[REDACTED]",
      },
      null,
      2,
    ),
  );
}
