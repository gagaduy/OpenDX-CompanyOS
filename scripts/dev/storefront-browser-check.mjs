// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const storefrontUrl = process.env.STOREFRONT_URL ?? "http://localhost:3100";
const catalogUrl = new URL("/products", storefrontUrl).toString();
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
    await client.send("Network.enable");
    await client.send("Network.setCookie", {
      name: "opendx_csrf",
      value: "legacy-path-token",
      url: "http://localhost:4000/v1/storefront",
      path: "/v1/storefront",
      sameSite: "Lax",
    });
    await verifyIntroHomepage(client);
    const intermediateHeader = await verifyIntermediateHeader(
      client,
      outputDirectory,
    );

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
      const homepage = await captureHomepageThemes(
        client,
        outputDirectory,
        viewport,
      );
      await client.send("Page.navigate", { url: catalogUrl });
      await waitForCatalog(client);
      const categoryHero = await verifyCategoryHero(
        client,
        outputDirectory,
        viewport,
      );
      await setTheme(client, "dark");
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
      const lightTheme = await captureLightTheme(
        client,
        outputDirectory,
        viewport,
      );
      evidence.push({
        ...result,
        screenshotPath,
        lightTheme,
        homepage,
        categoryHero,
      });
    }
    const staticHomepageFallback = await verifyStaticHomepageFallback(client);
    const guestCart = await verifyGuestCart(client);
    const signIn = await captureSignInSurface(client, outputDirectory);
    const commerce = await captureCommerceSurfaces(client, outputDirectory);
    client.close();
    console.log(
      JSON.stringify(
        {
          storefrontUrl,
          intermediateHeader,
          evidence,
          staticHomepageFallback,
          guestCart,
          signIn,
          commerce,
        },
        null,
        2,
      ),
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

async function captureCommerceSurfaces(client, outputDirectory) {
  const fixtures = Object.fromEntries(
    [
      "/v1/storefront/session",
      "/v1/storefront/cart",
      "/v1/storefront/account",
      "/v1/storefront/account/addresses",
      "/v1/storefront/orders/order-1",
    ].map((path) => [path, commerceFixture(path)]),
  );
  const fixtureScript = await client.send(
    "Page.addScriptToEvaluateOnNewDocument",
    {
      source: `(() => {
      const fixtures = ${JSON.stringify(fixtures)};
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const rawUrl = typeof input === 'string' || input instanceof URL
          ? String(input)
          : input.url;
        const url = new URL(rawUrl, location.href);
        const fixture = fixtures[url.pathname];
        if (fixture === undefined) return originalFetch(input, init);
        return new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      };
    })();`,
    },
  );
  const evidence = [];
  try {
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
      for (const theme of ["dark", "light"]) {
        await client.send("Page.navigate", {
          url: new URL("/checkout", storefrontUrl).toString(),
        });
        await waitForCondition(
          client,
          `document.querySelector('.checkout-layout') !== null`,
          `${viewport.name}: checkout surface did not settle`,
        );
        await setTheme(client, theme);
        const checkout = await inspectCommerceSurface(
          client,
          ".checkout-layout",
          "Hoàn tất đơn hàng",
        );
        assertCommerceViewport(checkout, viewport, "checkout", theme);
        const checkoutPath = join(
          outputDirectory,
          `checkout-${viewport.name}-${theme}-${viewport.width}x${viewport.height}.png`,
        );
        await saveScreenshot(client, checkoutPath);

        await client.send("Page.navigate", {
          url: new URL("/orders/order-1", storefrontUrl).toString(),
        });
        await waitForCondition(
          client,
          `document.querySelector('.order-detail-layout') !== null`,
          `${viewport.name}: order detail surface did not settle`,
        );
        await setTheme(client, theme);
        const order = await inspectCommerceSurface(
          client,
          ".order-detail-layout",
          "NVC-20260806-A1B2C3D4",
        );
        assertCommerceViewport(order, viewport, "order", theme);
        const orderPath = join(
          outputDirectory,
          `order-${viewport.name}-${theme}-${viewport.width}x${viewport.height}.png`,
        );
        await saveScreenshot(client, orderPath);
        evidence.push({
          viewport,
          theme,
          checkout: { ...checkout, screenshotPath: checkoutPath },
          order: { ...order, screenshotPath: orderPath },
        });
      }
    }
    return evidence;
  } finally {
    await client.send("Page.removeScriptToEvaluateOnNewDocument", {
      identifier: fixtureScript.identifier,
    });
  }
}

