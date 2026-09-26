// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { AutonomousReplenishmentMonitorService } from "../application/services/implementations/autonomous-replenishment-monitor.service";

describe("AutonomousReplenishmentMonitorService", () => {
  it("suppresses replenishment scans during 15-minute cooldown window", async () => {
    const mockAi = {
      generateReplenishmentAnalysis: vi.fn().mockResolvedValue({ id: "prop-1" }),
    };
    const mockRepo = {
      findLatestPending: vi.fn().mockResolvedValue(null),
    };

    let currentTime = 1000000;
    const monitor = new AutonomousReplenishmentMonitorService(
      mockAi as any,
      mockRepo as any,
      () => currentTime,
    );

    const first = await monitor.triggerScan("post_order_event", ["v-1"]);
    expect(first).toBeDefined();
    expect(mockAi.generateReplenishmentAnalysis).toHaveBeenCalledTimes(1);

    // Fast successive trigger within 15 minutes (900,000 ms)
    currentTime += 60000; // 1 minute later
    const second = await monitor.triggerScan("post_order_event", ["v-1"]);
    expect(second).toBeNull(); // Debounced
    expect(mockAi.generateReplenishmentAnalysis).toHaveBeenCalledTimes(1);
  });

  it("suppresses scan if a pending proposal was created within past 6 hours", async () => {
    const mockAi = {
      generateReplenishmentAnalysis: vi.fn(),
    };
    const mockRepo = {
      findLatestPending: vi.fn().mockResolvedValue({
        id: "existing-pending",
        createdAt: "2026-09-10T11:00:00.000Z",
      }),
    };

    const monitor = new AutonomousReplenishmentMonitorService(
      mockAi as any,
      mockRepo as any,
      () => new Date("2026-09-10T12:00:00.000Z").getTime(),
    );

    const result = await monitor.triggerScan("scheduled_cron");
    expect(result).toBeNull();
    expect(mockAi.generateReplenishmentAnalysis).not.toHaveBeenCalled();
  });
});
