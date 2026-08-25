// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const required = [
  "SEPAY_ACCEPTANCE_CUSTOMER_COOKIE",
  "SEPAY_ACCEPTANCE_CSRF_TOKEN",
  "SEPAY_ACCEPTANCE_ADDRESS_ID",
  "SEPAY_ACCEPTANCE_PUBLIC_API_URL",
  "SEPAY_ACCEPTANCE_STAFF_BEARER",
];

async function main() {
  if (process.env.SEPAY_ACCEPTANCE_CONFIRM_SANDBOX !== "yes") {
    throw new Error(
      "Set SEPAY_ACCEPTANCE_CONFIRM_SANDBOX=yes to confirm an intentional sandbox transaction",
    );
  }
  for (const name of required) {
    if (process.env[name]?.trim().length === 0 || process.env[name] === undefined) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
  }

  const apiUrl = new URL(process.env.SEPAY_ACCEPTANCE_API_URL ?? "http://localhost:4000");
  const storefrontOrigin = process.env.SEPAY_ACCEPTANCE_STOREFRONT_ORIGIN ?? "http://localhost:3100";
  const publicApiUrl = new URL(process.env.SEPAY_ACCEPTANCE_PUBLIC_API_URL);
  if (publicApiUrl.protocol !== "https:") {
    throw new Error("SEPAY_ACCEPTANCE_PUBLIC_API_URL must use public HTTPS");
  }
  const cookie = process.env.SEPAY_ACCEPTANCE_CUSTOMER_COOKIE;
  const csrf = process.env.SEPAY_ACCEPTANCE_CSRF_TOKEN;
  const idempotencyKey = `sepay-sandbox-${Date.now()}`;
  const checkout = await apiRequest(
    new URL("/v1/storefront/checkouts", apiUrl),
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: storefrontOrigin,
        "X-CSRF-Token": csrf,
        "Idempotency-Key": idempotencyKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        addressId: process.env.SEPAY_ACCEPTANCE_ADDRESS_ID,
        ...(process.env.SEPAY_ACCEPTANCE_PROMOTION_CODE === undefined
          ? {}
          : { promotionCode: process.env.SEPAY_ACCEPTANCE_PROMOTION_CODE }),
      }),
    },
  );
  const payment = checkout.data.payment;
  const actionUrl = new URL(payment.actionUrl);
  if (!actionUrl.hostname.includes("sandbox")) {
    throw new Error("Provider action is not a SePay sandbox endpoint");
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "opendx-sepay-sandbox-"));
  try {
    const formPath = join(temporaryDirectory, "checkout.html");
    await writeFile(formPath, paymentForm(actionUrl, payment.fields), {
      mode: 0o600,
    });
    console.log(
      JSON.stringify(
        {
          checkoutId: checkout.data.id,
          orderId: checkout.data.orderId,
          amountVnd: checkout.data.totalVnd,
          providerOrigin: actionUrl.origin,
          submittedFieldNames: payment.fields.map(({ name }) => name),
          callback: new URL("/v1/webhooks/sepay", publicApiUrl).toString(),
          evidence: "values and credentials redacted",
        },
        null,
        2,
      ),
    );
    if (process.env.SEPAY_ACCEPTANCE_OPEN_BROWSER === "yes") {
      spawn("xdg-open", [formPath], { stdio: "ignore", detached: true }).unref();
    } else {
      console.log(`Open ${formPath} in a browser to complete the sandbox payment.`);
    }

    const completed = await waitForPaidCheckout(
      apiUrl,
      checkout.data.id,
      cookie,
      Number(process.env.SEPAY_ACCEPTANCE_TIMEOUT_SECONDS ?? "900"),
    );
    const paymentSummary = await findPayment(apiUrl, completed.orderId);
    const reconciled = await apiRequest(
      new URL(`/v1/admin/payments/${paymentSummary.id}/reconciliations`, apiUrl),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SEPAY_ACCEPTANCE_STAFF_BEARER}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );
    if (reconciled.data.status !== "paid") {
      throw new Error("Sandbox reconciliation did not retain paid status");
    }
    console.log(
      JSON.stringify(
        {
          result: "passed",
          checkoutId: completed.id,
          orderId: completed.orderId,
          paymentId: paymentSummary.id,
          status: reconciled.data.status,
          eventCount: reconciled.data.events.length,
          reconciliationCount: reconciled.data.reconciliations.length,
          credentials: "redacted",
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function waitForPaidCheckout(apiUrl, checkoutId, cookie, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1_000;
  while (Date.now() < deadline) {
    const checkout = await apiRequest(
      new URL(`/v1/storefront/checkouts/${checkoutId}`, apiUrl),
      { headers: { Cookie: cookie } },
    );
    if (checkout.data.status === "completed") return checkout.data;
    if (["expired", "canceled"].includes(checkout.data.status)) {
      throw new Error(`Checkout ended as ${checkout.data.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error("Timed out waiting for authenticated IPN or reconciliation");
}

async function findPayment(apiUrl, orderId) {
  const response = await apiRequest(
    new URL("/v1/admin/payments?page=1&pageSize=100", apiUrl),
    {
      headers: {
        Authorization: `Bearer ${process.env.SEPAY_ACCEPTANCE_STAFF_BEARER}`,
      },
    },
  );
  const payment = response.data.items.find((item) => item.orderId === orderId);
  if (payment === undefined) throw new Error("Paid sandbox payment was not listed");
  return payment;
}

async function apiRequest(url, init) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || payload?.success !== true) {
    throw new Error(`API request failed with HTTP ${response.status}`);
  }
  return payload;
}

function paymentForm(actionUrl, fields) {
  const inputs = fields
    .map(
      ({ name, value }) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>SePay sandbox acceptance</title></head>
<body><form id="payment" method="post" action="${escapeHtml(actionUrl.toString())}">
${inputs}
<button type="submit">Continue to SePay sandbox</button>
</form><script>document.getElementById("payment").submit()</script></body></html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