function commerceFixture(pathname) {
  const envelope = (data) => ({ success: true, message: "Fixture", data });
  if (pathname === "/v1/storefront/session") {
    return envelope({
      kind: "customer",
      customerId: "customer-1",
      email: "duy@example.com",
      expiresAt: "2099-01-01T00:00:00.000Z",
      cartResolution: "not_required",
    });
  }
  if (pathname === "/v1/storefront/cart") {
    return envelope({
      id: "cart-1",
      ownerKind: "customer",
      version: 2,
      status: "checkout_ready",
      items: [],
      itemCount: 1,
      totalVnd: 32990000,
      requiresAction: false,
    });
  }
  if (pathname === "/v1/storefront/account") {
    return envelope({
      id: "customer-1",
      email: "duy@example.com",
      fullName: "Duy Duong",
      phoneNumber: "0901000001",
      version: 1,
    });
  }
  if (pathname === "/v1/storefront/account/addresses") {
    return envelope([
      {
        id: "address-1",
        customerId: "customer-1",
        recipientName: "Duy Duong",
        phoneNumber: "0901000001",
        addressLine: "1 Nguyen Hue",
        ward: "Ben Nghe",
        provinceOrCity: "Ho Chi Minh",
        isDefault: true,
        version: 1,
        createdAt: "2026-08-06T08:00:00.000Z",
        updatedAt: "2026-08-06T08:00:00.000Z",
      },
    ]);
  }
  if (pathname === "/v1/storefront/orders/order-1") {
    return envelope({
      id: "order-1",
      publicNumber: "NVC-20260806-A1B2C3D4",
      status: "paid",
      totalVnd: 32990000,
      currency: "VND",
      createdAt: "2026-08-06T08:00:00.000Z",
      updatedAt: "2026-08-06T08:05:00.000Z",
      checkoutId: "checkout-1",
      addressSnapshot: {},
      contactSnapshot: {},
      subtotalVnd: 34990000,
      discountVnd: 2000000,
      taxMode: "included_not_separated",
      reservationExpiresAt: "2026-08-06T09:00:00.000Z",
      paidAt: "2026-08-06T08:05:00.000Z",
      version: 2,
      lines: [
        {
          id: "line-1",
          variantId: "variant-1",
          sku: "NOVA-001-1",
          productTitle: "Nova Laptop Pro",
          variantLabel: "16 GB / 512 GB",
          quantity: 1,
          unitPriceVnd: 34990000,
          discountAllocationVnd: 2000000,
          lineTotalVnd: 32990000,
          linePosition: 0,
        },
      ],
      history: [
        {
          previousStatus: "pending_payment",
          newStatus: "paid",
          actorType: "provider",
          reasonCode: "PAYMENT_CONFIRMED",
          occurredAt: "2026-08-06T08:05:00.000Z",
        },
      ],
    });
  }
  return undefined;
}

async function inspectCommerceSurface(client, selector, heading) {
  return evaluate(
    client,
    `(() => ({
      theme: document.documentElement.dataset.theme,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      hasSurface: document.querySelector(${JSON.stringify(selector)}) !== null,
      heading: document.querySelector('h1')?.textContent?.trim() ?? null,
      alert: document.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
      expectedHeading: ${JSON.stringify(heading)},
    }))()`,
  );
}

