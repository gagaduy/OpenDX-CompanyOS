#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { constants } from "node:fs";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export const VIEWPORTS = [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }];
export const ROLE_TOKEN_ENVIRONMENT = [
  { role: "agentic_operator", name: "AGENTIC_PHASE_G_OPERATOR_TOKEN" },
  { role: "agentic_governance_admin", name: "AGENTIC_PHASE_G_GOVERNANCE_TOKEN" },
  { role: "agentic_approver", name: "AGENTIC_PHASE_G_APPROVER_TOKEN" },
  { role: "agentic_auditor", name: "AGENTIC_PHASE_G_AUDITOR_TOKEN" },
  { role: "catalog_manager", name: "AGENTIC_PHASE_G_UNAUTHORIZED_TOKEN" },
];
export const APPROVED_ROUTES = [
  { path: "/agentic/tasks", heading: "Digital Workforce", role: "agentic_operator" },
  { path: "/agentic/tasks/new", heading: "New governed task", role: "agentic_operator" },
  { path: "/agentic/tasks/00000000-0000-4000-8000-000000000001", heading: "Review Store Health", role: "agentic_operator" },
  { path: "/agentic/approvals", heading: "Approval Inbox", role: "agentic_approver" },
  { path: "/agentic/employees", heading: "Digital Employees", role: "agentic_auditor" },
  { path: "/agentic/employees/inventory", heading: "Digital Employee", role: "agentic_auditor" },
  { path: "/agentic/audit", heading: "Agentic Audit", role: "agentic_auditor" },
];

const ids = { task: "00000000-0000-4000-8000-000000000001", run: "00000000-0000-4000-8000-000000000002", approval: "00000000-0000-4000-8000-000000000003", revision: "00000000-0000-4000-8000-000000000004", file: "00000000-0000-4000-8000-000000000005" };
const at = "2026-08-25T00:00:00.000Z";

export function validateBrowserEnvironment(env) {
  const missing = ROLE_TOKEN_ENVIRONMENT.filter(({ name }) => typeof env[name] !== "string" || env[name].length < 8).map(({ name }) => name);
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}
export function assertSafeEvidenceDirectory(value) {
  const target = resolve(value);
  const prefix = resolve(tmpdir(), "opendx-agentic-phase-g-");
  if (!target.startsWith(prefix)) throw new Error("Browser evidence must use an /tmp/opendx-agentic-phase-g-* temporary directory");
}

