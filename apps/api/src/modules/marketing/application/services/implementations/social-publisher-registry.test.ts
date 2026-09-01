// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { SocialPublisherPort } from "../../ports/social-publisher.port";
import { SocialPublisherRegistry } from "./social-publisher-registry";

describe("SocialPublisherRegistry", () => {
  const fakeFbLive: SocialPublisherPort = {
    platform: "facebook",
    executionMode: "live",
    publish: async () => { throw new Error("not implemented"); },
    reconcile: async () => ({ exists: true }),
  };

  const fakeIgSim: SocialPublisherPort = {
    platform: "instagram",
    executionMode: "simulation",
    publish: async () => { throw new Error("not implemented"); },
    reconcile: async () => ({ exists: true }),
  };

  it("registers and resolves adapters by platform and executionMode", () => {
    const registry = new SocialPublisherRegistry();
    registry.register(fakeFbLive).register(fakeIgSim);

    expect(registry.has("facebook", "live")).toBe(true);
    expect(registry.has("instagram", "simulation")).toBe(true);
    expect(registry.has("instagram", "live")).toBe(false);

    expect(registry.resolve("facebook", "live")).toBe(fakeFbLive);
    expect(registry.resolve("instagram", "simulation")).toBe(fakeIgSim);
  });

  it("throws when resolving unregistered adapter", () => {
    const registry = new SocialPublisherRegistry();
    expect(() => registry.resolve("instagram", "live")).toThrow(
      "No social publisher registered for platform 'instagram' and mode 'live'.",
    );
  });
});