function assertCommerceViewport(result, viewport, surface, theme) {
  if (!result.hasSurface || result.heading !== result.expectedHeading) {
    throw new Error(`${viewport.name} ${theme}: ${surface} content is missing`);
  }
  if (result.alert !== null) {
    throw new Error(`${viewport.name} ${theme}: ${surface} alert: ${result.alert}`);
  }
  if (result.documentWidth > viewport.width) {
    throw new Error(
      `${viewport.name} ${theme}: ${surface} overflow ${result.documentWidth}px > ${viewport.width}px`,
    );
  }
  if (result.theme !== theme) {
    throw new Error(`${viewport.name}: ${surface} did not render in ${theme}`);
  }
}

async function setTheme(client, theme) {
  const current = await evaluate(
    client,
    "document.documentElement.dataset.theme",
  );
  if (current === theme) return;
  const targetLabel = theme === "light" ? "Dùng giao diện sáng" : "Dùng giao diện tối";
  await client.send("Runtime.evaluate", {
    expression: `document.querySelector('[aria-label=${JSON.stringify(targetLabel)}]')?.click()`,
  });
  await waitForCondition(
    client,
    `document.documentElement.dataset.theme === ${JSON.stringify(theme)}`,
    `Theme did not change to ${theme}`,
  );
}

async function saveScreenshot(client, path) {
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(path, Buffer.from(screenshot.data, "base64"));
}

async function captureSignInSurface(client, outputDirectory) {
  const url = new URL("/sign-in", storefrontUrl).toString();
  await client.send("Page.navigate", { url });
  await waitForCondition(
    client,
    `document.querySelector('.auth-panel') !== null && [...document.images].every((image) => image.complete && image.naturalWidth > 0)`,
    "Sign-in surface did not settle",
  );
  await client.send("Runtime.evaluate", {
    expression: `document.querySelector('[aria-label="Dùng giao diện sáng"]')?.click()`,
  });
  await waitForCondition(
    client,
    `document.documentElement.dataset.theme === "light"`,
    "Sign-in light theme did not activate",
  );
  const result = await evaluate(
    client,
    `(() => {
      const panel = document.querySelector('.auth-panel')?.getBoundingClientRect();
      const image = document.querySelector('.auth-backdrop');
      return {
        theme: document.documentElement.dataset.theme,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        panel: panel ? { width: panel.width, height: panel.height } : null,
        image: image instanceof HTMLImageElement
          ? { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }
          : null,
      };
    })()`,
  );
  if (result.documentWidth > result.viewportWidth || result.panel === null) {
    throw new Error("Sign-in light surface is outside its viewport");
  }
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const screenshotPath = join(outputDirectory, "sign-in-light-1440x900.png");
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
  return { ...result, screenshotPath };
}

