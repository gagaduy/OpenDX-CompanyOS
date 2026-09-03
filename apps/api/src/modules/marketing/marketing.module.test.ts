// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import type { StaffTokenVerifier } from "../../shared/auth/staff-auth.middleware";
import type { MarketingPublicationConfiguration } from "../../shared/config/environment";
import type { MarketingPublicMediaStoragePort } from "./application/ports/marketing-public-media-storage.port";
import { createMarketingModule } from "./marketing.module";

const database = {} as Pool;
const staffTokenVerifier: StaffTokenVerifier = {
  async verify() {
    return {};
  },
};

function publicationConfig(
  instagram: MarketingPublicationConfiguration["instagram"],
): MarketingPublicationConfiguration {
  return {
    pollIntervalMs: 1_000,
    targetLeaseSeconds: 60,
    meta: {
      graphBaseUrl: "https://graph.facebook.com/v20.0",
      requestTimeoutMs: 30_000,
    },
    facebook: {},
    instagram,
  };
}

describe("createMarketingModule public media composition", () => {
  const publicMediaStorage: MarketingPublicMediaStoragePort = {
    async readVariant() {
      return null;
    },
    async writeVariant() {},
  };

  it("fails closed when live Instagram has no public media storage", () => {
    expect(() => createMarketingModule({
      database,
      staffTokenVerifier,
      publicationConfig: publicationConfig({
        mode: "live",
        accountConfigurationId: "ig-live",
        businessAccountId: "17841400000000000",
        accessToken: "page-access-token",
        publicMediaBaseUrl: "https://stable-tunnel.trycloudflare.com/v1/public/marketing/media",
        signingSecret: "s".repeat(32),
        urlTtlSeconds: 900,
        jpegQuality: 90,
        rateLimit: 120,
        rateWindowMs: 60_000,
        containerPollIntervalMs: 5_000,
        containerMaxPollAttempts: 60,
      }),
    })).toThrow("Live Instagram publication requires Marketing public media storage");
  });

  it("does not expose a public media router in simulation mode", () => {
    const module = createMarketingModule({
      database,
      staffTokenVerifier,
      publicationConfig: publicationConfig({
        mode: "simulation",
        accountConfigurationId: "ig-simulation",
      }),
    });

    expect(module.publicRouter).toBeUndefined();
  });

  it("composes the public router and live Instagram adapter from the same live configuration", () => {
    const module = createMarketingModule({
      database,
      staffTokenVerifier,
      publicMediaStorage,
      publicationConfig: publicationConfig({
        mode: "live",
        accountConfigurationId: "ig-live",
        businessAccountId: "17841400000000000",
        accessToken: "page-access-token",
        publicMediaBaseUrl: "https://stable-tunnel.trycloudflare.com/v1/public/marketing/media",
        signingSecret: "s".repeat(32),
        urlTtlSeconds: 900,
        jpegQuality: 90,
        rateLimit: 120,
        rateWindowMs: 60_000,
        containerPollIntervalMs: 5_000,
        containerMaxPollAttempts: 60,
      }),
    });

    expect(module.publicRouter).toBeDefined();
    expect(module.publisherRegistry.resolve("instagram", "live")).toMatchObject({
      platform: "instagram",
      executionMode: "live",
    });
  });
});