export function buildFixtures() {
  const task = { id: ids.task, state: "partially_completed", createdBy: "staff-agentic-operator", goal: "Review Store Health", version: 4, createdAt: at, updatedAt: at };
  const branches = ["catalog", "inventory", "order", "finance", "crm", "support"].map((owner, index) => ({ id: `00000000-0000-4000-8000-${String(10 + index).padStart(12, "0")}`, owner, state: owner === "support" ? "failed" : "completed", dependencies: index === 0 ? [] : [`00000000-0000-4000-8000-${String(9 + index).padStart(12, "0")}`], toolNames: [`${owner}.health`], dataClasses: ["internal"] }));
  const approval = { id: ids.approval, state: "pending", requesterId: "system:workflow", approverScope: "workflow_execution", action: "agentic.workflow.complete", resourceType: "workflow_run", resourceId: ids.run, parametersDigest: "a".repeat(64), taskId: ids.task, policyVersion: 1, workflowVersion: 1, configurationRevisionId: ids.revision, expiresAt: "2030-08-25T00:00:00.000Z", version: 1, createdAt: at };
  const operations = { success: true, data: { task: { id: ids.task, goal: task.goal, state: task.state, version: 4 }, workflow: { id: ids.run, state: "partially_completed", stage: "partially_completed", version: 8, updatedAt: at }, timeline: branches.map((branch, index) => ({ id: `timeline-${index}`, kind: "department", state: branch.state, occurredAt: `2026-08-25T00:00:${String(index).padStart(2, "0")}.000Z`, branchId: branch.id })), branches, costs: { reservedMicros: 600, settledMicros: 500 }, approvals: [{ id: ids.approval, state: "approved", expiresAt: approval.expiresAt, version: 2 }], provenance: [{ id: "00000000-0000-4000-8000-000000000030", sourceType: "workflow_replay", sourceId: ids.run, classification: "internal" }], report: { completionState: "partial", summary: "One branch unavailable", conclusions: [], risks: [], recommendedActions: [], conflicts: [], unavailableBranches: [{ subtaskId: branches[5].id, reasonCode: "RETRY_EXHAUSTED" }] }, refreshedAt: at } };
  const employeeKinds = ["ai_ceo", "catalog", "inventory", "order", "finance", "crm", "support"];
  const employee = (kind) => ({ kind, department: kind === "ai_ceo" ? "Executive" : kind === "crm" ? "CRM" : `${kind[0].toUpperCase()}${kind.slice(1)}`, governance: { active: true, revoked: false, configurationVersion: 3 }, models: { primary: `openai/${kind}-primary`, fallbacks: [] }, tools: [], budgets: { taskCostMicros: 10000, dailyCostMicros: 100000, monthlyCostMicros: 1000000 }, executionHealth: { state: "available", basis: "recent_runs", freshness: at }, recentRuns: [{ taskId: ids.task, state: "completed", settledCostMicros: 100, completedAt: at }] });
  return {
    overview: { success: true, data: { counts: { running: 0, waiting: 0, failed: 0, completed: 0, canceled: 0 }, pendingApprovals: 1, settledCostMicros: 500, refreshedAt: at } },
    tasks: { success: true, data: { items: [task], totalItems: 1, refreshedAt: at } },
    intake: { success: true, data: { task, subtasks: [{ agentKind: "ai_ceo", title: "Coordinate Store Health Review" }], dependencies: [] } },
    operations,
    approvals: { success: true, data: { items: [approval], totalItems: 1 } },
    approvalDetail: { success: true, data: { approval: Object.fromEntries(Object.entries(approval).filter(([key]) => !["taskId"].includes(key))), risk: { level: "high", basis: "Durable workflow outcome" }, expectedEffect: "Resume the workflow with the recorded human decision.", sources: [], refreshedAt: at } },
    employees: { success: true, data: employeeKinds.map((kind) => ({ kind, department: employee(kind).department, active: true })) },
    employee: { success: true, data: employee("inventory") },
    audit: { success: true, data: { items: [{ id: "00000000-0000-4000-8000-000000000020", actorId: "staff-operator", actorType: "staff", action: "workflow.start", resourceType: "agentic_task", resourceId: ids.task, outcome: "allowed", correlationId: "corr-safe", parametersDigest: "b".repeat(64), occurredAt: at }], totalItems: 1, refreshedAt: at } },
    file: { success: true, data: { id: ids.file, originalFilename: "health.csv", format: "csv", mediaType: "text/csv", byteSize: 20, payloadDigest: "c".repeat(64), status: "previewed", createdBy: "staff-governance", version: 3, scannedAt: at, createdAt: at, updatedAt: at } },
    preview: { success: true, data: { fileId: ids.file, fileVersion: 3, previewVersion: 1, parserVersion: "csv-v1", payloadDigest: "c".repeat(64), previewDigest: "d".repeat(64), format: "csv", rowCount: 2, columnCount: 2, invalidRows: 0, samples: ["sku,stock", "NOVA-1,5"], sourceReferences: [{ fileId: ids.file, line: 1 }], governance: { coordinator: "ai_ceo", eligibleDepartments: ["catalog", "inventory", "order", "finance", "crm", "support"], allowedTools: ["inventory.health"], dataClasses: ["internal"], riskSignals: [], dependencyStatus: "planned_after_task_start", configurationRevisionId: ids.revision, configurationVersion: 3 } } },
  };
}

