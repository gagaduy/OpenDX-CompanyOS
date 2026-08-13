#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { constants } from "node:fs";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const consoleUrl = process.env.CONSOLE_URL ?? "http://localhost:3000";
const outputDirectory = process.env.BROWSER_EVIDENCE_DIR ?? join(tmpdir(), "opendx-crm-support-dashboard-browser");
const authority = "http://localhost:8080/realms/opendx";
const clientId = "opendx-console";
const themeKey = "opendx.console.theme";
const ids = {
  customer: "b1000000-0000-4000-8000-000000000001",
  address: "b1100000-0000-4000-8000-000000000001",
  order: "d1000000-0000-4000-8000-000000000001",
  ticket: "f2000000-0000-4000-8000-000000000001",
  attachment: "f3000000-0000-4000-8000-000000000001",
  note: "f4000000-0000-4000-8000-000000000001",
  followup: "f5000000-0000-4000-8000-000000000001",
};
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];
const themes = ["night", "light"];
const surfaces = [
  { name: "customers", path: "/customers", heading: "Customers", role: "crm_operator" },
  { name: "customer-detail", path: `/customers/${ids.customer}`, heading: "Private Buyer", role: "crm_operator" },
  { name: "support", path: "/support", heading: "Support tickets", role: "support_operator" },
  { name: "support-detail", path: `/support/${ids.ticket}`, heading: "Shipment question", role: "support_operator" },
  { name: "dashboard", path: "/dashboard", heading: "Commerce dashboard", role: "executive_viewer" },
];

