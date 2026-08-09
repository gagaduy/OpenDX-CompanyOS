// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const consoleUrl = process.env.CONSOLE_URL ?? "http://localhost:3000";
const outputDirectory = process.env.BROWSER_EVIDENCE_DIR ?? join(tmpdir(), "opendx-console-browser");
const authority = "http://localhost:8080/realms/opendx";
const clientId = "opendx-console";
const ids = {
  order: "c1700000-0000-4000-8000-000000000001",
  customer: "c1400000-0000-4000-8000-000000000001",
  checkout: "c1600000-0000-4000-8000-000000000001",
  address: "c1450000-0000-4000-8000-000000000001",
  line: "c1750000-0000-4000-8000-000000000001",
  variant: "c1300000-0000-4000-8000-000000000001",
  payment: "c1800000-0000-4000-8000-000000000001",
  attempt: "c1850000-0000-4000-8000-000000000001",
  event: "c1900000-0000-4000-8000-000000000001",
  reconciliation: "c1950000-0000-4000-8000-000000000001",
};

async function main() {
  const chrome = await findChrome();
  const profile = await mkdtemp(join(tmpdir(), "opendx-console-chrome-"));
  const port = 19_500 + Math.floor(Math.random() * 400);
  const chromeProcess = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  try {
    await waitForChrome(port); await mkdir(outputDirectory, { recursive: true });
    const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(consoleUrl)}`, { method: "PUT" }).then(requireOk).then((response) => response.json());
    const client = new CdpClient(target.webSocketDebuggerUrl); await client.connect(); await client.send("Page.enable"); await client.send("Runtime.enable");
    const sessionKey = `oidc.user:${authority}:${clientId}`;
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: fixtureScript(sessionKey) });
    const evidence = [];
    for (const viewport of [{ name: "mobile", width: 390, height: 844 }, { name: "desktop", width: 1440, height: 900 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 700 });
      for (const surface of [{ name: "orders", path: "/orders", heading: "Orders" }, { name: "order", path: `/orders/${ids.order}`, heading: "NVC-20260809-00000001" }, { name: "payments", path: "/payments", heading: "Payments" }, { name: "payment", path: `/payments/${ids.payment}`, heading: "NVC-PAY-0001" }]) {
        await client.send("Page.navigate", { url: `${consoleUrl}${surface.path}` }); await waitForHeading(client, surface.heading);
        await client.send("Runtime.evaluate", { expression: "document.body.focus(); document.documentElement.scrollTop = 0" });
        await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
        await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
        const result = await evaluate(client, `(() => { const active = document.activeElement; const style = active instanceof HTMLElement ? getComputedStyle(active) : undefined; return { heading: document.querySelector('h1')?.textContent?.trim() ?? null, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, alert: document.querySelector('[role="alert"]')?.textContent?.trim() ?? null, focus: { tag: active?.tagName ?? null, visible: active?.matches(':focus-visible') ?? false, outline: style?.outline ?? null } }; })()`);
        assertSurface(result, surface, viewport);
        const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        const screenshotPath = join(outputDirectory, `${surface.name}-${viewport.name}-${viewport.width}x${viewport.height}.png`); await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64")); evidence.push({ surface: surface.name, viewport, ...result, screenshotPath });
      }
    }
    await evaluate(client, `sessionStorage.setItem(${JSON.stringify(sessionKey)}, ${JSON.stringify(session("catalog_manager"))}); location.href=${JSON.stringify(`${consoleUrl}/orders`)}`);
    await waitForHeading(client, "Permission denied");
    const denied = await evaluate(client, `({ heading: document.querySelector('h1')?.textContent?.trim(), apiCalls: window.__operationApiCalls ?? [] })`);
    if (denied.apiCalls.length !== 0) throw new Error(`Denied route called an operations API: ${JSON.stringify(denied.apiCalls)}`);
    client.close(); console.log(JSON.stringify({ consoleUrl, evidence, denied }, null, 2));
  } finally { chromeProcess.kill("SIGTERM"); await new Promise((resolve) => chromeProcess.once("exit", resolve)); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
}

function session(role) { return JSON.stringify({ access_token: "browser-check-token", token_type: "Bearer", scope: "openid", profile: { sub: "staff-browser-check", name: "Browser Check", realm_access: { roles: [role] } }, expires_at: Math.floor(Date.now() / 1000) + 3600 }); }
function fixtureScript(sessionKey) {
  const fixtures = fixturesByPath();
  return `(() => { const key=${JSON.stringify(sessionKey)}; if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, ${JSON.stringify(session("administrator"))}); window.__operationApiCalls=[]; const fixtures=${JSON.stringify(fixtures)}; const original=window.fetch.bind(window); window.fetch=async (input, init) => { const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url, location.href); if (!url.pathname.startsWith('/v1/admin/orders') && !url.pathname.startsWith('/v1/admin/payments')) return original(input, init); window.__operationApiCalls.push(url.pathname); const key=url.pathname+(init?.method==='POST'?'#POST':''); const value=fixtures[key] ?? fixtures[url.pathname]; return new Response(JSON.stringify(value ?? {success:false,message:'missing fixture',errorCode:'NOT_FOUND'}), {status:value===undefined?404:200,headers:{'Content-Type':'application/json'}}); }; })();`;
}
function fixturesByPath() {
  const summary = { id: ids.order, publicNumber: "NVC-20260809-00000001", customerId: ids.customer, customerEmail: "buyer@example.com", status: "paid", totalVnd: 32990000, currency: "VND", createdAt: "2026-08-09T08:00:00.000Z", updatedAt: "2026-08-09T08:05:00.000Z" };
  const order = { ...summary, checkoutId: ids.checkout, addressSnapshot: { addressId: ids.address, recipientName: "Duy Duong", phoneNumber: "0901000001", addressLine: "1 Nguyen Hue", ward: "Ben Nghe", provinceOrCity: "Ho Chi Minh", version: 1 }, contactSnapshot: { email: "buyer@example.com", fullName: "Duy Duong", phoneNumber: "0901000001" }, subtotalVnd: 34990000, discountVnd: 2000000, taxMode: "included_not_separated", reservationExpiresAt: "2026-08-09T08:15:00.000Z", paidAt: "2026-08-09T08:05:00.000Z", version: 2, lines: [{ id: ids.line, variantId: ids.variant, sku: "NOVA-001", productTitle: "Nova Laptop Pro", variantLabel: "16 GB / 512 GB", quantity: 1, unitPriceVnd: 34990000, discountAllocationVnd: 2000000, lineTotalVnd: 32990000, linePosition: 0 }], history: [{ previousStatus: "pending_payment", newStatus: "paid", actorType: "provider", reasonCode: "PAYMENT_CONFIRMED", occurredAt: "2026-08-09T08:05:00.000Z" }] };
  const paymentSummary = { id: ids.payment, orderId: ids.order, status: "pending_provider", expectedAmountVnd: 32990000, currency: "VND", invoiceNumber: "NVC-PAY-0001", providerOrderId: "SEPAY-ORDER-1", updatedAt: "2026-08-09T08:05:00.000Z" };
  const payment = { ...paymentSummary, attemptId: ids.attempt, expiresAt: "2026-08-09T08:15:00.000Z", events: [{ id: ids.event, notificationType: "ORDER_PAID", providerOrderId: "SEPAY-ORDER-1", amountVnd: 31000000, currency: "VND", normalizedState: "unsupported", processingResult: "review_required", redactedPayload: { status: "CAPTURED", card: "[REDACTED]" }, correlationId: "corr-event", receivedAt: "2026-08-09T08:06:00.000Z" }], reconciliations: [{ id: ids.reconciliation, triggerActorType: "system", providerOrderId: "SEPAY-ORDER-1", internalStatus: "pending_provider", providerStatus: "CAPTURED", internalAmountVnd: 32990000, providerAmountVnd: 31000000, comparisonResult: "mismatch", redactedResponse: { status: "CAPTURED" }, correlationId: "corr-reconcile", createdAt: "2026-08-09T08:07:00.000Z" }] };
  return { "/v1/admin/orders": { success: true, message: "ok", data: { items: [summary], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }, [`/v1/admin/orders/${ids.order}`]: { success: true, message: "ok", data: order }, "/v1/admin/payments": { success: true, message: "ok", data: { items: [paymentSummary], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }, [`/v1/admin/payments/${ids.payment}`]: { success: true, message: "ok", data: payment }, [`/v1/admin/payments/${ids.payment}/reconciliations#POST`]: { success: true, message: "ok", data: payment } };
}