async function captureLightTheme(client, outputDirectory, viewport) {
  await client.send("Runtime.evaluate", {
    expression: `document.querySelector('[aria-label="Dùng giao diện sáng"]')?.click()`,
  });
  await waitForCondition(
    client,
    `document.documentElement.dataset.theme === "light"`,
    `${viewport.name}: light theme did not activate`,
  );
  const result = await evaluate(
    client,
    `(() => ({
      theme: document.documentElement.dataset.theme,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      canvas: getComputedStyle(document.body).backgroundColor,
      toggleLabel: document.querySelector('[aria-label="Dùng giao diện tối"]')?.getAttribute('aria-label') ?? null,
    }))()`,
  );
  if (result.documentWidth > result.viewportWidth) {
    throw new Error(
      `${viewport.name} light: horizontal overflow ${result.documentWidth}px > ${result.viewportWidth}px`,
    );
  }
  if (result.canvas !== "rgb(255, 255, 255)") {
    throw new Error(`${viewport.name}: light canvas did not render: ${result.canvas}`);
  }
  if (result.toggleLabel !== "Dùng giao diện tối") {
    throw new Error(`${viewport.name}: light theme toggle label is missing`);
  }
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const screenshotPath = join(
    outputDirectory,
    `${viewport.name}-light-${viewport.width}x${viewport.height}.png`,
  );
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
  await client.send("Runtime.evaluate", {
    expression: `document.querySelector('[aria-label="Dùng giao diện tối"]')?.click()`,
  });
  await waitForCondition(
    client,
    `document.documentElement.dataset.theme === "dark"`,
    `${viewport.name}: dark theme did not restore`,
  );
  return { ...result, screenshotPath };
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
  await client.send("Page.navigate", { url: catalogUrl });
  await waitForCatalog(client);
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

async function verifyIntroHomepage(client) {
  await client.send("Page.navigate", { url: storefrontUrl });
  await waitForCondition(
    client,
    `
      document.readyState === 'complete'
      && document.querySelector('main h1')?.textContent?.includes('Bước vào tương lai')
      && document.querySelectorAll('[data-testid="homepage-scene"]').length === 6
      && ['3d', 'static'].includes(document.querySelector('main')?.dataset.experienceMode)
      && [...document.querySelectorAll('a')].some(
        (link) => link.textContent?.trim() === 'Xem sản phẩm'
          && new URL(link.href).pathname === '/products'
      )
    `,
    "Storefront introduction homepage did not expose the product discovery CTA",
  );
}

async function verifyIntermediateHeader(client, outputDirectory) {
  const evidence = [];
  for (const viewport of [
    { width: 800, height: 500, mode: "collapsed" },
    { width: 1024, height: 600, mode: "collapsed" },
    { width: 1100, height: 700, mode: "collapsed" },
    { width: 1200, height: 700, mode: "wide" },
  ]) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send("Page.navigate", { url: storefrontUrl });
    await waitForCondition(
      client,
      `document.querySelector('.topbar-inner') !== null`,
      `${viewport.width}px: header did not settle`,
    );

    for (const theme of ["dark", "light"]) {
      await setTheme(client, theme);
      const closed = await evaluate(
        client,
        `(() => {
          const visible = (element) => element instanceof HTMLElement
            && getComputedStyle(element).display !== 'none'
            && element.getBoundingClientRect().width > 0
            && element.getBoundingClientRect().height > 0;
          const nav = document.querySelector('.main-nav');
          const search = document.querySelector('.header-search');
          const menu = document.querySelector('.mobile-menu');
          const navRect = nav?.getBoundingClientRect();
          const searchRect = search?.getBoundingClientRect();
          return {
            viewportWidth: innerWidth,
            menuVisible: visible(menu),
            navVisible: visible(nav),
            searchVisible: visible(search),
            navRect: navRect ? { left: navRect.left, right: navRect.right } : null,
            searchRect: searchRect ? { left: searchRect.left, right: searchRect.right } : null,
            overlaps: Boolean(
              visible(nav)
              && visible(search)
              && navRect.right > searchRect.left
              && navRect.left < searchRect.right
              && navRect.bottom > searchRect.top
              && navRect.top < searchRect.bottom
            ),
            documentWidth: document.documentElement.scrollWidth,
          };
        })()`,
      );
      const collapsed = viewport.mode === "collapsed";
      if (
        closed.menuVisible !== collapsed
        || closed.navVisible === collapsed
        || !closed.searchVisible
        || closed.overlaps
        || closed.documentWidth > viewport.width
      ) {
        throw new Error(
          `${viewport.width}px ${theme}: invalid ${viewport.mode} header ${JSON.stringify(closed)}`,
        );
      }

      const closedPath = join(
        outputDirectory,
        `header-${viewport.width}-${theme}-closed.png`,
      );
      await saveScreenshot(client, closedPath);
      const result = { ...viewport, theme, closed, closedPath };

      if (collapsed) {
        await client.send("Runtime.evaluate", {
          expression: `document.querySelector('[aria-label="Mở menu"]')?.click()`,
        });
        await waitForCondition(
          client,
          `document.querySelector('.main-nav.open') !== null
            && document.querySelector('[aria-label="Đóng menu"]') !== null`,
          `${viewport.width}px ${theme}: intermediate menu did not open`,
        );
        const open = await evaluate(
          client,
          `(() => {
            const nav = document.querySelector('.main-nav.open');
            return {
              display: nav ? getComputedStyle(nav).display : null,
              linkCount: nav?.querySelectorAll('a').length ?? 0,
              top: nav?.getBoundingClientRect().top ?? null,
            };
          })()`,
        );
        if (open.display !== "flex" || open.linkCount !== 4 || open.top !== 76) {
          throw new Error(
            `${viewport.width}px ${theme}: invalid open intermediate menu ${JSON.stringify(open)}`,
          );
        }
        const openPath = join(
          outputDirectory,
          `header-${viewport.width}-${theme}-open.png`,
        );
        await saveScreenshot(client, openPath);
        result.open = open;
        result.openPath = openPath;
        await client.send("Runtime.evaluate", {
          expression: `document.querySelector('[aria-label="Đóng menu"]')?.click()`,
        });
        await waitForCondition(
          client,
          `document.querySelector('.main-nav.open') === null
            && document.querySelector('[aria-label="Mở menu"]') !== null`,
          `${viewport.width}px ${theme}: intermediate menu did not close`,
        );
      }
      evidence.push(result);
    }
  }
  return evidence;
}

