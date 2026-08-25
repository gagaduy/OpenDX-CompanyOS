// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { constants } from "node:fs";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const consoleUrl = process.env.CONSOLE_URL ?? "http://localhost:3000";
const outputDirectory = process.env.BROWSER_EVIDENCE_DIR ?? join(tmpdir(), "opendx-console-browser");
const authority = "http://localhost:8080/realms/opendx";
const clientId = "opendx-console";
const themeKey = "opendx.console.theme";
const ids = {
  category: "c1100000-0000-4000-8000-000000000001",
  product: "c1200000-0000-4000-8000-000000000001",
  variant: "c1300000-0000-4000-8000-000000000001",
  inventory: "c1350000-0000-4000-8000-000000000001",
  order: "c1700000-0000-4000-8000-000000000001",
  customer: "c1400000-0000-4000-8000-000000000001",
  checkout: "c1600000-0000-4000-8000-000000000001",
  address: "c1450000-0000-4000-8000-000000000001",
  line: "c1750000-0000-4000-8000-000000000001",
  payment: "c1800000-0000-4000-8000-000000000001",
  attempt: "c1850000-0000-4000-8000-000000000001",
  event: "c1900000-0000-4000-8000-000000000001",
  reconciliation: "c1950000-0000-4000-8000-000000000001",
};
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];
const themes = ["night", "light"];
const surfaces = [
  { name: "sign-in", path: "/sign-in", heading: "Staff console", standalone: true },
  { name: "auth-callback", path: "/auth/callback", heading: "Sign-in could not be completed", standalone: true, allowAlert: true },
  { name: "products", path: "/products", heading: "Products" },
  { name: "product-new", path: "/products/new", heading: "Create product" },
  { name: "product-detail", path: `/products/${ids.product}`, heading: "Nova Laptop Pro" },
  { name: "categories", path: "/categories", heading: "Categories" },
  { name: "inventory", path: "/inventory", heading: "Inventory" },
  { name: "orders", path: "/orders", heading: "Orders" },
  { name: "order-detail", path: `/orders/${ids.order}`, heading: "NVC-20260809-00000001" },
  { name: "payments", path: "/payments", heading: "Payments" },
  { name: "payment-detail", path: `/payments/${ids.payment}`, heading: "NVC-PAY-0001", comingSoon: true },
  { name: "company-overview", path: "/company-overview", heading: "Company operating console" },
];

