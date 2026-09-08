// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  publicMediaBaseUrl,
  selectLatestQuickTunnelOrigin,
  updateEnvironmentValue,
  waitForTunnelReady,
} from "./sync-instagram-quick-tunnel.mjs";

test("selects the newest quick tunnel origin after a tunnel restart", () => {
  const logs = `
2026-09-08T05:42:47Z INF https://old-name.trycloudflare.com
2026-09-08T12:11:48Z INF https://current-name.trycloudflare.com
`;

  assert.equal(
    selectLatestQuickTunnelOrigin(logs),
    "https://current-name.trycloudflare.com",
  );
});

test("updates only the public media URL and preserves local secrets", () => {
  const source = [
    "INSTAGRAM_PUBLICATION_MODE=live",
    "INSTAGRAM_PUBLIC_MEDIA_BASE_URL=https://old-name.trycloudflare.com/v1/public/marketing/media",
    "INSTAGRAM_ACCESS_TOKEN=keep-this-token",
    "MARKETING_PUBLIC_MEDIA_SIGNING_SECRET=keep-this-secret",
    "",
  ].join("\n");

  const updated = updateEnvironmentValue(
    source,
    "INSTAGRAM_PUBLIC_MEDIA_BASE_URL",
    publicMediaBaseUrl("https://current-name.trycloudflare.com"),
  );

  assert.equal(updated.changed, true);
  assert.match(
    updated.contents,
    /^INSTAGRAM_PUBLIC_MEDIA_BASE_URL=https:\/\/current-name\.trycloudflare\.com\/v1\/public\/marketing\/media$/m,
  );
  assert.match(updated.contents, /^INSTAGRAM_ACCESS_TOKEN=keep-this-token$/m);
  assert.match(updated.contents, /^MARKETING_PUBLIC_MEDIA_SIGNING_SECRET=keep-this-secret$/m);
  assert.doesNotMatch(updated.contents, /old-name/);
});

test("rejects logs without a valid trycloudflare origin", () => {
  assert.throws(
    () => selectLatestQuickTunnelOrigin("tunnel connection failed"),
    /quick tunnel URL/i,
  );
});

test("waits for a newly assigned tunnel hostname to become reachable", async () => {
  let attempts = 0;
  await waitForTunnelReady("https://current-name.trycloudflare.com", {
    attempts: 3,
    delayMs: 0,
    fetcher: async () => new Response(null, { status: ++attempts === 1 ? 503 : 200 }),
    sleeper: async () => {},
  });

  assert.equal(attempts, 2);
});