async function main() {
  const chrome = await findChrome();
  const profile = await mkdtemp(join(tmpdir(), "opendx-phase7-chrome-"));
  const port = 20_000 + Math.floor(Math.random() * 500);
  const chromeProcess = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  try {
    await waitForChrome(port);
    await mkdir(outputDirectory, { recursive: true });
    const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(consoleUrl)}`, { method: "PUT" }).then(requireOk).then((response) => response.json());
    const client = new CdpClient(target.webSocketDebuggerUrl);
    await client.connect();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    const sessionKey = `oidc.user:${authority}:${clientId}`;
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: fixtureScript(sessionKey) });
    await waitForConsoleOrigin(client);
    const evidence = [];
    let appLoaded = false;

    await setSession(client, sessionKey, "administrator");
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
          await ensureTheme(client, theme);
          await waitForShell(client, viewport);
          await keyboardProbe(client);
          const result = await evaluate(client, surfaceProbeExpression());
          assertSurface(result, surface, viewport, theme);
          const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
          const screenshotPath = join(outputDirectory, `${surface.name}-${theme}-${viewport.name}-${viewport.width}x${viewport.height}.png`);
          await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"), { mode: 0o600 });
          evidence.push({ surface: surface.name, theme, viewport, heading: result.heading, landmarks: result.landmarks, screenshotPath });
          await delay(250);
        }
      }
    }

    await setSession(client, sessionKey, "catalog_manager");
    await client.send("Page.navigate", { url: `${consoleUrl}/dashboard` });
    await waitForHeading(client, "Permission denied");
    const denied = await evaluate(client, `({ heading: document.querySelector('h1')?.textContent?.trim(), apiCalls: window.__phase7ApiCalls ?? [] })`);
    if (denied.apiCalls.length !== 0) throw new Error(`Denied dashboard route called APIs: ${JSON.stringify(denied.apiCalls)}`);
    client.close();
    console.log(JSON.stringify({ consoleUrl, outputDirectory, routeCount: surfaces.length, viewports: viewports.length, themes: themes.length, evidence, denied }, null, 2));
  } finally {
    chromeProcess.kill("SIGTERM");
    await new Promise((resolve) => chromeProcess.once("exit", resolve));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
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

async function waitForShell(client, viewport) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const sidebar = await evaluate(client, `(() => { const rect=document.querySelector('.consoleSidebar')?.getBoundingClientRect(); return {left:rect?.left??null,width:rect?.width??null}; })()`);
    if (viewport.name !== "mobile" || sidebar.left <= -sidebar.width + 1) return;
    await delay(50);
  }
}

function session(role) {
  return JSON.stringify({ access_token: "phase7-browser-token", token_type: "Bearer", scope: "openid", profile: { sub: `staff-${role}`, name: "Phase 7 Browser", realm_access: { roles: [role] } }, expires_at: Math.floor(Date.now() / 1000) + 3600 });
}

function fixtureScript(sessionKey) {
  const fixtures = fixturesByPath();
  return `(() => { const key=${JSON.stringify(sessionKey)}; window.__phase7Errors=[]; addEventListener('error', event => window.__phase7Errors.push(event.message)); addEventListener('unhandledrejection', event => window.__phase7Errors.push(String(event.reason?.message ?? event.reason))); if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, ${JSON.stringify(session("administrator"))}); window.__phase7ApiCalls=[]; const fixtures=${JSON.stringify(fixtures)}; const original=window.fetch.bind(window); window.fetch=async (input, init) => { const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url, location.href); if (!url.pathname.startsWith('/v1/admin/customers') && !url.pathname.startsWith('/v1/admin/support') && !url.pathname.startsWith('/v1/admin/reporting')) return original(input, init); window.__phase7ApiCalls.push(url.pathname); const method=init?.method??'GET'; const key=url.pathname+(method==='POST'?'#POST':method==='PATCH'?'#PATCH':''); if (url.pathname.endsWith('/content')) return new Response(new Blob(['clean evidence'], {type:'application/pdf'}), {status:200}); const value=fixtures[key] ?? fixtures[url.pathname]; return new Response(JSON.stringify(value ?? {success:false,message:'missing fixture',errorCode:'NOT_FOUND'}), {status:value===undefined?404:200,headers:{'Content-Type':'application/json'}}); }; })();`;
}

function fixturesByPath() {
  const customer = { id: ids.customer, email: "buyer@example.com", fullName: "Private Buyer", phoneNumber: "0901000001", status: "active", createdAt: "2026-08-01T00:00:00.000Z" };
  const ticket = { id: ids.ticket, customerId: ids.customer, orderId: ids.order, subject: "Shipment question", description: "Where is my laptop?", priority: "urgent", status: "assigned", version: 1, createdById: "staff-crm", assigneeId: "staff-support", createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:05:00.000Z" };
  const range = { start: "2026-08-01", end: "2026-08-10", timezone: "Asia/Ho_Chi_Minh" };
  const refreshedAt = "2026-08-10T00:00:00.000Z";
  return {
    "/v1/admin/customers": { success: true, message: "ok", data: { items: [customer], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } },
    "/v1/admin/customers/segments": { success: true, message: "ok", data: { calculatedAt: refreshedAt, items: [{ id: "repeat_customer", name: "Repeat customers", description: "Bought more than once", customerCount: 1 }] } },
    [`/v1/admin/customers/${ids.customer}`]: { success: true, message: "ok", data: { customer: { ...customer, addresses: [{ id: ids.address, recipientName: "Private Buyer", phoneNumber: "0901000001", addressLine: "1 Nguyen Hue", ward: "Ben Nghe", provinceOrCity: "Ho Chi Minh", isDefault: true }] }, orders: [{ id: ids.order, publicNumber: "NVC-20260810-0001", status: "paid", totalVnd: 32990000, createdAt: "2026-08-10T00:00:00.000Z", paidAt: "2026-08-10T00:10:00.000Z" }], paidFacts: { paidOrderCount: 2, lifetimePaidVnd: 65980000, latestPaidAt: "2026-08-10T00:10:00.000Z" }, segments: ["repeat_customer"], calculatedAt: refreshedAt, notes: [{ id: ids.note, customerId: ids.customer, authorId: "staff-crm", body: "Called customer", createdAt: refreshedAt }], followups: [{ id: ids.followup, customerId: ids.customer, dueAt: "2026-08-11T00:00:00.000Z", description: "Confirm delivery", status: "open", version: 1, createdById: "staff-crm", createdAt: refreshedAt, updatedAt: refreshedAt }] } },
    "/v1/admin/support/tickets": { success: true, message: "ok", data: { items: [ticket], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } },
    [`/v1/admin/support/tickets/${ids.ticket}`]: { success: true, message: "ok", data: { ticket, context: { customer, order: { id: ids.order, publicNumber: "NVC-20260810-0001", status: "paid", totalVnd: 32990000, createdAt: refreshedAt } }, messages: [{ id: "message-1", authorId: "staff-support", body: "Investigating", createdAt: refreshedAt }], events: [{ id: "event-1", actorId: "staff-support", fromStatus: "new", toStatus: "assigned", source: "manual", occurredAt: refreshedAt }], attachments: [{ id: ids.attachment, ticketId: ids.ticket, originalFilename: "invoice.pdf", format: "pdf", mediaType: "application/pdf", byteSize: 12, status: "clean", version: 1, createdById: "staff-support", createdAt: refreshedAt }] } },
    "/v1/admin/reporting/commerce": { range, refreshedAt, data: { grossPaidRevenueVnd: 32990000, paidOrderCount: 1, averageOrderValueVnd: 32990000, conversionRateBasisPoints: 5000, comparison: { previousGrossPaidRevenueVnd: 24990000, previousPaidOrderCount: 1, previousAverageOrderValueVnd: 24990000, grossPaidRevenueChangeBasisPoints: 3201, paidOrderCountChangeBasisPoints: 0, averageOrderValueChangeBasisPoints: 3201 }, daily: [{ date: "2026-08-01", grossPaidRevenueVnd: 0, paidOrderCount: 0 }, { date: "2026-08-02", grossPaidRevenueVnd: 32990000, paidOrderCount: 1 }], paymentStatuses: [{ status: "paid", count: 1 }] } },
    "/v1/admin/reporting/products": { range, refreshedAt, data: { items: [{ sku: "NOVA-001", productTitle: "Nova Laptop Pro", quantitySold: 1, paidRevenueVnd: 32990000 }], inventory: { onHand: 5, reserved: 1, available: 4, soldOutCount: 0 } } },
    "/v1/admin/reporting/customers": { range, refreshedAt, data: { totalRegisteredCustomers: 10, repeatCustomers: 3, lifetimeValueVnd: 65980000, lifetimeValueBuckets: [{ bucket: "high", count: 1 }], newCustomersInRange: 4, previousNewCustomersInRange: 2, newCustomersChangeBasisPoints: 10000, dailyNewCustomers: [{ date: "2026-08-01", newCustomerCount: 1 }, { date: "2026-08-02", newCustomerCount: 3 }] } },
    "/v1/admin/reporting/operations": { range, refreshedAt, data: { openTickets: 1, overdueFollowups: 1, slaBreaches: 0 } },
  };
}

async function keyboardProbe(client) {
  await client.send("Runtime.evaluate", { expression: "document.body.focus(); document.documentElement.scrollTop = 0" });
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
}

function surfaceProbeExpression() {
  return `(() => { const active=document.activeElement; const style=active instanceof HTMLElement?getComputedStyle(active):undefined; const layout=document.querySelector('.consoleLayout'); const sidebar=document.querySelector('.consoleSidebar'); const topbar=document.querySelector('.consoleTopbar'); const rect=sidebar?.getBoundingClientRect(); const controls=[...new Set(document.querySelectorAll('a,button,input,select,textarea,[role="tab"]'))].filter(element=>{const r=element.getBoundingClientRect();const s=getComputedStyle(element);const visibleWidth=Math.min(r.right,innerWidth)-Math.max(r.left,0);const visibleHeight=Math.min(r.bottom,innerHeight)-Math.max(r.top,0);return !element.disabled&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&visibleWidth>4&&visibleHeight>4;}); let overlap=null; for(let i=0;i<controls.length&&overlap===null;i+=1){for(let j=i+1;j<controls.length;j+=1){const a=controls[i].getBoundingClientRect(),b=controls[j].getBoundingClientRect();if(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top){overlap=[controls[i].getAttribute('aria-label')||controls[i].textContent?.trim(),controls[j].getAttribute('aria-label')||controls[j].textContent?.trim()];break;}}} const namedRegions=[...document.querySelectorAll('section[aria-label]')].map(section=>section.getAttribute('aria-label')); const sla=document.querySelector('section[aria-label="SLA monitor"]'); return { heading:document.querySelector('h1')?.textContent?.trim()??null, documentWidth:document.documentElement.scrollWidth, viewportWidth:innerWidth, alert:document.querySelector('[role="alert"]')?.textContent?.trim()??null, errors:window.__phase7Errors??[], landmarks:{main:document.querySelectorAll('main').length,nav:document.querySelectorAll('nav').length}, theme:layout?.getAttribute('data-theme')??null,sidebar:{left:rect?.left??null,width:rect?.width??null},workspaceTop:topbar?.getBoundingClientRect().top??null,menuVisible:document.querySelector('button[aria-label="Open navigation"]')?.getBoundingClientRect().width>0,focus:{tag:active?.tagName??null,visible:active?.matches(':focus-visible')??false,outline:style?.outline??null},overlap,comingSoonButtons:[...document.querySelectorAll('.comingSoonButton')].map(button=>button.disabled),comingSoonPanels:document.querySelectorAll('.comingSoonPanel').length,slaUnavailable:sla?.textContent?.includes('SLA timing unavailable')??false,dashboardRegions:['Executive metrics','Operational focus','Performance overview'].every(name=>namedRegions.includes(name)),dashboardCharts:[...document.querySelectorAll('svg[role="img"]')].map(chart=>chart.getAttribute('aria-label')),dashboardDataTables:[...document.querySelectorAll('table')].map(table=>table.getAttribute('aria-label')).filter(Boolean)}; })()`;
}

function assertSurface(result, surface, viewport, theme) {
  if (result.heading !== surface.heading) throw new Error(`${surface.name}: wrong heading ${result.heading}`);
  if (result.alert !== null && !/older than 60 seconds/i.test(result.alert)) throw new Error(`${surface.name}: alert ${result.alert}`);
  if (result.errors.length > 0) throw new Error(`${surface.name}: browser errors ${JSON.stringify(result.errors)}`);
  if (result.documentWidth > viewport.width) throw new Error(`${surface.name}: horizontal overflow ${result.documentWidth} > ${viewport.width}`);
  if (result.landmarks.main !== 1 || result.landmarks.nav < 1) throw new Error(`${surface.name}: semantic landmarks missing`);
  if (["BODY", "HTML"].includes(result.focus.tag) || !result.focus.visible) throw new Error(`${surface.name}: keyboard focus is not visible`);
  if (result.theme !== theme) throw new Error(`${surface.name}: expected ${theme} theme, received ${result.theme}`);
  if (result.overlap !== null) throw new Error(`${surface.name}: visible controls overlap ${JSON.stringify(result.overlap)}`);
  if (viewport.name === "mobile" && (!result.menuVisible || result.sidebar.left >= 0 || result.workspaceTop > 4)) throw new Error(`${surface.name}: mobile shell is invalid ${JSON.stringify(result)}`);
  if (viewport.name === "tablet" && (result.sidebar.width > 70 || result.sidebar.left < 0)) throw new Error(`${surface.name}: tablet rail is invalid ${JSON.stringify(result.sidebar)}`);
  if (viewport.name === "desktop" && result.sidebar.width < 200) throw new Error(`${surface.name}: desktop sidebar is invalid ${JSON.stringify(result.sidebar)}`);
  if (surface.name === "support-detail" && (result.comingSoonButtons.length === 0 || !result.comingSoonButtons.every(Boolean))) throw new Error("Support detail future controls must stay disabled");
  if (surface.name === "support-detail" && !result.slaUnavailable) throw new Error("Support detail must expose truthful unavailable SLA timing");
  if (surface.name === "dashboard" && result.comingSoonPanels !== 0) throw new Error("Dashboard analytics must not retain placeholder panels");
  if (surface.name === "dashboard" && !["Revenue trend","Paid order volume"].every(name=>result.dashboardCharts.includes(name))) throw new Error(`Dashboard charts are missing: ${JSON.stringify(result.dashboardCharts)}`);
  if (surface.name === "dashboard" && !["Revenue trend data","Paid order volume data"].every(name=>result.dashboardDataTables.includes(name))) throw new Error(`Dashboard accessible tables are missing: ${JSON.stringify(result.dashboardDataTables)}`);
  if (surface.name === "dashboard" && !result.dashboardRegions) throw new Error("Dashboard hierarchy regions are missing");
}

async function waitForHeading(client, heading) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(client, `document.querySelector('h1')?.textContent?.trim() === ${JSON.stringify(heading)}`)) return;
    await delay(100);
  }
  const state = await evaluate(client, `({url:location.href,heading:document.querySelector('h1')?.textContent?.trim(),body:document.body.innerText.slice(0,500),errors:window.__phase7Errors??[]})`);
  throw new Error(`Console surface did not settle: ${JSON.stringify(state)}`);
}

async function waitForConsoleOrigin(client) {
  const expected = new URL(consoleUrl).origin;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(client, `location.origin === ${JSON.stringify(expected)}`)) return;
    await delay(100);
  }
  throw new Error(`Console origin did not load: ${expected}`);
}

class CdpClient {
  constructor(url) { this.url = url; this.nextId = 1; this.pending = new Map(); }
  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id === undefined) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      message.error === undefined ? pending.resolve(message.result) : pending.reject(new Error(message.error.message));
    });
    await new Promise((resolve, reject) => { this.socket.addEventListener("open", resolve, { once: true }); this.socket.addEventListener("error", reject, { once: true }); });
  }
  send(method, params = {}) { const id = this.nextId++; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  close() { this.socket.close(); }
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(`Browser evaluation failed: ${JSON.stringify(response.exceptionDetails)}`);
  return response.result.value;
}
async function findChrome() {
  for (const candidate of [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean)) {
    try { await access(candidate, constants.X_OK); return candidate; } catch {}
  }
  throw new Error("Chrome not found; set CHROME_BIN");
}
async function waitForChrome(port) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return; } catch {}
    await delay(100);
  }
  throw new Error("Chrome DevTools endpoint did not become ready");
}
function requireOk(response) { if (!response.ok) throw new Error(`Chrome DevTools request failed with ${response.status}`); return response; }
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

await main();