async function main() {
  const chrome = await findChrome();
  const profile = await mkdtemp(join(tmpdir(), "opendx-console-chrome-"));
  const port = 19_500 + Math.floor(Math.random() * 400);
  const chromeProcess = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  try {
    await waitForChrome(port);
    await mkdir(outputDirectory, { recursive: true });
    const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(consoleUrl)}`, { method: "PUT" }).then(requireOk).then((response) => response.json());
    const client = new CdpClient(target.webSocketDebuggerUrl);
    await client.connect();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    const sessionKey = `oidc.user:${authority}:${clientId}`;
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: fixtureScript(sessionKey) });
    await waitForConsoleOrigin(client);
    const evidence = [];
    let appLoaded = false;

    for (const theme of themes) {
      for (const viewport of viewports) {
        await client.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 700 });
        for (const surface of surfaces) {
          await evaluate(client, `localStorage.setItem(${JSON.stringify(themeKey)}, ${JSON.stringify(theme)})`);
          if (!appLoaded) {
            await client.send("Page.navigate", { url: `${consoleUrl}${surface.path}` });
            appLoaded = true;
          } else {
            await evaluate(client, `history.pushState({}, "", ${JSON.stringify(surface.path)}); dispatchEvent(new PopStateEvent("popstate"))`);
          }
          await waitForHeading(client, surface.heading);
          if (!surface.standalone) await ensureTheme(client, theme);
          await keyboardProbe(client);
          const result = await evaluate(client, surfaceProbeExpression());
          assertSurface(result, surface, viewport, theme);
          const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
          const screenshotPath = join(outputDirectory, `${surface.name}-${theme}-${viewport.name}-${viewport.width}x${viewport.height}.png`);
          await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"), { mode: 0o600 });
          evidence.push({ surface: surface.name, theme, viewport, heading: result.heading, screenshotPath });
          await delay(250);
        }
      }
    }

    await verifyMobileDrawer(client, sessionKey);
    await verifyListToDetail(client);
    await setSession(client, sessionKey, "catalog_manager");
    await client.send("Page.navigate", { url: `${consoleUrl}/orders` });
    await waitForHeading(client, "Permission denied");
    const denied = await evaluate(client, `({ heading: document.querySelector('h1')?.textContent?.trim(), apiCalls: window.__operationApiCalls ?? [] })`);
    if (denied.apiCalls.some((path) => path.startsWith("/v1/admin/orders"))) throw new Error(`Denied route called an operations API: ${JSON.stringify(denied.apiCalls)}`);
    client.close();
    console.log(JSON.stringify({ consoleUrl, outputDirectory, routeCount: surfaces.length, viewports: viewports.length, themes: themes.length, evidence, denied }, null, 2));
  } finally {
    chromeProcess.kill("SIGTERM");
    await new Promise((resolve) => chromeProcess.once("exit", resolve));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

async function verifyMobileDrawer(client, sessionKey) {
  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await setSession(client, sessionKey, "administrator");
  await client.send("Page.navigate", { url: `${consoleUrl}/products` });
  await waitForHeading(client, "Products");
  await evaluate(client, `document.querySelector('button[aria-label="Open navigation"]')?.click()`);
  let drawer;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    drawer = await evaluate(client, `(() => { const sidebar=document.querySelector('.consoleSidebar'); const rect=sidebar?.getBoundingClientRect(); return { open:sidebar?.getAttribute('data-mobile-open'), left:rect?.left, width:rect?.width }; })()`);
    if (drawer.open === "true" && drawer.left >= 0) break;
    await delay(50);
  }
  if (drawer.open !== "true" || drawer.left < 0 || drawer.width > 336) throw new Error(`Mobile navigation drawer did not open safely: ${JSON.stringify(drawer)}`);
}

async function verifyListToDetail(client) {
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: `${consoleUrl}/orders` });
  await waitForHeading(client, "Orders");
  await evaluate(client, `document.querySelector('a[aria-label^="Open NVC-"]')?.click()`);
  await waitForHeading(client, "NVC-20260809-00000001");
}

async function setSession(client, sessionKey, role) {
  await evaluate(client, `sessionStorage.setItem(${JSON.stringify(sessionKey)}, ${JSON.stringify(session(role))})`);
}

async function ensureTheme(client, theme) {
  const current = await evaluate(client, `document.querySelector('.consoleLayout')?.getAttribute('data-theme')`);
  if (current === theme) return;
  await evaluate(client, `document.querySelector('button[aria-label="Use ${theme === "night" ? "night" : "light"} theme"]')?.click()`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await evaluate(client, `document.querySelector('.consoleLayout')?.getAttribute('data-theme') === ${JSON.stringify(theme)}`)) return;
    await delay(50);
  }
  throw new Error(`Console theme did not change to ${theme}`);
}

function session(role) {
  return JSON.stringify({ access_token: "browser-check-token", token_type: "Bearer", scope: "openid", profile: { sub: "staff-browser-check", name: "Browser Check", realm_access: { roles: [role] } }, expires_at: Math.floor(Date.now() / 1000) + 3600 });
}

function fixtureScript(sessionKey) {
  const fixtures = fixturesByPath();
  return `(() => { const key=${JSON.stringify(sessionKey)}; if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, ${JSON.stringify(session("administrator"))}); window.__operationApiCalls=[]; window.__browserErrors=[]; addEventListener('error', event => window.__browserErrors.push(event.message)); addEventListener('unhandledrejection', event => window.__browserErrors.push(String(event.reason?.message ?? event.reason))); const fixtures=${JSON.stringify(fixtures)}; const original=window.fetch.bind(window); window.fetch=async (input, init) => { const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url, location.href); const intercepted=['/v1/admin/catalog','/v1/admin/inventory','/v1/admin/orders','/v1/admin/payments'].some(prefix=>url.pathname.startsWith(prefix)); if (!intercepted) return original(input, init); window.__operationApiCalls.push(url.pathname); const method=init?.method??'GET'; const fixtureKey=url.pathname+(method==='POST'?'#POST':method==='PATCH'?'#PATCH':method==='PUT'?'#PUT':''); const value=fixtures[fixtureKey] ?? fixtures[url.pathname]; return new Response(JSON.stringify(value ?? {success:false,message:'missing fixture',errorCode:'NOT_FOUND'}), {status:value===undefined?404:200,headers:{'Content-Type':'application/json'}}); }; })();`;
}

function fixturesByPath() {
  const now = "2026-08-09T08:00:00.000Z";
  const category = { id: ids.category, name: "Laptops", slug: "laptops", description: "Portable computers", sortOrder: 0, status: "active", createdAt: now, updatedAt: now, version: 1 };
  const product = { id: ids.product, categoryId: ids.category, name: "Nova Laptop Pro", slug: "nova-laptop-pro", brand: "NovaCommerce", description: "Professional laptop", attributes: { memory: "16 GB" }, status: "published", createdAt: now, updatedAt: now, version: 2 };
  const productSummary = { id: ids.product, categoryId: ids.category, categoryName: "Laptops", name: "Nova Laptop Pro", slug: "nova-laptop-pro", brand: "NovaCommerce", status: "published", updatedAt: now, version: 2, variantCount: 1, minimumPrice: 32990000, maximumPrice: 32990000, availabilitySummary: { totalAvailable: 5, purchasableVariantCount: 1 } };
  const inventory = { id: ids.inventory, variantId: ids.variant, sku: "NOVA-001", productId: ids.product, productName: "Nova Laptop Pro", variantTitle: "16 GB / 512 GB", categoryId: ids.category, categoryName: "Laptops", onHand: 8, reserved: 3, available: 5, stockStatus: "low", version: 2, createdAt: now, updatedAt: now };
  const orderSummary = { id: ids.order, publicNumber: "NVC-20260809-00000001", customerId: ids.customer, customerEmail: "buyer@example.com", status: "paid", totalVnd: 32990000, currency: "VND", createdAt: now, updatedAt: "2026-08-09T08:05:00.000Z" };
  const order = { ...orderSummary, checkoutId: ids.checkout, addressSnapshot: { addressId: ids.address, recipientName: "Duy Duong", phoneNumber: "0901000001", addressLine: "1 Nguyen Hue", ward: "Ben Nghe", provinceOrCity: "Ho Chi Minh", version: 1 }, contactSnapshot: { email: "buyer@example.com", fullName: "Duy Duong", phoneNumber: "0901000001" }, subtotalVnd: 34990000, discountVnd: 2000000, taxMode: "included_not_separated", reservationExpiresAt: "2026-08-09T08:15:00.000Z", paidAt: "2026-08-09T08:05:00.000Z", version: 2, lines: [{ id: ids.line, variantId: ids.variant, sku: "NOVA-001", productTitle: "Nova Laptop Pro", variantLabel: "16 GB / 512 GB", quantity: 1, unitPriceVnd: 34990000, discountAllocationVnd: 2000000, lineTotalVnd: 32990000, linePosition: 0 }], history: [{ previousStatus: "pending_payment", newStatus: "paid", actorType: "provider", reasonCode: "PAYMENT_CONFIRMED", occurredAt: "2026-08-09T08:05:00.000Z" }] };
  const paymentSummary = { id: ids.payment, orderId: ids.order, status: "pending_provider", expectedAmountVnd: 32990000, currency: "VND", invoiceNumber: "NVC-PAY-0001", providerOrderId: "SEPAY-ORDER-1", updatedAt: "2026-08-09T08:05:00.000Z" };
  const payment = { ...paymentSummary, attemptId: ids.attempt, expiresAt: "2026-08-09T08:15:00.000Z", events: [{ id: ids.event, notificationType: "ORDER_PAID", providerOrderId: "SEPAY-ORDER-1", amountVnd: 31000000, currency: "VND", normalizedState: "unsupported", processingResult: "review_required", redactedPayload: { status: "CAPTURED", card: "[REDACTED]" }, correlationId: "corr-event", receivedAt: "2026-08-09T08:06:00.000Z" }], reconciliations: [{ id: ids.reconciliation, triggerActorType: "system", providerOrderId: "SEPAY-ORDER-1", internalStatus: "pending_provider", providerStatus: "CAPTURED", internalAmountVnd: 32990000, providerAmountVnd: 31000000, comparisonResult: "mismatch", redactedResponse: { status: "CAPTURED" }, correlationId: "corr-reconcile", createdAt: "2026-08-09T08:07:00.000Z" }] };
  return {
    "/v1/admin/catalog/categories": { success: true, message: "ok", data: [category] },
    "/v1/admin/catalog/products": { success: true, message: "ok", data: [productSummary], meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } },
    [`/v1/admin/catalog/products/${ids.product}`]: { success: true, message: "ok", data: product },
    [`/v1/admin/catalog/products/${ids.product}/publication-readiness`]: { success: true, message: "ok", data: { ready: true, missing: [] } },
    "/v1/admin/inventory/items": { success: true, message: "ok", data: [inventory], meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } },
    "/v1/admin/orders": { success: true, message: "ok", data: { items: [orderSummary], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } },
    [`/v1/admin/orders/${ids.order}`]: { success: true, message: "ok", data: order },
    "/v1/admin/payments": { success: true, message: "ok", data: { items: [paymentSummary], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } },
    [`/v1/admin/payments/${ids.payment}`]: { success: true, message: "ok", data: payment },
    [`/v1/admin/payments/${ids.payment}/reconciliations#POST`]: { success: true, message: "ok", data: payment },
  };
}