export async function runBrowserCheck({ env = process.env } = {}) {
  const valid = validateBrowserEnvironment(env); if (!valid.ok) throw new Error(`Missing Phase G browser role tokens: ${valid.missing.join(", ")}`);
  const consoleUrl = env.AGENTIC_PHASE_G_CONSOLE_URL ?? env.CONSOLE_URL ?? "http://localhost:3000";
  const evidenceDirectory = env.AGENTIC_PHASE_G_EVIDENCE_DIR ?? join(tmpdir(), `opendx-agentic-phase-g-${Date.now()}`); assertSafeEvidenceDirectory(evidenceDirectory);
  const chrome = await findChrome(); const profile = await mkdtemp(join(tmpdir(), "opendx-agentic-phase-g-chrome-")); const port = 20500 + Math.floor(Math.random() * 400);
  const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  try {
    await waitForChrome(port); await mkdir(evidenceDirectory, { recursive: true });
    const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(consoleUrl)}`, { method: "PUT" }).then(requireOk).then((response) => response.json());
    const client = new CdpClient(target.webSocketDebuggerUrl); await client.connect(); await client.send("Page.enable"); await client.send("Runtime.enable");
    const authority = env.AGENTIC_PHASE_G_OIDC_AUTHORITY ?? "http://localhost:8080/realms/opendx"; const sessionKey = `oidc.user:${authority}:opendx-console`; const tokens = Object.fromEntries(ROLE_TOKEN_ENVIRONMENT.map(({ role, name }) => [role, env[name]]));
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: fixtureScript(sessionKey, tokens) });
    await client.send("Page.navigate", { url: routeUrl(consoleUrl, "/agentic/tasks", "agentic_operator") }); await waitForOrigin(client, consoleUrl);
    const evidence = [];
    for (const viewport of VIEWPORTS) for (const route of APPROVED_ROUTES) {
      await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 700 });
      await client.send("Page.navigate", { url: routeUrl(consoleUrl, route.path, route.role) }); await waitForHeading(client, route.heading); await keyboardProbe(client);
      const probe = await evaluate(client, probeExpression()); assertProbe(probe, viewport, route); evidence.push({ path: route.path, role: route.role, viewport: `${viewport.width}x${viewport.height}`, heading: probe.heading });
    }
    const scenarios = await evaluate(client, scenarioExpression());
    if (!scenarios.taskReplay || !scenarios.fileReplay || scenarios.branches !== 6 || !scenarios.partialReport || !scenarios.singleDecision) throw new Error(`Phase G browser scenarios failed: ${JSON.stringify(scenarios)}`);
    await client.send("Page.navigate", { url: routeUrl(consoleUrl, "/agentic/tasks", "catalog_manager") }); await waitForHeading(client, "Permission denied");
    const deniedCalls = await evaluate(client, "window.__phaseGCalls.length"); if (deniedCalls !== 0) throw new Error("Unauthorized Commerce staff called Agentic APIs");
    await writeFile(join(evidenceDirectory, "summary.json"), JSON.stringify({ dimensions: VIEWPORTS, routes: evidence, scenarios, denied: true }, null, 2), { mode: 0o600 }); client.close();
    console.info(`Agentic Console browser acceptance passed; redacted evidence: ${evidenceDirectory}`);
  } finally { child.kill("SIGTERM"); await new Promise((done) => child.once("exit", done)); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
}

function fixtureScript(sessionKey, tokens) { const fixtures = buildFixtures(); return `(() => { const sessionKey=${JSON.stringify(sessionKey)},tokens=${JSON.stringify(tokens)},fixtures=${JSON.stringify(fixtures)}; window.__phaseGCalls=[]; window.__phaseGErrors=[]; addEventListener('error',(event)=>window.__phaseGErrors.push(String(event.error?.stack??event.message))); addEventListener('unhandledrejection',(event)=>window.__phaseGErrors.push(String(event.reason?.stack??event.reason))); window.__phaseGDecisions=0; window.__phaseGSession=(role)=>JSON.stringify({access_token:tokens[role],token_type:'Bearer',scope:'openid',profile:{sub:'staff-'+role,name:'Phase G '+role,realm_access:{roles:[role]}},expires_at:Math.floor(Date.now()/1000)+3600}); const requestedRole=new URLSearchParams(location.search).get('__phase_g_role');const role=Object.hasOwn(tokens,requestedRole)?requestedRole:'agentic_operator';sessionStorage.setItem(sessionKey,window.__phaseGSession(role)); window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(!url.pathname.startsWith('/v1/admin/agentic'))return new Response('{}',{status:404});window.__phaseGCalls.push(url.pathname);const method=init.method??'GET';let value;if(url.pathname==='/v1/admin/agentic/tasks/overview')value=fixtures.overview;else if(url.pathname==='/v1/admin/agentic/tasks/intake')value=fixtures.intake;else if(url.pathname==='/v1/admin/agentic/tasks')value=fixtures.tasks;else if(url.pathname.endsWith('/operations'))value=fixtures.operations;else if(url.pathname==='/v1/admin/agentic/approvals')value=fixtures.approvals;else if(url.pathname.endsWith('/detail'))value=fixtures.approvalDetail;else if(url.pathname.endsWith('/decision')){window.__phaseGDecisions+=1;value={success:true,data:{...fixtures.approvals.data.items[0],state:'approved',version:2}};}else if(url.pathname==='/v1/admin/agentic/employees')value=fixtures.employees;else if(url.pathname.endsWith('/employees/inventory'))value=fixtures.employee;else if(url.pathname==='/v1/admin/agentic/audit')value=fixtures.audit;else if(url.pathname==='/v1/admin/agentic/files'&&method==='POST')value=fixtures.file;else if(url.pathname.endsWith('/preview'))value=fixtures.preview;else if(url.pathname.endsWith('/approve'))value=fixtures.intake;else value={success:false,errorCode:'NOT_FOUND',message:'Missing fixture'};return new Response(JSON.stringify(value),{status:value.success?200:404,headers:{'content-type':'application/json'}});}; })();`; }
function routeUrl(consoleUrl, path, role) { const url = new URL(path, consoleUrl); url.searchParams.set("__phase_g_role", role); return url.href; }
function scenarioExpression() { return `(async()=>{const json=async(path,init)=>fetch(path,init).then(r=>r.json());const headers={'content-type':'application/json','idempotency-key':'phase-g-replay'};const body=JSON.stringify({mode:'store_health_review',goal:'Review Store Health',instructions:'Use governed evidence.'});const a=await json('/v1/admin/agentic/tasks/intake',{method:'POST',headers,body}),b=await json('/v1/admin/agentic/tasks/intake',{method:'POST',headers,body});const f1=await json('/v1/admin/agentic/files',{method:'POST'}),p=await json('/v1/admin/agentic/files/${ids.file}/preview'),f2=await json('/v1/admin/agentic/files/${ids.file}/approve',{method:'POST'});const o=await json('/v1/admin/agentic/tasks/${ids.task}/operations');await json('/v1/admin/agentic/approvals/${ids.approval}/decision',{method:'POST',body:'{}'});return{taskReplay:a.data.task.id===b.data.task.id,fileReplay:f1.data.id===p.data.fileId&&f2.data.task.id===a.data.task.id,branches:o.data.branches.length,partialReport:o.data.report.completionState==='partial',workerRestart:o.data.provenance.some(x=>x.sourceType==='workflow_replay'),singleDecision:window.__phaseGDecisions===1};})()`; }
function probeExpression() { return `(()=>{const active=document.activeElement,body=document.body.innerText;return{heading:document.querySelector('h1')?.textContent?.trim(),width:document.documentElement.scrollWidth,focus:active?.matches(':focus-visible')??false,focusTag:active?.tagName,forbidden:/\\b(memory|chat)\\b|raw prompt|provider body|change model|change budget|commerce mutation/i.test(body),alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent)}})()`; }
function assertProbe(probe, viewport, route) { if (probe.heading !== route.heading) throw new Error(`${route.path}: wrong heading`); if (probe.width > viewport.width) throw new Error(`${route.path}: horizontal overflow`); if (["BODY", "HTML"].includes(probe.focusTag) || !probe.focus) throw new Error(`${route.path}: hidden keyboard focus`); if (probe.forbidden) throw new Error(`${route.path}: forbidden affordance or body`); if (probe.alerts.length) throw new Error(`${route.path}: unexpected alert`); }
async function keyboardProbe(client) { await evaluate(client, "document.body.focus();document.documentElement.scrollTop=0"); await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); }
async function waitForHeading(client, heading) { for (let i=0;i<100;i+=1){if(await evaluate(client,`document.querySelector('h1')?.textContent?.trim()===${JSON.stringify(heading)}`))return;await delay(100);}const diagnostic=await evaluate(client,"({url:location.href,heading:document.querySelector('h1')?.textContent?.trim(),body:document.body.innerText.slice(0,500),errors:window.__phaseGErrors})");throw new Error(`Heading did not settle: ${heading}; ${JSON.stringify(diagnostic)}`); }
async function waitForOrigin(client, url) { const origin=new URL(url).origin;for(let i=0;i<100;i+=1){if(await evaluate(client,`location.origin===${JSON.stringify(origin)}`))return;await delay(100);}throw new Error("Console origin unavailable"); }
class CdpClient { constructor(url){this.url=url;this.id=0;this.pending=new Map();} async connect(){this.socket=new WebSocket(this.url);this.socket.addEventListener('message',(event)=>{const message=JSON.parse(String(event.data));const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);message.error?pending.reject(new Error(message.error.message)):pending.resolve(message.result);});await new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve,{once:true});this.socket.addEventListener('error',reject,{once:true});});} send(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}));});} close(){this.socket.close();} }
async function evaluate(client, expression){const result=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error("Browser evaluation failed");return result.result.value;}
async function findChrome(){for(const path of [process.env.CHROME_BIN,"/usr/bin/google-chrome","/usr/bin/chromium","/usr/bin/chromium-browser"].filter(Boolean)){try{await access(path,constants.X_OK);return path;}catch{}}throw new Error("Chrome not found; set CHROME_BIN");}
async function waitForChrome(port){for(let i=0;i<80;i+=1){try{if((await fetch(`http://127.0.0.1:${port}/json/version`)).ok)return;}catch{}await delay(100);}throw new Error("Chrome DevTools endpoint unavailable");}
function requireOk(response){if(!response.ok)throw new Error(`Chrome DevTools request failed: ${response.status}`);return response;} const delay=(ms)=>new Promise((done)=>setTimeout(done,ms));

if (import.meta.url === pathToFileURL(process.argv[1]).href) await runBrowserCheck();
