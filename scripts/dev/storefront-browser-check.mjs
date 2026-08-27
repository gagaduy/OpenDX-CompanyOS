// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const storefrontUrl = process.env.STOREFRONT_URL ?? "http://localhost:3100";
const outputDirectory = process.env.BROWSER_EVIDENCE_DIR ?? join(tmpdir(), "opendx-storefront-browser");
const viewports = [
  { width: 390, height: 844, name: "mobile" },
  { width: 768, height: 1024, name: "tablet" },
  { width: 1440, height: 900, name: "desktop" },
];
const routes = [
  { path: "/", expected: "Nova Phone Pro", selector: ".commerce-home-page", id: "home" },
  { path: "/products", expected: "Sản phẩm công nghệ", selector: ".catalog-browser", id: "products" },
  { path: "/categories/phones", expected: "Sản phẩm công nghệ", selector: ".catalog-browser", id: "category" },
  { path: "/search?query=phone", expected: "Kết quả cho “phone”", selector: ".catalog-browser", id: "search" },
  { path: "/products/nova-phone", expected: "Nova Phone Pro", selector: ".product-detail", id: "product-detail" },
  { path: "/sign-in", expected: "Đăng nhập NovaCommerce", selector: ".auth-panel", id: "sign-in" },
  { path: "/account", expected: "Xin chào, Duy Duong", selector: ".account-workspace", id: "account" },
  { path: "/account/addresses", expected: "Thêm địa chỉ", selector: ".account-workspace", id: "addresses" },
  { path: "/account/wishlist", expected: "Sản phẩm yêu thích", selector: ".wishlist-page", id: "wishlist" },
  { path: "/cart", expected: "Giỏ hàng", selector: ".cart-layout", id: "cart" },
  { path: "/checkout", expected: "Hoàn tất đơn hàng", selector: ".checkout-layout", id: "checkout" },
  { path: "/payment/return", expected: "Thanh toán đã xác nhận", selector: ".payment-status-panel", id: "payment" },
  { path: "/orders", expected: "Lịch sử mua sắm của bạn", selector: ".order-list", id: "orders" },
  { path: "/orders/order-1", expected: "NVC-20260806-A1B2C3D4", selector: ".order-detail-layout", id: "order-detail" },
];

async function main() {
  const chrome = await findChrome();
  const profile = await mkdtemp(join(tmpdir(), "opendx-chrome-"));
  const port = 19_000 + Math.floor(Math.random() * 500);
  const browser = spawn(chrome, [
    "--headless=new", "--disable-gpu", "--no-sandbox",
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });
  try {
    await waitForChrome(port);
    await mkdir(outputDirectory, { recursive: true });
    const target = await fetch(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent(storefrontUrl)}`,
      { method: "PUT" },
    ).then(requireOk).then((response) => response.json());
    const client = new CdpClient(target.webSocketDebuggerUrl);
    await client.connect();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Network.enable");
    await installFixtures(client);
    const evidence = [];
    for (const viewport of viewports) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width, height: viewport.height,
        deviceScaleFactor: 1, mobile: viewport.width < 768,
      });
      for (const theme of ["dark", "light"]) {
        const signIn = routes.find((route) => route.id === "sign-in");
        const home = routes.find((route) => route.id === "home");
        evidence.push(await verifyRoute(client, viewport, theme, signIn, true));
        evidence.push(await verifyRoute(client, viewport, theme, home, true));
        for (const route of routes.filter(({ id }) => id !== "sign-in" && id !== "home")) {
          evidence.push(await verifyRoute(client, viewport, theme, route, false));
        }
      }
    }
    client.close();
    console.log(JSON.stringify({ storefrontUrl, outputDirectory, evidence }, null, 2));
  } finally {
    await stopProcess(browser);
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

async function installFixtures(client) {
  const fixtures = createFixtures();
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const fixtures = ${JSON.stringify(fixtures)};
      localStorage.setItem("novacommerce.pending-checkout", "checkout-1");
      document.cookie = "opendx_csrf=browser-check-token; path=/; SameSite=Lax";
      window.fetch = async (input) => {
        const rawUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
        const url = new URL(rawUrl, location.href);
        let fixture;
        if (url.pathname === "/v1/storefront/session") {
          fixture = location.pathname === "/sign-in" ? fixtures.anonymousSession : fixtures.customerSession;
        } else if (url.pathname === "/v1/storefront/products") {
          fixture = fixtures.products;
        } else if (url.pathname.startsWith("/v1/storefront/products/")) {
          fixture = fixtures.product;
        } else {
          fixture = fixtures.byPath[url.pathname];
        }
        if (fixture === undefined) {
          return new Response(JSON.stringify({ success: false, message: "Missing browser fixture" }), {
            status: 404, headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        }
        return new Response(JSON.stringify(fixture), {
          status: 200, headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      };
    })();`,
  });
}