async function keyboardProbe(client) {
  await client.send("Runtime.evaluate", { expression: "document.body.focus(); document.documentElement.scrollTop = 0" });
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
}

function surfaceProbeExpression() {
  return `(() => { const active=document.activeElement; const style=active instanceof HTMLElement?getComputedStyle(active):undefined; const layout=document.querySelector('.consoleLayout'); const sidebar=document.querySelector('.consoleSidebar'); const topbar=document.querySelector('.consoleTopbar'); const activeLink=document.querySelector('.consoleSidebar a[aria-current="page"]'); const firstRow=document.querySelector('.productTable tbody tr'); const tableFrame=document.querySelector('.tableFrame'); const frameRect=tableFrame?.getBoundingClientRect(); const rect=sidebar?.getBoundingClientRect(); const controls=[...new Set(document.querySelectorAll('a,button,input,select,textarea,[role="tab"]'))].filter(element=>{const r=element.getBoundingClientRect();const s=getComputedStyle(element);return !element.disabled&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;}); const overlaps=[]; for(let i=0;i<controls.length;i+=1){for(let j=i+1;j<controls.length;j+=1){const a=controls[i].getBoundingClientRect(),b=controls[j].getBoundingClientRect();if(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top) overlaps.push([controls[i].getAttribute('aria-label')||controls[i].textContent?.trim(),controls[j].getAttribute('aria-label')||controls[j].textContent?.trim()]);}} const wide=[...document.querySelectorAll('body *')].map(element=>{const r=element.getBoundingClientRect();return {tag:element.tagName,className:element.className?.toString().slice(0,80),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),scrollWidth:element.scrollWidth};}).filter(item=>item.right>innerWidth+1).slice(0,8); const legends=[...document.querySelectorAll('fieldset legend')].map(item=>item.textContent?.trim()); return { heading:document.querySelector('h1')?.textContent?.trim()??null, documentWidth:document.documentElement.scrollWidth, viewportWidth:innerWidth, wide, tableFrame:frameRect?{left:frameRect.left,right:frameRect.right,width:frameRect.width,scrollWidth:tableFrame.scrollWidth,overflowX:getComputedStyle(tableFrame).overflowX}:null, activeBorderLeft:activeLink?parseFloat(getComputedStyle(activeLink).borderLeftWidth):0, firstRowHeight:firstRow?.getBoundingClientRect().height??null, productEditorGroups:['Basic details','Classification','Description and attributes'].every(name=>legends.includes(name)), technicalHeading:document.querySelector('h1')?.classList.contains('technicalText')??false, alert:document.querySelector('[role="alert"]')?.textContent?.trim()??null, errors:window.__browserErrors??[], theme:layout?.getAttribute('data-theme')??null, sidebar:{left:rect?.left??null,width:rect?.width??null}, workspaceTop:topbar?.getBoundingClientRect().top??null, menuVisible:document.querySelector('button[aria-label="Open navigation"]')?.getBoundingClientRect().width>0, focus:{tag:active?.tagName??null,visible:active?.matches(':focus-visible')??false,outline:style?.outline??null}, overlap:overlaps[0]??null, comingSoon:[...document.querySelectorAll('.comingSoonButton')].every(button=>button.disabled) }; })()`;
}

