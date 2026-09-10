// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketingPublisherWorker } from "./marketing-publisher.worker";
import type { MarketingPublisherService } from "../../application/services/interfaces/marketing-publisher.service";
import type { PublicationRecord } from "../../domain/entities/marketing-campaign";

describe("MarketingPublisherWorker", () => {
  let mockPublisherService: MarketingPublisherService;
  let worker: MarketingPublisherWorker;

  const fixedNow = "2026-08-29T10:00:00.000Z";

  beforeEach(() => {
    const mockRecord: PublicationRecord = {
      id: "record-1",
      packageId: "package-1",
      targetId: "target-1",
      platform: "facebook",
      pageId: "100200",
      externalPostId: "100200_998877",
      postUrl: "https://www.facebook.com/100200/posts/998877",
      executionMode: "live",
      simulated: false,
      packageDigest: "p".repeat(64),
      contentDigest: "c".repeat(64),
      imageDigest: "d".repeat(64),
      targetDigest: "t".repeat(64),
      verifiedAt: fixedNow,
      providerReceiptDigest: "r".repeat(64),
      createdAt: fixedNow,
    };

    mockPublisherService = {
      publishTarget: vi.fn().mockResolvedValue(mockRecord),
      publishDueTargets: vi.fn().mockResolvedValue([mockRecord]),
      publishApprovedPackage: vi.fn().mockResolvedValue(mockRecord),
    };

    worker = new MarketingPublisherWorker({
      publisherService: mockPublisherService,
      workerId: "test-worker-1",
      batchSize: 5,
      pollIntervalMs: 1000,
    });
  });

  it("processes due targets on runOnce", async () => {
    const processed = await worker.runOnce();
    expect(processed).toBe(1);
    expect(mockPublisherService.publishDueTargets).toHaveBeenCalledWith({
      workerId: "test-worker-1",
      limit: 5,
    });
  });

  it("can start and stop cleanly", () => {
    worker.start();
    worker.stop();
  });
});