async function verifyRoute(client, viewport, theme, route, hardReload) {
  if (hardReload) {
    await client.send("Page.navigate", { url: new URL(route.path, storefrontUrl).toString() });
  } else {
    await client.send("Runtime.evaluate", {
      expression: `history.pushState({}, "", ${JSON.stringify(route.path)});
        dispatchEvent(new PopStateEvent("popstate"));`,
    });
  }
  await waitForCondition(
    client,
    `document.readyState === "complete"
      && document.querySelector(${JSON.stringify(route.selector)}) !== null
      && document.body.innerText.includes(${JSON.stringify(route.expected)})`,
    `${viewport.name} ${theme} ${route.path}: route did not settle`,
  );
  await setTheme(client, theme);
  await focusFirstInteractiveElement(client);
  const result = await evaluate(client, `(() => {
    const active = document.activeElement;
    const style = active instanceof HTMLElement ? getComputedStyle(active) : null;
    return {
      route: location.pathname + location.search,
      theme: document.documentElement.dataset.theme,
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      hasMain: document.querySelector("main") !== null,
      hasSurface: document.querySelector(${JSON.stringify(route.selector)}) !== null,
      alert: document.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
      focus: {
        tag: active?.tagName ?? null,
        visible: active?.matches(":focus-visible") ?? false,
        outline: style?.outlineStyle ?? null,
        boxShadow: style?.boxShadow ?? null,
      },
      homepage: location.pathname === "/" ? {
        hero: document.querySelector(".homepage-hero-region") !== null,
        categories: document.querySelectorAll(".homepage-category-rail nav a").length,
        assurances: document.querySelectorAll(".service-assurance-item").length,
        promotions: document.querySelectorAll(".category-promotion-card").length,
        tabs: document.querySelectorAll('[role="tab"]').length,
        canvas: document.querySelectorAll("canvas").length,
      } : null,
    };
  })()`);
  assertRoute(result, viewport, theme, route);
  await client.send("Runtime.evaluate", {
    expression: "document.activeElement instanceof HTMLElement && document.activeElement.blur()",
  });
  const screenshotPath = join(
    outputDirectory,
    `${route.id}-${viewport.name}-${theme}-${viewport.width}x${viewport.height}.png`,
  );
  await saveScreenshot(client, screenshotPath);
  return { viewport, theme, requestedRoute: route.path, screenshotPath, ...result };
}

function assertRoute(result, viewport, theme, route) {
  if (!result.hasMain || !result.hasSurface) {
    throw new Error(`${viewport.name} ${theme} ${route.path}: semantic surface is missing`);
  }
  if (result.alert !== null) {
    throw new Error(`${viewport.name} ${theme} ${route.path}: alert: ${result.alert}`);
  }
  if (result.documentWidth > result.viewportWidth) {
    throw new Error(`${viewport.name} ${theme} ${route.path}: overflow ${result.documentWidth}px > ${result.viewportWidth}px`);
  }
  if (result.viewportWidth !== viewport.width) {
    throw new Error(
      `${viewport.name} ${theme} ${route.path}: layout viewport expanded to ${result.viewportWidth}px from ${viewport.width}px`,
    );
  }
  if (result.theme !== theme) {
    throw new Error(`${viewport.name} ${route.path}: expected ${theme} theme, got ${result.theme}`);
  }
  if (
    result.focus.tag === "BODY" || result.focus.tag === "HTML" || !result.focus.visible ||
    (result.focus.outline === "none" && result.focus.boxShadow === "none")
  ) {
    throw new Error(
      `${viewport.name} ${theme} ${route.path}: keyboard focus is not visibly indicated ${JSON.stringify(result.focus)}`,
    );
  }
  if (result.homepage !== null) {
    const home = result.homepage;
    if (!home.hero || home.categories < 4 || home.assurances !== 4 || home.promotions < 4 || home.tabs !== 3 || home.canvas !== 0) {
      throw new Error(`${viewport.name} ${theme}: homepage hierarchy is incomplete ${JSON.stringify(home)}`);
    }
  }
}