function assertSurface(result, surface, viewport) { if (result.heading !== surface.heading) throw new Error(`${surface.name}: wrong heading ${result.heading}`); if (result.alert !== null) throw new Error(`${surface.name}: alert ${result.alert}`); if (result.documentWidth > viewport.width) throw new Error(`${surface.name}: horizontal overflow ${result.documentWidth} > ${viewport.width}`); if (["BODY", "HTML"].includes(result.focus.tag) || !result.focus.visible) throw new Error(`${surface.name}: keyboard focus is not visible`); }
async function waitForHeading(client, heading) { for (let attempt=0; attempt<100; attempt+=1) { if (await evaluate(client, `document.querySelector('h1')?.textContent?.trim() === ${JSON.stringify(heading)}`)) return; await delay(100); } const state=await evaluate(client, `({url:location.href,heading:document.querySelector('h1')?.textContent?.trim(),body:document.body.innerText.slice(0,500)})`); throw new Error(`Console surface did not settle: ${JSON.stringify(state)}`); }
class CdpClient { constructor(url) { this.url=url; this.nextId=1; this.pending=new Map(); } async connect() { this.socket=new WebSocket(this.url); this.socket.addEventListener("message", (event) => { const message=JSON.parse(String(event.data)); if (message.id===undefined) return; const pending=this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); message.error===undefined ? pending.resolve(message.result) : pending.reject(new Error(message.error.message)); }); await new Promise((resolve,reject)=>{this.socket.addEventListener("open",resolve,{once:true});this.socket.addEventListener("error",reject,{once:true});}); } send(method,params={}) { const id=this.nextId++; return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}));}); } close(){this.socket.close();} }
async function evaluate(client, expression) { const response=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true}); if(response.exceptionDetails) throw new Error("Browser evaluation failed"); return response.result.value; }
async function findChrome(){for(const candidate of [process.env.CHROME_BIN,"/usr/bin/google-chrome","/usr/bin/chromium","/usr/bin/chromium-browser"].filter(Boolean)){try{await access(candidate,constants.X_OK);return candidate;}catch{}}throw new Error("Chrome not found; set CHROME_BIN");}
async function waitForChrome(port){for(let attempt=0;attempt<80;attempt+=1){try{if((await fetch(`http://127.0.0.1:${port}/json/version`)).ok)return;}catch{}await delay(100);}throw new Error("Chrome DevTools endpoint did not become ready");}
function requireOk(response){if(!response.ok)throw new Error(`Chrome DevTools request failed with ${response.status}`);return response;}
const delay=(milliseconds)=>new Promise((resolve)=>setTimeout(resolve,milliseconds));

await main();
