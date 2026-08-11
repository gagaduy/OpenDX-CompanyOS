<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Intermediate Header Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the Storefront's four-link desktop navigation behind its existing hamburger between `769px` and `1199px` so `Khám phá` never overlaps the search field.

**Architecture:** Add one intermediate-only CSS media query to the existing Storefront shell styles and reuse the shell's current `menuOpen` state and accessible hamburger. Extend the real Chrome browser check with a focused header-layout contract at intermediate and wide widths; no React, routing, search, theme, or page-layout behavior changes.

**Tech Stack:** React 19, React Router, TypeScript, CSS media queries, Vitest, Vite, Chrome DevTools Protocol, Docker Compose

## Global Constraints

- Work only on branch `phuong`; do not merge or push without explicit approval.
- Keep the wide desktop header unchanged at widths greater than or equal to `1200px`.
- Apply the new header-only behavior from `769px` through `1199px`, inclusive.
- Keep the current mobile behavior at widths less than or equal to `768px`.
- Keep brand, hamburger, search, theme, account, and cart controls visible at intermediate widths.
- Keep the search behavior, navigation destinations, theme behavior, copy, discovery taskbar, and page layouts unchanged.
- Reuse the existing `.main-nav`, `.main-nav.open`, and `.mobile-menu`; do not add JavaScript breakpoint state or duplicate navigation markup.
- Add no dependency, directory, design token, API, or architecture layer.
- Update `CHANGELOG.md` under `[Unreleased]` in the same implementation unit.

---

### Task 1: Add the intermediate hamburger breakpoint

**Files:**
- Modify: `scripts/dev/storefront-browser-check.mjs`
- Modify: `apps/storefront/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`
- Modify after verification: `docs/superpowers/specs/2026-08-11-storefront-intermediate-header-navigation-design.md`

**Interfaces:**
- Consumes: the existing `.topbar-inner`, `.main-nav`, `.main-nav.open`, `.topbar-actions`, `.mobile-menu`, and `.header-search` DOM/CSS contracts.
- Produces: `verifyIntermediateHeader(client, outputDirectory)` browser evidence and a header-only `769px–1199px` media query.

- [ ] **Step 1: Add the failing real-browser header contract**

In `main`, immediately after `await verifyIntroHomepage(client);`, call the new
contract and include its result in the final JSON output:

```js
const intermediateHeader = await verifyIntermediateHeader(
  client,
  outputDirectory,
);
```

```js
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
```

Add this function before `verifyIntroHomepage`:

```js
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
      `document.readyState === "complete"
        && document.querySelector(".topbar-inner") !== null`,
      `Header did not settle at ${viewport.width}px`,
    );

    for (const theme of ["dark", "light"]) {
      await setTheme(client, theme);
      const closed = await evaluate(
        client,
        `(() => {
          const visible = (element) => {
            if (!(element instanceof HTMLElement)) return false;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none"
              && style.visibility !== "hidden"
              && rect.width > 0
              && rect.height > 0;
          };
          const menu = document.querySelector(".mobile-menu");
          const nav = document.querySelector(".main-nav");
          const search = document.querySelector(".header-search");
          const navRect = nav?.getBoundingClientRect();
          const searchRect = search?.getBoundingClientRect();
          const navVisible = visible(nav);
          const searchVisible = visible(search);
          return {
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: innerWidth,
            menuVisible: visible(menu),
            navVisible,
            searchVisible,
            overlap: navVisible && searchVisible
              ? navRect.right > searchRect.left && navRect.left < searchRect.right
              : false,
          };
        })()`,
      );
      const collapsed = viewport.mode === "collapsed";
      if (
        closed.documentWidth > closed.viewportWidth ||
        !closed.searchVisible ||
        closed.menuVisible !== collapsed ||
        closed.navVisible === collapsed ||
        closed.overlap
      ) {
        throw new Error(
          `Header layout failed at ${viewport.width}px ${theme}: ${JSON.stringify(closed)}`,
        );
      }

      const closedPath = join(
        outputDirectory,
        `header-${viewport.width}-${theme}-closed.png`,
      );
      await saveScreenshot(client, closedPath);
      let open = null;
      let openPath = null;
      if (collapsed) {
        await client.send("Runtime.evaluate", {
          expression: `document.querySelector('[aria-label="Mở menu"]')?.click()`,
        });
        await waitForCondition(
          client,
          `document.querySelector(".main-nav.open") !== null
            && document.querySelector('[aria-label="Đóng menu"]') !== null`,
          `Header menu did not open at ${viewport.width}px`,
        );
        open = await evaluate(
          client,
          `(() => {
            const nav = document.querySelector(".main-nav.open");
            const rect = nav?.getBoundingClientRect();
            return {
              linkCount: nav?.querySelectorAll("a").length ?? 0,
              top: rect?.top ?? null,
              display: nav ? getComputedStyle(nav).display : null,
            };
          })()`,
        );
        if (open.linkCount !== 4 || open.display !== "flex" || open.top !== 76) {
          throw new Error(
            `Header menu geometry failed at ${viewport.width}px: ${JSON.stringify(open)}`,
          );
        }
        openPath = join(
          outputDirectory,
          `header-${viewport.width}-${theme}-open.png`,
        );
        await saveScreenshot(client, openPath);
        await client.send("Runtime.evaluate", {
          expression: `document.querySelector('[aria-label="Đóng menu"]')?.click()`,
        });
        await waitForCondition(
          client,
          `document.querySelector(".main-nav.open") === null
            && document.querySelector('[aria-label="Mở menu"]') !== null`,
          `Header menu did not close at ${viewport.width}px`,
        );
      }
      evidence.push({
        ...viewport,
        theme,
        closed,
        closedPath,
        open,
        openPath,
      });
    }
  }
  return evidence;
}
```