async function setTheme(client, theme) {
  if (await evaluate(client, "document.documentElement.dataset.theme") === theme) return;
  const label = theme === "light" ? "Dùng giao diện sáng" : "Dùng giao diện tối";
  await client.send("Runtime.evaluate", {
    expression: `document.querySelector('[aria-label=${JSON.stringify(label)}]')?.click()`,
  });
  await waitForCondition(
    client, `document.documentElement.dataset.theme === ${JSON.stringify(theme)}`,
    `Theme did not change to ${theme}`,
  );
}

async function focusFirstInteractiveElement(client) {
  await client.send("Runtime.evaluate", { expression: `(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.body.focus(); scrollTo({ top: 0, left: 0 });
  })()` });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9,
  });
}

function createFixtures() {
  const image = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720"><rect width="960" height="720" fill="#071426"/><circle cx="700" cy="180" r="210" fill="#123f7a"/><rect x="270" y="100" width="420" height="520" rx="56" fill="#dce7f5"/><rect x="300" y="140" width="360" height="400" rx="32" fill="#0d2340"/><circle cx="345" cy="190" r="28" fill="#4d8dff"/><text x="480" y="600" fill="#dce7f5" text-anchor="middle" font-family="sans-serif" font-size="36">NovaCommerce</text></svg>',
  );
  const categories = [
    ["phones", "Điện thoại"], ["laptops", "Laptop"],
    ["audio", "Âm thanh"], ["gaming", "Gaming"],
  ].map(([slug, name], index) => ({
    id: `category-${index + 1}`, name, slug,
    description: `${name} NovaCommerce`, sortOrder: index,
  }));
  const products = categories.map((category, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index + 1}`,
    categoryId: category.id, categoryName: category.name,
    name: index === 0 ? "Nova Phone Pro" : `Nova ${category.name} Pro`,
    slug: index === 0 ? "nova-phone" : `nova-${category.slug}`,
    brand: "NovaCommerce",
    description: "Hiệu năng cao, thiết kế bền vững và bảo hành chính hãng.",
    attributes: { warranty: "24 tháng" },
    primaryMedia: {
      id: `media-${index + 1}`,
      altText: index === 0 ? "Nova Phone Pro" : `Nova ${category.name} Pro`,
      contentUrl: image,
    },
    variants: [{
      id: `variant-${index + 1}`, sku: `NOVA-${index + 1}`,
      title: "Tiêu chuẩn", optionValues: { color: "Titanium" },
      price: {
        amountMinor: 29_990_000 + index * 1_000_000, currency: "VND",
        previousAmountMinor: 32_990_000 + index * 1_000_000, discountPercentage: 9,
      },
      availableQuantity: 12, purchasable: true,
    }],
  }));
  const envelope = (data, extra = {}) => ({ success: true, message: "Browser fixture", data, ...extra });
  const customerSession = envelope({
    kind: "customer", customerId: "customer-1", email: "duy@example.com",
    expiresAt: "2099-01-01T00:00:00.000Z", cartResolution: "not_required",
  });
  const anonymousSession = envelope({ kind: "anonymous" });
  const cart = envelope({
    id: "cart-1", ownerKind: "customer", version: 2, status: "active",
    items: [{
      id: "cart-line-1", variantId: "variant-1", productId: products[0].id,
      productName: products[0].name, productSlug: products[0].slug,
      variantTitle: "Tiêu chuẩn", sku: "NOVA-1", optionValues: { color: "Titanium" },
      primaryMediaUrl: image, primaryMediaAltText: products[0].primaryMedia.altText,
      quantity: 1, unitPriceVnd: 29_990_000, subtotalVnd: 29_990_000,
      availableQuantity: 12, purchasable: true, change: "unchanged",
    }],
    itemCount: 1, totalVnd: 29_990_000, requiresAction: false,
  });
  const profile = envelope({
    id: "customer-1", email: "duy@example.com", fullName: "Duy Duong",
    phoneNumber: "0901000001", version: 1,
  });
  const addresses = envelope([{
    id: "address-1", customerId: "customer-1", recipientName: "Duy Duong",
    phoneNumber: "0901000001", addressLine: "1 Nguyễn Huệ", ward: "Bến Nghé",
    provinceOrCity: "Hồ Chí Minh", isDefault: true, version: 1,
    createdAt: "2026-08-06T08:00:00.000Z", updatedAt: "2026-08-06T08:00:00.000Z",
  }]);
  const orderSummary = {
    id: "order-1", publicNumber: "NVC-20260806-A1B2C3D4", status: "paid",
    totalVnd: 29_990_000, currency: "VND",
    createdAt: "2026-08-06T08:00:00.000Z", updatedAt: "2026-08-06T08:05:00.000Z",
  };
  const order = envelope({
    ...orderSummary, checkoutId: "checkout-1", addressSnapshot: {}, contactSnapshot: {},
    subtotalVnd: 32_990_000, discountVnd: 3_000_000,
    taxMode: "included_not_separated", reservationExpiresAt: "2026-08-06T09:00:00.000Z",
    paidAt: "2026-08-06T08:05:00.000Z", version: 2,
    lines: [{
      id: "order-line-1", variantId: "variant-1", sku: "NOVA-1",
      productTitle: "Nova Phone Pro", variantLabel: "Titanium", quantity: 1,
      unitPriceVnd: 32_990_000, discountAllocationVnd: 3_000_000,
      lineTotalVnd: 29_990_000, linePosition: 0,
    }],
    history: [{
      previousStatus: "pending_payment", newStatus: "paid", actorType: "provider",
      reasonCode: "PAYMENT_CONFIRMED", occurredAt: "2026-08-06T08:05:00.000Z",
    }],
  });
  return {
    customerSession, anonymousSession,
    products: envelope(products, { meta: { page: 1, pageSize: 12, totalItems: products.length, totalPages: 1 } }),
    product: envelope(products[0]),
    byPath: {
      "/v1/storefront/categories": envelope(categories),
      "/v1/storefront/hero-slides": envelope(categories.map((category, index) => ({ category, product: products[index] }))),
      "/v1/storefront/cart": cart,
      "/v1/storefront/account": profile,
      "/v1/storefront/account/addresses": addresses,
      "/v1/storefront/account/wishlist": envelope([products[0]], { meta: { page: 1, pageSize: 12, totalItems: 1, totalPages: 1 } }),
      "/v1/storefront/checkouts/checkout-1": envelope({ id: "checkout-1", orderId: "order-1", status: "completed" }),
      "/v1/storefront/orders": envelope({ items: [orderSummary], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }),
      "/v1/storefront/orders/order-1": order,
    },
  };
}

async function saveScreenshot(client, path) {
  const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(path, Buffer.from(screenshot.data, "base64"));
}

async function waitForCondition(client, expression, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(client, expression)) return;
    await delay(100);
  }
  const diagnostics = await evaluate(client, `({
    url: location.href,
    heading: document.querySelector("h1")?.textContent?.trim() ?? null,
    alert: document.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
    status: document.querySelector('[role="status"]')?.textContent?.trim() ?? null,
    body: document.body.innerText.slice(0, 400),
  })`);
  throw new Error(
    `${message}: ${JSON.stringify({ diagnostics, browserEvents: client.events.slice(-8) })}`,
  );
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (response.exceptionDetails !== undefined) {
    throw new Error(`Browser evaluation failed: ${response.exceptionDetails.text}`);
  }
  return response.result.value;
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }
  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id === undefined) {
        if (
          message.method === "Runtime.exceptionThrown" ||
          message.method === "Runtime.consoleAPICalled" ||
          message.method === "Network.loadingFailed" ||
          (message.method === "Network.responseReceived" && message.params.response.status >= 400)
        ) {
          this.events.push(message);
        }
        return;
      }
      const pending = this.pending.get(message.id);
      if (pending === undefined) return;
      this.pending.delete(message.id);
      if (message.error === undefined) pending.resolve(message.result);
      else pending.reject(new Error(message.error.message));
    });
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.socket.close(); }
}

async function findChrome() {
  const candidates = [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* Continue. */ }
  }
  throw new Error("Chrome not found; set CHROME_BIN to a Chrome or Chromium executable");
}

async function waitForChrome(port) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return; } catch { /* Retry. */ }
    await delay(100);
  }
  throw new Error("Chrome DevTools endpoint did not become ready");
}

async function stopProcess(processHandle) {
  if (processHandle.exitCode !== null) return;
  const exited = new Promise((resolve) => processHandle.once("exit", resolve));
  processHandle.kill("SIGTERM");
  await Promise.race([exited, delay(2_000)]);
  if (processHandle.exitCode === null) {
    processHandle.kill("SIGKILL");
    await Promise.race([exited, delay(2_000)]);
  }
}

function requireOk(response) {
  if (!response.ok) throw new Error(`Chrome DevTools request failed with ${response.status}`);
  return response;
}
function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

await main();
