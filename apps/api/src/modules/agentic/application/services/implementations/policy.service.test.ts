// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { PolicyRecord, RevocationRecord } from "../../repositories/interfaces/agentic.repository";
import { PolicyService } from "./policy.service";

const session = {} as DatabaseSession;
const transactions: TransactionRunner = {
  run: (work) => work(session),
  runReadOnly: (work) => work(session),
};
const request = {
  revisionId: "revision-1", policyVersion: 7, actorType: "agent",
  agentKind: "catalog" as const, department: "commerce", resource: "catalog.products",
  action: "read", purpose: "inventory-planning", dataClassification: "internal",
};
const rule = (id: string, effect: PolicyRecord["effect"], overrides: Partial<PolicyRecord> = {}): PolicyRecord => ({
  id, revisionId: "revision-1", ruleOrder: 1, effect, actorType: "agent",
  agentKind: "catalog", department: "commerce", resource: "catalog.products",
  action: "read", purpose: "inventory-planning", dataClassification: "internal",
  reasonCode: `${effect.toLowerCase()}-rule`, ...overrides,
});

describe("PolicyService", () => {
  it("applies current emergency revocation before all configured rules", async () => {
    const service = createService([rule("allow", "ALLOW")], {
      id: "revocation", targetType: "agent", targetId: "catalog", reason: "Emergency",
      activatedBy: "admin", activatedAt: "2026-08-14T00:00:00.000Z", idempotencyKey: "r1",
    });
    await expect(service.evaluate(request)).resolves.toMatchObject({
      effect: "DENY", reasonCode: "EMERGENCY_REVOCATION", matchedRuleIds: [], policyVersion: 7,
    });
  });

  it("matches every request dimension exactly and defaults to deny", async () => {
    const mismatches: Partial<PolicyRecord>[] = [
      { actorType: "staff" }, { agentKind: "inventory" }, { department: "finance" },
      { resource: "orders" }, { action: "write" }, { purpose: "support" },
      { dataClassification: "confidential" },
    ];
    for (const mismatch of mismatches) {
      await expect(createService([rule("mismatch", "ALLOW", mismatch)]).evaluate(request))
        .resolves.toMatchObject({ effect: "DENY", reasonCode: "NO_MATCH" });
    }
  });

  it("uses deny then approval then allow precedence independent of row order", async () => {
    const rules = [rule("z-allow", "ALLOW"), rule("b-approval", "REQUIRE_APPROVAL"), rule("a-deny", "DENY")];
    const decision = await createService(rules.reverse()).evaluate(request);
    expect(decision).toMatchObject({
      effect: "DENY", reasonCode: "deny-rule", matchedRuleIds: ["a-deny", "b-approval", "z-allow"],
      policyVersion: 7, evaluatedAt: "2026-08-14T12:00:00.000Z",
    });
    await expect(createService(rules.filter(({ effect }) => effect !== "DENY")).evaluate(request))
      .resolves.toMatchObject({ effect: "REQUIRE_APPROVAL" });
    await expect(createService(rules.filter(({ effect }) => effect === "ALLOW")).evaluate(request))
      .resolves.toMatchObject({ effect: "ALLOW" });
  });
});

function createService(rules: readonly PolicyRecord[], revocation?: RevocationRecord): PolicyService {
  return new PolicyService({
    listPolicies: async () => rules,
    findActiveRevocation: async () => revocation,
  }, transactions, () => "2026-08-14T12:00:00.000Z");
}
