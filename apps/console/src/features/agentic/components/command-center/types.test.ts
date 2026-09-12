// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import type {
  CommandCenterHeaderProps,
  CommandComposerProps,
  DepartmentCardProps,
  LiveActivityFeedProps,
  PendingApprovalsProps,
  ResultsMetricsProps,
} from "./types";

describe("command-center types", () => {
  it("exports valid type definitions for all command center subcomponents", () => {
    const dummyHeader: Partial<CommandCenterHeaderProps> = { activeFilter: "all" };
    const dummyComposer: Partial<CommandComposerProps> = { isAnalyzing: false };
    const dummyDept: Partial<DepartmentCardProps> = { department: "marketing" };
    const dummyLive: Partial<LiveActivityFeedProps> = { events: [] };
    const dummyApprovals: Partial<PendingApprovalsProps> = { approvals: [] };
    const dummyResults: Partial<ResultsMetricsProps> = { totalCompleted: 28 };

    expect(dummyHeader).toBeDefined();
    expect(dummyComposer).toBeDefined();
    expect(dummyDept).toBeDefined();
    expect(dummyLive).toBeDefined();
    expect(dummyApprovals).toBeDefined();
    expect(dummyResults).toBeDefined();
  });
});
