// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import { AutonomousSocialTokenMonitorServiceImpl } from "../application/services/implementations/autonomous-social-token-monitor.service";

describe("AutonomousSocialTokenMonitorService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("executes heartbeat, performs health check, and attempts auto-renewal for expiring tokens", async () => {
    const mockManager = {
      seedFromEnvironmentIfEmpty: vi.fn().mockResolvedValue(undefined),
      performHealthCheck: vi.fn().mockResolvedValue({
        overallStatus: "warning",
        activeAlertCount: 1,
        accounts: [
          {
            platform: "facebook",
            accountId: "page-1",
            accountName: "Store Page",
            maskedToken: "EAAB...1234",
            tokenStatus: "expiring_soon",
            daysRemaining: 4,
            requiresAction: true,
            actionType: "auto_refresh",
          },
        ],
      }),
      getTokensSummary: vi.fn().mockResolvedValue({
        overallStatus: "warning",
        activeAlertCount: 1,
        accounts: [
          {
            platform: "facebook",
            accountId: "page-1",
            accountName: "Store Page",
            maskedToken: "EAAB...1234",
            tokenStatus: "expiring_soon",
            daysRemaining: 4,
            requiresAction: true,
            actionType: "auto_refresh",
          },
        ],
      }),
      autoRefreshAccount: vi.fn().mockResolvedValue({
        platform: "facebook",
        accountId: "page-1",
        accountName: "Store Page",
        tokenStatus: "healthy",
      }),
    };

    const service = new AutonomousSocialTokenMonitorServiceImpl({
      socialTokenManager: mockManager as any,
      intervalMs: 1000,
      autoRenewDaysThreshold: 7,
    });

    await service.executeHeartbeat();

    expect(mockManager.performHealthCheck).toHaveBeenCalledOnce();
    expect(mockManager.autoRefreshAccount).toHaveBeenCalledWith("facebook", "page-1");
  });

  it("starts and stops timer cleanly", async () => {
    vi.useFakeTimers();

    const mockManager = {
      seedFromEnvironmentIfEmpty: vi.fn().mockResolvedValue(undefined),
      performHealthCheck: vi.fn().mockResolvedValue({
        overallStatus: "healthy",
        activeAlertCount: 0,
        accounts: [],
      }),
      getTokensSummary: vi.fn().mockResolvedValue({
        overallStatus: "healthy",
        activeAlertCount: 0,
        accounts: [],
      }),
      autoRefreshAccount: vi.fn(),
    };

    const service = new AutonomousSocialTokenMonitorServiceImpl({
      socialTokenManager: mockManager as any,
      intervalMs: 5000,
    });

    service.start();
    expect(mockManager.seedFromEnvironmentIfEmpty).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(5500);
    expect(mockManager.performHealthCheck).toHaveBeenCalledOnce();

    service.stop();
    vi.advanceTimersByTime(10000);
    expect(mockManager.performHealthCheck).toHaveBeenCalledOnce(); // No more calls after stop
  });
});