- [ ] **Step 2: Run the browser contract and verify RED**

Run:

```bash
pnpm check:storefront-browser
```

Expected: FAIL at `800px` because `.mobile-menu` is hidden and `.main-nav` is
visible before the intermediate media query exists. The failure must include
the measured header state; a Chrome startup, API, or page-loading failure is not
a valid RED result.

- [ ] **Step 3: Add the minimum intermediate-only CSS**

Insert this query immediately before the existing `@media (max-width: 768px)`
block in `apps/storefront/src/shared/styles/globals.css`:

```css
@media (min-width: 769px) and (max-width: 1199px) {
  .topbar-inner {
    grid-template-columns: 1fr auto;
    gap: 12px;
    padding: 0 clamp(20px, 3vw, 32px);
  }

  .main-nav {
    position: absolute;
    top: 76px;
    right: 0;
    left: 0;
    height: auto;
    padding: 20px clamp(20px, 3vw, 32px);
    display: none;
    align-items: start;
    flex-direction: column;
    gap: 18px;
    border-bottom: 1px solid var(--hairline);
    background: var(--surface-2);
  }

  .main-nav.open {
    display: flex;
  }

  .main-nav a::after {
    display: none;
  }

  .mobile-menu {
    display: inline-flex;
  }
}
```

Do not change the existing wide or `max-width: 768px` rules.

- [ ] **Step 4: Update the changelog**

Under `[Unreleased]` in `CHANGELOG.md`, extend the existing Storefront shell
entry with this exact behavior: intermediate-width headers collapse navigation
behind the existing hamburger so navigation labels cannot overlap product
search.

- [ ] **Step 5: Rebuild and verify GREEN in the real browser**

Run:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml up --build -d --wait storefront
pnpm check:storefront-browser
```

Expected: browser check exits 0. Inspect these captures:

```text
/tmp/opendx-storefront-browser/header-800-dark-closed.png
/tmp/opendx-storefront-browser/header-800-dark-open.png
/tmp/opendx-storefront-browser/header-1024-light-closed.png
/tmp/opendx-storefront-browser/header-1024-light-open.png
/tmp/opendx-storefront-browser/header-1100-dark-closed.png
/tmp/opendx-storefront-browser/header-1200-light-closed.png
```

Acceptance: `800`, `1024`, and `1100px` show a non-overlapping search field and
hamburger; their open captures show exactly four vertical links below the
`76px` header. At `1200px`, the four links are inline, the hamburger is hidden,
and search remains separate. Dark and light surfaces retain their existing
tokens.

- [ ] **Step 6: Run Storefront and repository verification**

Run:

```bash
pnpm --filter @opendx/storefront test
pnpm --filter @opendx/storefront typecheck
pnpm --filter @opendx/storefront build
node --check scripts/dev/storefront-browser-check.mjs
git diff --check
pnpm audit:repo
pnpm check
```

Expected: all Storefront and repository tests pass, both builds exit 0, browser
script syntax exits 0, diff check is clean, and repository audit passes.

- [ ] **Step 7: Mark the spec implemented and commit**

Change the spec status to `Implemented`, inspect the full diff against the
approved scope, then:

```bash
git add CHANGELOG.md apps/storefront/src/shared/styles/globals.css scripts/dev/storefront-browser-check.mjs docs/superpowers/specs/2026-08-11-storefront-intermediate-header-navigation-design.md
git commit -m "fix(storefront): prevent intermediate header overlap"
git status --short --branch
```

Expected: one atomic implementation commit and a clean `phuong` worktree. Keep
the healthy Storefront running at `http://localhost:3100` for user testing.