async function captureHomepageThemes(client, outputDirectory, viewport) {
  await client.send("Page.navigate", { url: storefrontUrl });
  await waitForCondition(
    client,
    `document.querySelectorAll('[data-testid="homepage-scene"]').length === 6
      && (
        document.querySelector('main')?.dataset.experienceMode === 'static'
        || (
          document.querySelector('.homepage-experience-canvas canvas') !== null
          && document.querySelector('[aria-label="Đang tải không gian 3D"]') === null
        )
      )`,
    `${viewport.name}: homepage scenes did not settle`,
  );
  await client.send("Runtime.evaluate", {
    expression: "document.body.focus(); document.documentElement.scrollTop = 0",
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
  const evidence = [];
  for (const theme of ["dark", "light"]) {
    await setTheme(client, theme);
    await client.send("Runtime.evaluate", {
      expression: "document.documentElement.scrollTop = 0",
    });
    const result = await evaluate(
      client,
      `(() => ({
        theme: document.documentElement.dataset.theme,
        mode: document.querySelector('main')?.dataset.experienceMode ?? null,
        sceneCount: document.querySelectorAll('[data-testid="homepage-scene"]').length,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        hasCanvas: document.querySelector('.homepage-experience-canvas canvas') !== null,
        alert: document.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
        focusVisible: document.activeElement?.matches(':focus-visible') ?? false,
        ctas: [...document.querySelectorAll('.homepage-scene-intro a')].map(
          (link) => new URL(link.href).pathname + new URL(link.href).hash
        ),
      }))()`,
    );
    if (result.sceneCount !== 6 || !["3d", "static"].includes(result.mode)) {
      throw new Error(`${viewport.name} ${theme}: homepage journey is incomplete`);
    }
    if (result.mode === "3d" && !result.hasCanvas) {
      throw new Error(`${viewport.name} ${theme}: 3D mode has no canvas`);
    }
    if (result.alert !== null || !result.focusVisible) {
      throw new Error(`${viewport.name} ${theme}: homepage accessibility state failed`);
    }
    if (
      !result.ctas.includes("/products")
      || !result.ctas.includes("/products#categories")
    ) {
      throw new Error(`${viewport.name} ${theme}: homepage Catalog CTAs are missing`);
    }
    if (result.documentWidth > result.viewportWidth) {
      throw new Error(
        `${viewport.name} ${theme}: homepage overflow ${result.documentWidth}px > ${result.viewportWidth}px`,
      );
    }
    const screenshotPath = join(
      outputDirectory,
      `homepage-${viewport.name}-${theme}-${viewport.width}x${viewport.height}.png`,
    );
    await saveScreenshot(client, screenshotPath);
    const sceneEvidence = [];
    const sampledScenes = ["smartphones", "computing", "audio", "gaming"];
    for (const scene of sampledScenes) {
      await client.send("Runtime.evaluate", {
        expression: `(() => {
          const journey = document.querySelector('.homepage-experience-journey');
          if (!(journey instanceof HTMLElement)) return;
          const sceneIndex = ${JSON.stringify([
            "intro",
            "smartphones",
            "computing",
            "audio",
            "gaming",
            "featured",
          ])}.indexOf(${JSON.stringify(scene)});
          const journeyTop = scrollY + journey.getBoundingClientRect().top;
          const scrollRange = Math.max(1, journey.scrollHeight - innerHeight);
          const sceneMidpoint = (sceneIndex + 0.5) / 6;
          scrollTo({ top: journeyTop + scrollRange * sceneMidpoint });
        })()`,
      });
      await delay(250);
      await client.send("Runtime.evaluate", {
        expression: "window.dispatchEvent(new Event('scroll'))",
      });
      await waitForCondition(
        client,
        `document.querySelector('.homepage-scene-navigation button[aria-current="location"]')
          ?.textContent?.trim() === ${JSON.stringify(homepageSceneLabel(scene))}
          && document.querySelector('[role="alert"]') === null
          && (
            document.querySelector('main')?.dataset.experienceMode === 'static'
            || document.querySelector('.homepage-experience-canvas canvas') !== null
          )`,
        `${viewport.name} ${theme}: ${scene} scene did not settle`,
      );
      await delay(250);
      const sample = await evaluate(
        client,
        `({
          scene: ${JSON.stringify(scene)},
          activeLabel: document.querySelector('.homepage-scene-navigation button[aria-current="location"]')
            ?.textContent?.trim() ?? null,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
          alert: document.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
        })`,
      );
      if (sample.documentWidth > sample.viewportWidth || sample.alert !== null) {
        throw new Error(`${viewport.name} ${theme}: ${scene} scene is outside its viewport`);
      }
      const samplePath = join(
        outputDirectory,
        `homepage-${viewport.name}-${theme}-${scene}.png`,
      );
      await saveScreenshot(client, samplePath);
      sceneEvidence.push({ ...sample, screenshotPath: samplePath });
    }
    evidence.push({ ...result, screenshotPath, sceneEvidence });
  }
  return evidence;
}

function homepageSceneLabel(scene) {
  return {
    smartphones: "Điện thoại",
    computing: "Máy tính",
    audio: "Âm thanh",
    gaming: "Gaming",
  }[scene];
}

async function verifyStaticHomepageFallback(client) {
  const script = await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => null,
    });`,
  });
  try {
    await client.send("Page.navigate", { url: storefrontUrl });
    await waitForCondition(
      client,
      `document.querySelector('main')?.dataset.experienceMode === 'static'
        && document.querySelectorAll('[data-testid="homepage-scene"]').length === 6
        && [...document.querySelectorAll('.homepage-scene-intro a')].some(
          (link) => new URL(link.href).pathname === '/products' && new URL(link.href).hash === ''
        )
        && [...document.querySelectorAll('.homepage-scene-intro a')].some(
          (link) => new URL(link.href).pathname === '/products'
            && new URL(link.href).hash === '#categories'
        )`,
      "Homepage did not preserve its semantic journey without WebGL",
    );
    return evaluate(
      client,
      `({
        mode: document.querySelector('main')?.dataset.experienceMode,
        sceneCount: document.querySelectorAll('[data-testid="homepage-scene"]').length,
        ctas: [...document.querySelectorAll('.homepage-scene-intro a')].map(
          (link) => new URL(link.href).pathname + new URL(link.href).hash
        ),
      })`,
    );
  } finally {
    await client.send("Page.removeScriptToEvaluateOnNewDocument", {
      identifier: script.identifier,
    });
  }
}

async function waitForCondition(client, expression, timeoutMessage) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(client, expression)) return;
    await delay(100);
  }
  const diagnostics = await evaluate(
    client,
    `({
      url: location.href,
      title: document.title,
      heading: document.querySelector('h1')?.textContent?.trim() ?? null,
      alert: document.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
      status: document.querySelector('[role="status"]')?.textContent?.trim() ?? null,
      scrollY,
      activeScene: document.querySelector('.homepage-scene-navigation button[aria-current="location"]')
        ?.textContent?.trim() ?? null,
      smartphoneTop: document.getElementById('homepage-smartphones')
        ?.getBoundingClientRect().top ?? null,
      journeyTop: document.querySelector('.homepage-experience-journey')
        ?.getBoundingClientRect().top ?? null,
      journeyHeight: document.querySelector('.homepage-experience-journey')
        ?.scrollHeight ?? null,
      innerHeight,
    })`,
  );
  throw new Error(`${timeoutMessage}: ${JSON.stringify(diagnostics)}`);
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
      && document.querySelector('.hero-category-selector') !== null
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

async function verifyCategoryHero(client, outputDirectory, viewport) {
  const evidence = [];
  for (const theme of ["dark", "light"]) {
    await setTheme(client, theme);
    await client.send("Runtime.evaluate", {
      expression:
        "document.querySelectorAll('.hero-category-selector button')[0]?.click()",
    });
    await waitForCondition(
      client,
      `document.querySelector('.hero-category-selector button[aria-pressed="true"]')
        === document.querySelectorAll('.hero-category-selector button')[0]`,
      `${viewport.name} ${theme}: first hero category did not settle`,
    );
    const initial = await evaluate(
      client,
      `(() => {
        const buttons = [...document.querySelectorAll('.hero-category-selector button')];
        return {
          buttonCount: buttons.length,
          title: document.querySelector('.storefront-hero h1')?.textContent?.trim() ?? null,
          image: document.querySelector('.storefront-hero > img')?.getAttribute('src') ?? null,
          selected: buttons.find((button) => button.getAttribute('aria-pressed') === 'true')?.textContent?.trim() ?? null,
        };
      })()`,
    );
    if (
      initial.buttonCount < 2 ||
      initial.title === null ||
      initial.image === null
    ) {
      throw new Error(
        `${viewport.name} ${theme}: category hero is incomplete: ${JSON.stringify(initial)}`,
      );
    }
    await client.send("Runtime.evaluate", {
      expression:
        "document.querySelectorAll('.hero-category-selector button')[1]?.click()",
    });
    await waitForCondition(
      client,
      `document.querySelector('.storefront-hero h1')?.textContent?.trim() !== ${JSON.stringify(initial.title)}
        && document.querySelector('.storefront-hero > img')?.getAttribute('src') !== ${JSON.stringify(initial.image)}
        && document.querySelector('.storefront-hero > img')?.complete === true
        && document.querySelector('.storefront-hero > img')?.naturalWidth > 0`,
      `${viewport.name} ${theme}: category hero did not change slide`,
    );
    const selected = await evaluate(
      client,
      `(() => {
        const button = [...document.querySelectorAll('.hero-category-selector button')]
          .find((candidate) => candidate.getAttribute('aria-pressed') === 'true');
        const href = document.querySelector('.storefront-hero a.button.primary')?.getAttribute('href') ?? null;
        return {
          category: button?.textContent?.trim() ?? null,
          href,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
        };
      })()`,
    );
    if (
      selected.category === null ||
      !selected.href?.startsWith("/products?category=") ||
      !selected.href.endsWith("#catalog") ||
      selected.documentWidth > selected.viewportWidth
    ) {
      throw new Error(
        `${viewport.name} ${theme}: selected category hero is invalid: ${JSON.stringify(selected)}`,
      );
    }
    await delay(300);
    const screenshotPath = join(
      outputDirectory,
      `category-hero-${viewport.name}-${theme}-${viewport.width}x${viewport.height}.png`,
    );
    await saveScreenshot(client, screenshotPath);
    evidence.push({ theme, initial, selected, screenshotPath });
  }
  return evidence;
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
