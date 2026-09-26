// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve(process.cwd(), "docs/screenshots");
fs.mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  console.log("Launching headless Chrome...");
  const chrome = spawn("google-chrome", [
    "--headless=new",
    "--remote-debugging-port=9222",
    "--disable-gpu",
    "--no-sandbox",
    "--window-size=1440,900",
  ]);

  await new Promise((resolve) => setTimeout(resolve, 1500));

  try {
    const versionRes = await fetch("http://127.0.0.1:9222/json/version");
    const versionData = await versionRes.json();
    console.log("Connected to browser:", versionData.Browser);

    const newTabRes = await fetch("http://127.0.0.1:9222/json/new", { method: "PUT" });
    const tabData = await newTabRes.json();
    const wsUrl = tabData.webSocketDebuggerUrl;

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    const pending = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg.result);
        pending.delete(msg.id);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // 1. Navigate to console to set session storage
    console.log("Setting up authentication in Console...");
    await send("Page.navigate", { url: "http://localhost:3000/sign-in" });
    await new Promise((r) => setTimeout(r, 1500));

    const authScript = `
      const storedUser = {
        access_token: "dev-admin-token",
        token_type: "Bearer",
        scope: "openid",
        profile: {
          sub: "dev-admin",
          name: "Administrator (Dev)",
          realm_access: {
            roles: [
              "administrator",
              "agentic_operator",
              "agentic_approver",
              "agentic_governance_admin",
              "agentic_auditor",
              "catalog_manager",
              "inventory_manager",
              "operations_manager",
              "finance_operator",
              "crm_operator",
              "support_operator",
              "executive_viewer",
            ],
          },
        },
        expires_at: Math.floor(Date.now() / 1000) + 86400 * 30,
      };
      sessionStorage.setItem("oidc.user:http://localhost:8081/realms/opendx:opendx-console", JSON.stringify(storedUser));
      sessionStorage.setItem("oidc.user:http://localhost:8080/realms/opendx:opendx-console", JSON.stringify(storedUser));
      localStorage.setItem("theme", "dark");
    `;
    await send("Runtime.evaluate", { expression: authScript });

    const pagesToCapture = [
      { name: "01_dashboard.png", url: "http://localhost:3000/dashboard", delay: 2500 },
      { name: "02_company_overview.png", url: "http://localhost:3000/company-overview", delay: 2000 },
      { name: "03_workflow_studio.png", url: "http://localhost:3000/agentic/workflows", delay: 3000 },
      { name: "04_command_center.png", url: "http://localhost:3000/agentic/command-center", delay: 2500 },
      { name: "05_approval_inbox.png", url: "http://localhost:3000/agentic/approvals", delay: 2500 },
      { name: "06_digital_employees.png", url: "http://localhost:3000/agentic/employees", delay: 2000 },
      { name: "07_customers_crm.png", url: "http://localhost:3000/customers", delay: 2000 },
      { name: "08_marketing_campaigns.png", url: "http://localhost:3000/marketing/campaigns", delay: 2000 },
      { name: "09_storefront.png", url: "http://localhost:3100", delay: 2000 },
    ];

    for (const item of pagesToCapture) {
      console.log(`Capturing ${item.name} from ${item.url}...`);
      await send("Page.navigate", { url: item.url });
      await new Promise((r) => setTimeout(r, item.delay));
      const shot = await send("Page.captureScreenshot", { format: "png" });
      if (shot && shot.data) {
        const filePath = path.join(OUT_DIR, item.name);
        fs.writeFileSync(filePath, Buffer.from(shot.data, "base64"));
        console.log(`Saved: ${filePath} (${(shot.data.length / 1024).toFixed(1)} KB)`);
      }
    }

    ws.close();
    console.log("All screenshots captured successfully!");
  } finally {
    chrome.kill();
  }
}

main().catch(console.error);