function assertSurface(result, surface, viewport, theme) {
  if (result.heading !== surface.heading) throw new Error(`${surface.name}: wrong heading ${result.heading}`);
  if (!surface.allowAlert && result.alert !== null) throw new Error(`${surface.name}: alert ${result.alert}`);
  if (result.errors.length > 0 && !surface.allowAlert) throw new Error(`${surface.name}: browser errors ${JSON.stringify(result.errors)}`);
  if (result.documentWidth > viewport.width) throw new Error(`${surface.name}: horizontal overflow ${result.documentWidth} > ${viewport.width}; frame=${JSON.stringify(result.tableFrame)}; ${JSON.stringify(result.wide)}`);
  if (result.overlap !== null) throw new Error(`${surface.name}: visible controls overlap ${JSON.stringify(result.overlap)}`);
  if (["BODY", "HTML"].includes(result.focus.tag) || !result.focus.visible) throw new Error(`${surface.name}: keyboard focus is not visible`);
  if (!surface.standalone && result.theme !== theme) throw new Error(`${surface.name}: expected ${theme} theme, received ${result.theme}`);
  if (!surface.standalone && viewport.name === "mobile" && (!result.menuVisible || result.sidebar.left >= 0 || result.workspaceTop > 4)) throw new Error(`${surface.name}: mobile drawer shell is not collapsed at the viewport top: ${JSON.stringify(result)}`);
  if (!surface.standalone && viewport.name === "tablet" && (result.sidebar.width > 70 || result.sidebar.left < 0)) throw new Error(`${surface.name}: tablet icon rail is invalid: ${JSON.stringify(result.sidebar)}`);
  if (!surface.standalone && viewport.name === "desktop" && result.sidebar.width < 200) throw new Error(`${surface.name}: desktop sidebar is invalid: ${JSON.stringify(result.sidebar)}`);
  if (surface.name === "products" && viewport.name === "desktop" && (result.activeBorderLeft < 2 || result.firstRowHeight > 44)) throw new Error(`Products does not meet the Obsidian Flux density contract: ${JSON.stringify({ activeBorderLeft: result.activeBorderLeft, firstRowHeight: result.firstRowHeight })}`);
  if (surface.name === "product-new" && !result.productEditorGroups) throw new Error("Product editor groups are missing");
  if (surface.name === "payment-detail" && !result.technicalHeading) throw new Error("Payment identifier is missing technical typography");
  if (surface.comingSoon && !result.comingSoon) throw new Error(`${surface.name}: future controls are not disabled`);
}

