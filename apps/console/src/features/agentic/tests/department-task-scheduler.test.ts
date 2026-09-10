/**
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import {
  analyzeTaskRequirements,
  checkLockConflicts,
  canAcquireLocks,
  acquireLocks,
  releaseLocks,
  getNextEligibleTask,
} from "../utils/department-task-scheduler";
import type {
  DepartmentQueueMap,
  ResourceLock,
} from "../types/department-task-queue.types";

describe("Department Task Scheduler & Resource Lock Matrix", () => {
  it("accurately analyzes required digital employees based on task prompt and department", () => {
    // Campaign task requiring cross-dept visual design
    const merchandisingReqs = analyzeTaskRequirements(
      "merchandising",
      "Chiến dịch Tết Trung Thu giảm 20%",
    );
    expect(merchandisingReqs).toContain("catalog_copywriter");
    expect(merchandisingReqs).toContain("pricing_strategist");
    expect(merchandisingReqs).toContain("marketing_visual");

    // Operations restock task
    const opsReqs = analyzeTaskRequirements(
      "operations",
      "Kiểm toán tồn kho và lập phiếu đề xuất bổ sung hàng",
    );
    expect(opsReqs).toContain("inventory_specialist");
    expect(opsReqs).toContain("order_coordinator");
    expect(opsReqs).not.toContain("marketing_visual");

    // Operations clearance handoff task requiring cross-dept resources
    const opsClearanceReqs = analyzeTaskRequirements(
      "operations",
      "Đề xuất xả hàng tồn kho cho các sản phẩm đọng",
    );
    expect(opsClearanceReqs).toContain("inventory_specialist");
    expect(opsClearanceReqs).toContain("pricing_strategist");
    expect(opsClearanceReqs).toContain("marketing_visual");

    // Marketing publication task
    const mktReqs = analyzeTaskRequirements(
      "marketing",
      "Soạn bài viết và thiết kế ảnh đăng fanpage",
    );
    expect(mktReqs).toContain("marketing_copywriter");
    expect(mktReqs).toContain("marketing_visual");
    expect(mktReqs).toContain("marketing_publisher");

    // Support task
    const supportReqs = analyzeTaskRequirements(
      "support",
      "Xử lý khiếu nại khách hàng và cấp bù voucher VIP",
    );
    expect(supportReqs).toContain("support_steward");
    expect(supportReqs).toContain("crm_specialist");
  });

  it("detects lock conflicts when a shared resource is actively held", () => {
    const activeLocks: Record<string, ResourceLock> = {
      marketing_visual: {
        agentId: "marketing_visual",
        lockedByTaskId: "task-mkt-1",
        lockedByDepartment: "marketing",
        lockedAt: Date.now(),
        taskPromptSnippet: "Thiết kế poster Fanpage",
      },
    };

    // Task requiring marketing_visual should detect conflict
    const conflicts = checkLockConflicts(["catalog_copywriter", "marketing_visual"], activeLocks);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].agentId).toBe("marketing_visual");
    expect(conflicts[0].lockedByDepartment).toBe("marketing");

    expect(canAcquireLocks(["catalog_copywriter", "marketing_visual"], activeLocks)).toBe(false);

    // Task NOT requiring marketing_visual should acquire cleanly
    expect(canAcquireLocks(["inventory_specialist", "order_coordinator"], activeLocks)).toBe(true);
  });

  it("acquires and releases locks accurately", () => {
    let locks: Record<string, ResourceLock> = {};

    locks = acquireLocks(
      "task-1",
      "merchandising",
      ["catalog_copywriter", "pricing_strategist"],
      "Chiến dịch sale",
      locks,
    );
    expect(locks.catalog_copywriter).toBeDefined();
    expect(locks.pricing_strategist).toBeDefined();
    expect(locks.catalog_copywriter.lockedByTaskId).toBe("task-1");

    // Releasing one lock
    locks = releaseLocks(["catalog_copywriter"], locks);
    expect(locks.catalog_copywriter).toBeUndefined();
    expect(locks.pricing_strategist).toBeDefined();

    // Releasing remaining lock
    locks = releaseLocks(["pricing_strategist"], locks);
    expect(Object.keys(locks)).toHaveLength(0);
  });

  it("selects next eligible task in FIFO order when locks are released", () => {
    const queueMap: DepartmentQueueMap = {
      marketing: [],
      merchandising: [
        {
          id: "task-merch-waiting",
          department: "merchandising",
          prompt: "Chiến dịch Thu",
          requiredAgents: ["catalog_copywriter", "marketing_visual"],
          status: "queued",
          queuedAt: 1000,
        },
      ],
      operations: [],
      support: [],
    };

    const lockedByMarketing: Record<string, ResourceLock> = {
      marketing_visual: {
        agentId: "marketing_visual",
        lockedByTaskId: "task-mkt-active",
        lockedByDepartment: "marketing",
        lockedAt: 500,
        taskPromptSnippet: "Đang vẽ ảnh",
      },
    };

    // When marketing_visual is locked, no task is eligible
    const candidateWhileLocked = getNextEligibleTask(queueMap, lockedByMarketing);
    expect(candidateWhileLocked).toBeNull();

    // When marketing_visual is released
    const emptyLocks: Record<string, ResourceLock> = {};
    const candidateAfterRelease = getNextEligibleTask(queueMap, emptyLocks);
    expect(candidateAfterRelease).not.toBeNull();
    expect(candidateAfterRelease?.task.id).toBe("task-merch-waiting");
    expect(candidateAfterRelease?.dept).toBe("merchandising");
  });
});
