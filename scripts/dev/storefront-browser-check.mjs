// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const storefrontUrl = process.env.STOREFRONT_URL ?? "http://localhost:3100";
const outputDirectory =
  process.env.BROWSER_EVIDENCE_DIR ??
  join(tmpdir(), "opendx-storefront-browser");
async function main() {
  const chrome = await findChrome();
  const profile = await mkdtemp(join(tmpdir(), "opendx-chrome-"));
  const port = 19_000 + Math.floor(Math.random() * 500);
  const processHandle = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    await waitForChrome(port);
    await mkdir(outputDirectory, { recursive: true });
    const target = await fetch(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent(storefrontUrl)}`,
      {
        method: "PUT",
      },
    )
      .then(requireOk)
      .then((response) => response.json());
    const client = new CdpClient(target.webSocketDebuggerUrl);
    await client.connect();
    await client.send("Page.enable");
    await client.send("Runtime.enable");

    const evidence = [];
    for (const viewport of [
      { width: 390, height: 844, name: "mobile" },
      { width: 768, height: 1024, name: "tablet" },
      { width: 1440, height: 900, name: "desktop" },
    ]) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.width < 768,
      });
      await client.send("Page.navigate", { url: storefrontUrl });
      await waitForCatalog(client);
      await client.send("Runtime.evaluate", {
        expression:
          "document.body.focus(); document.documentElement.scrollTop = 0",
      });
      await client.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Tab",
        code: "Tab",
        windowsVirtualKeyCode: 9,
      });
      await client.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Tab",
        code: "Tab",
        windowsVirtualKeyCode: 9,
      });
      const result = await evaluate(
        client,
        `(() => {
      const active = document.activeElement;
      const focusStyle = active instanceof HTMLElement ? getComputedStyle(active) : undefined;
      const images = [...document.images].map((image) => ({
        alt: image.alt,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      }));
      return {
        viewport: { width: innerWidth, height: innerHeight },
        documentWidth: document.documentElement.scrollWidth,
        hasMain: document.querySelector('main') !== null,
        productCount: document.querySelectorAll('article').length,
        alertText: document.querySelector('[role="alert"]')?.textContent ?? null,
        images,
        focus: {
          tag: active?.tagName ?? null,
          label: active?.getAttribute('aria-label') ?? active?.textContent?.trim().slice(0, 80) ?? null,
          focusVisible: active?.matches(':focus-visible') ?? false,
          outline: focusStyle?.outline ?? null,
          boxShadow: focusStyle?.boxShadow ?? null,
        },
      };
    })()`,
      );
      assertViewport(result, viewport);
      const screenshot = await client.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      const screenshotPath = join(
        outputDirectory,
        `${viewport.name}-${viewport.width}x${viewport.height}.png`,
      );
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      evidence.push({ ...result, screenshotPath });
    }
    const guestCart = await verifyGuestCart(client);
    client.close();
    console.log(
      JSON.stringify({ storefrontUrl, evidence, guestCart }, null, 2),
    );
  } finally {
    await stopProcess(processHandle);
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
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

async function verifyGuestCart(client) {
  const productUrl = await evaluate(
    client,
    "document.querySelector('article a')?.href ?? null",
  );
  if (productUrl === null) throw new Error("Guest cart check found no product");

  await client.send("Page.navigate", { url: productUrl });
  await waitForCondition(
    client,
    `
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent?.trim() === 'Thêm vào giỏ' && !button.disabled
      )
    `,
    "Product detail did not expose an available add-to-cart action",
  );
  await client.send("Runtime.evaluate", {
    expression: `
      [...document.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === 'Thêm vào giỏ')
        ?.click()
    `,
  });
  await waitForCondition(
    client,
    `
      document.querySelector('[role="status"]')?.textContent?.includes('Đã thêm vào giỏ hàng')
      || document.querySelector('[role="alert"]') !== null
    `,
    "Guest add-to-cart operation did not settle",
  );
  const result = await evaluate(
    client,
    `(() => ({
      status: document.querySelector('[role="status"]')?.textContent?.trim() ?? null,
      alert: document.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
      cartLabel: document.querySelector('[aria-label^="Giỏ hàng,"]')?.getAttribute('aria-label') ?? null,
      readableCookieNames: document.cookie
        .split(';')
        .map((cookie) => cookie.trim().split('=')[0])
        .filter(Boolean),
    }))()`,
  );
  if (result.alert !== null)
    throw new Error(`Guest cart alert: ${result.alert}`);
  if (result.status !== "Đã thêm vào giỏ hàng.") {
    throw new Error("Guest cart did not report successful addition");
  }
  if (!result.cartLabel?.includes("1 sản phẩm")) {
    throw new Error(`Guest cart counter did not update: ${result.cartLabel}`);
  }
  if (!result.readableCookieNames.includes("opendx_csrf")) {
    throw new Error("Storefront cannot read its CSRF cookie");
  }
  return result;
}

async function waitForCondition(client, expression, timeoutMessage) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(client, expression)) return;
    await delay(100);
  }
  throw new Error(timeoutMessage);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id === undefined) return;
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

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails !== undefined)
    throw new Error("Browser evaluation failed");
  return response.result.value;
}

async function waitForCatalog(client) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = await evaluate(
      client,
      `
      document.readyState === 'complete'
      && (document.querySelectorAll('article').length > 0 || document.querySelector('[role="alert"]') !== null)
      && [...document.images].every((image) => image.complete)
    `,
    );
    if (ready) return;
    await delay(100);
  }
  throw new Error(
    "Storefront catalog did not settle before browser-check timeout",
  );
}

function assertViewport(result, expected) {
  if (!result.hasMain)
    throw new Error(`${expected.name}: semantic main is missing`);
  if (result.alertText !== null)
    throw new Error(`${expected.name}: storefront alert: ${result.alertText}`);
  if (result.productCount === 0)
    throw new Error(`${expected.name}: no seeded products rendered`);
  if (result.documentWidth > result.viewport.width) {
    throw new Error(
      `${expected.name}: horizontal overflow ${result.documentWidth}px > ${result.viewport.width}px`,
    );
  }
  const brokenImage = result.images.find(
    (image) => !image.complete || image.naturalWidth === 0 || !image.alt.trim(),
  );
  if (brokenImage !== undefined) {
    throw new Error(
      `${expected.name}: broken or unlabeled product image ${JSON.stringify(brokenImage)}`,
    );
  }
  if (
    result.focus.tag === "BODY" ||
    result.focus.tag === "HTML" ||
    !result.focus.focusVisible
  ) {
    throw new Error(
      `${expected.name}: keyboard focus is not visible on an interactive element`,
    );
  }
}

async function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue to the next known executable.
    }
  }
  throw new Error(
    "Chrome not found; set CHROME_BIN to a Chrome or Chromium executable",
  );
}

async function waitForChrome(debugPort) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${debugPort}/json/version`,
      );
      if (response.ok) return;
    } catch {
      // Chrome has not opened its debugging socket yet.
    }
    await delay(100);
  }
  throw new Error("Chrome DevTools endpoint did not become ready");
}

function requireOk(response) {
  if (!response.ok)
    throw new Error(`Chrome DevTools request failed with ${response.status}`);
  return response;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

await main();