async function waitForHeading(client, heading) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(client, `document.querySelector('h1')?.textContent?.trim() === ${JSON.stringify(heading)}`)) return;
    if (attempt === 30 && await evaluate(client, `document.readyState === "complete" && document.querySelector('#root')?.childElementCount === 0`)) {
      await client.send("Page.stopLoading");
      await delay(750);
      await client.send("Page.navigate", { url: await evaluate(client, "location.href") });
    }
    await delay(100);
  }
  const state = await evaluate(client, `({url:location.href,readyState:document.readyState,heading:document.querySelector('h1')?.textContent?.trim(),body:document.body.innerText.slice(0,500),html:document.body.innerHTML.slice(0,500),errors:window.__browserErrors??[],root:document.querySelector('#root')?.innerHTML.slice(0,500)})`);
  state.cdpEvents = client.events.slice(-10);
  throw new Error(`Console surface did not settle: ${JSON.stringify(state)}`);
}

async function waitForConsoleOrigin(client) {
  const expected = new URL(consoleUrl).origin;
  for (let attempt = 0; attempt < 100; attempt += 1) { if (await evaluate(client, `location.origin === ${JSON.stringify(expected)}`)) return; await delay(100); }
  throw new Error(`Console origin did not load: ${expected}`);
}

class CdpClient {
  constructor(url) { this.url = url; this.nextId = 1; this.pending = new Map(); this.events = []; }
  async connect() { this.socket = new WebSocket(this.url); this.socket.addEventListener("message", (event) => { const message = JSON.parse(String(event.data)); if (message.id === undefined) { if (["Runtime.exceptionThrown", "Log.entryAdded"].includes(message.method)) this.events.push(message); return; } const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); message.error === undefined ? pending.resolve(message.result) : pending.reject(new Error(message.error.message)); }); await new Promise((resolve, reject) => { this.socket.addEventListener("open", resolve, { once: true }); this.socket.addEventListener("error", reject, { once: true }); }); }
  send(method, params = {}) { const id = this.nextId++; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  close() { this.socket.close(); }
}

async function evaluate(client, expression) { const response = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (response.exceptionDetails) throw new Error(`Browser evaluation failed: ${JSON.stringify(response.exceptionDetails)}`); return response.result.value; }
async function findChrome() { for (const candidate of [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean)) { try { await access(candidate, constants.X_OK); return candidate; } catch {} } throw new Error("Chrome not found; set CHROME_BIN"); }
async function waitForChrome(port) { for (let attempt = 0; attempt < 80; attempt += 1) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return; } catch {} await delay(100); } throw new Error("Chrome DevTools endpoint did not become ready"); }
function requireOk(response) { if (!response.ok) throw new Error(`Chrome DevTools request failed with ${response.status}`); return response; }
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

await main();
