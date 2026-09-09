<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Operations & Inventory Workforce Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Operations & Inventory department in the Agentic Workforce Command Center with an interactive amber-themed replenishment modal, inline editable quantities, real-time dynamic budgeting, amber pulsing animations, and an optional cross-department clearance sale flow.

**Architecture:** Clean Architecture across `apps/api/src/modules/inventory` and `apps/console/src/features/inventory` / `apps/console/src/features/agentic`. Domain and calculation rules reside in `AiOperationsService`; interactive presentation in a dedicated `OperationsProposalModal`; state coordination and cross-department handoffs managed by `AgenticCommandCenter`.

**Tech Stack:** TypeScript, React 19, Lucide Icons, Express, PostgreSQL, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-09-operations-inventory-workforce-upgrade-design.md`

## Global Constraints

- Physical goods in one internal inventory location (Single-store, B2C, VND-only). No multi-warehouse, external shipping, or 3PL integrations.
- Backend PostgreSQL transactions are authoritative for `inventory_items` (`on_hand`, `version`) and `stock_movements` (`PO_APPROVAL`).
- Human-in-the-loop: Digital employees only propose; human approval is required before updating stock balances.
- Follow the Linear Product Canvas guidelines: dark/light theme compatibility, amber accent (`#fbbf24`), dense operational tables.

---

### Task 1: Refine Restock Calculation Logic & Unit Test in `AiOperationsService`

**Files:**
- Modify: `apps/api/src/modules/inventory/application/services/implementations/ai-operations.service.ts`
- Test: `apps/api/src/modules/inventory/tests/ai-operations.service.test.ts`

**Interfaces:**
- Consumes: `GenerateOperationsProposalRequestDto`, `ApplyOperationsRequestDto` from `../../dtos/ai-operations-response.dto`
- Produces: Updated `AiOperationsService.generateOperationsProposal` and `AiOperationsService.applyOperationsProposal`

- [ ] **Step 1: Write unit test for `AiOperationsService`**

```typescript
import { describe, expect, it, vi } from "vitest";
import { AiOperationsService } from "../application/services/implementations/ai-operations.service";

describe("AiOperationsService", () => {
  it("calculates restock quantities correctly by stock status", async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            variantId: "v1",
            productId: "p1",
            productName: "Critical Product",
            productSlug: "critical-product",
            sku: "SKU-CRITICAL",
            categoryName: "Linh kiện",
            onHand: 3,
            reserved: 1,
            priceMinor: 1000000,
          },
          {
            variantId: "v2",
            productId: "p2",
            productName: "Slow Moving Product",
            productSlug: "slow-product",
            sku: "SKU-SLOW",
            categoryName: "Phụ kiện",
            onHand: 30,
            reserved: 0,
            priceMinor: 500000,
          },
        ],
      }),
      connect: vi.fn(),
    } as any;

    const service = new AiOperationsService(mockDb, () => "2026-09-09T00:00:00.000Z", () => "test-id");
    const proposal = await service.generateOperationsProposal({ prompt: "Rà soát kho hàng" });

    expect(proposal.items).toHaveLength(2);
    const critical = proposal.items.find((it) => it.sku === "SKU-CRITICAL");
    expect(critical?.stockStatus).toBe("critical_low");
    expect(critical?.recommendedRestockQuantity).toBeGreaterThan(0);

    const slow = proposal.items.find((it) => it.sku === "SKU-SLOW");
    expect(slow?.stockStatus).toBe("slow_moving");
    expect(slow?.recommendedRestockQuantity).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (or lacks test file)**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/inventory/tests/ai-operations.service.test.ts`
Expected: FAIL or missing file.

- [ ] **Step 3: Refine `generateOperationsProposal` in `ai-operations.service.ts`**

Ensure that:
- `available = Math.max(0, row.onHand - row.reserved)`.
- Default threshold is 10.
- For `critical_low` (when `available <= 5` or `available < threshold`): `restockQty = explicitRestockQty ?? Math.max(10, threshold * 2 - available)`.
- For `slow_moving` or `balanced`: `restockQty = explicitRestockQty ?? 0`.
- Update `estimatedTotalCostVnd = restockQty * unitCost`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/inventory/tests/ai-operations.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add apps/api/src/modules/inventory/application/services/implementations/ai-operations.service.ts apps/api/src/modules/inventory/tests/ai-operations.service.test.ts
git commit -m "feat(inventory): refine restock calculation logic by stock risk classification"
```

---

### Task 2: Create `OperationsProposalModal` Component & Tests

**Files:**
- Create: `apps/console/src/features/inventory/components/operations-proposal-modal.tsx`
- Test: `apps/console/src/features/inventory/tests/operations-proposal-modal.test.tsx`

**Interfaces:**
- Consumes: `OperationsProposalDto`, `OperationsProposalItemDto` from `../../inventory/types/inventory.types` (or console schemas)
- Produces: `OperationsProposalModal` React component

- [ ] **Step 1: Write component unit test for `OperationsProposalModal`**

Create `apps/console/src/features/inventory/tests/operations-proposal-modal.test.tsx` testing:
- Rendering proposal title, summary boxes, and table rows.
- Filter tabs (`Tất cả`, `Cạn kiệt`, `Tồn đọng`, `An toàn`).
- Inline quantity modification updating total units and budget dynamically.
- Calling `onApply` with adjusted quantities.
- Calling `onTriggerClearanceCampaign` when clearance button is clicked.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/console exec vitest run src/features/inventory/tests/operations-proposal-modal.test.tsx`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `OperationsProposalModal`**

Create `apps/console/src/features/inventory/components/operations-proposal-modal.tsx` with:
- State `filter`: `'all' | 'critical_low' | 'slow_moving' | 'balanced'`.
- State `quantities`: `Record<string, number>` initialized with `item.recommendedRestockQuantity`.
- State `appliedSuccess`: boolean and applied items data.
- Quick action buttons: "⚡ Nhập theo mức an toàn" and "🔄 Đặt tất cả về 0".
- Number input with step buttons (`-` and `+`) for each item.
- Real-time recalculation of row cost and footer total units / total budget.
- Amber-themed Linear Product Canvas markup.
- Optional clearance button when any item has `stockStatus === 'slow_moving'`.
- Post-approval success screen with download report button.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/console exec vitest run src/features/inventory/tests/operations-proposal-modal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add apps/console/src/features/inventory/components/operations-proposal-modal.tsx apps/console/src/features/inventory/tests/operations-proposal-modal.test.tsx
git commit -m "feat(console): implement interactive OperationsProposalModal with inline restock editing"
```

---

### Task 3: Add Amber Pulsing Animations & Modal CSS Styles

**Files:**
- Modify: `apps/console/src/features/agentic/styles/agentic-command-center.css`

**Interfaces:**
- Produces: `.ccAgentPulseAmber`, `.ccDotBlink`, `.ccOperationsModal*`, and light/dark theme variables for amber operational components.

- [ ] **Step 1: Add amber animations and modal styles**

Add keyframes:
```css
@keyframes ccAgentPulseAmber {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.4), 0 0 15px rgba(251, 191, 36, 0.2);
    border-color: rgba(251, 191, 36, 0.8);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(251, 191, 36, 0.08), 0 0 25px rgba(251, 191, 36, 0.4);
    border-color: #fbbf24;
  }
}
```
Add modal container, overlay, filter pill buttons, table input spinners, and callout box styles with proper light mode overrides.

- [ ] **Step 2: Verify CSS formatting and validity**

Run: `pnpm check:fast`
Expected: PASS.

- [ ] **Step 3: Commit changes**

```bash
git add apps/console/src/features/agentic/styles/agentic-command-center.css
git commit -m "style(console): add amber pulsing animations and operations modal theme styles"
```

---

### Task 4: Integrate `OperationsProposalModal` & Clearance Cross-Department Flow in `AgenticCommandCenter`

**Files:**
- Modify: `apps/console/src/features/agentic/components/agentic-command-center.tsx`

**Interfaces:**
- Consumes: `OperationsProposalModal` from `../../inventory/components/operations-proposal-modal`
- Produces: Integrated operations flow, cross-department clearance collaboration with Catalog & Marketing

- [ ] **Step 1: Wire modal state and clearance handler in `agentic-command-center.tsx`**

1. Import `OperationsProposalModal`.
2. Add state `isOperationsModalOpen: boolean`.
3. In `handleDirectGoal` for `intent === "operations"`:
   - Run Kỹ sư Tồn kho scan with amber pulse.
   - Run Điều phối Đơn hàng proposal generation.
   - Set `operationsProposal` and open `isOperationsModalOpen = true`.
4. Implement `handleTriggerClearanceCampaign`:
   - Close operations modal.
   - Collect `slow_moving` items from the proposal.
   - Set `ceoPlan` to Clearance Flash Sale steps:
     - Kỹ sư Tồn kho: Bàn giao danh sách hàng tồn đọng.
     - Chuyên gia Định giá: Đề xuất mức giảm giá thanh lý (20% - 35%).
     - Thiết kế Đồ họa: Thiết kế Poster "CLEARANCE SALE".
   - Trigger `catalogApi.generateCampaignProposal` (or clearance campaign flow) and open `CampaignProposalModal`.
5. Update agent cards for "Kỹ sư Tồn kho" and "Điều phối Đơn hàng":
   - Add amber pulsing class when active.
   - Show blinking status dot and proper progress state.

- [ ] **Step 2: Run Console tests**

Run: `pnpm --filter @opendx/console test`
Expected: PASS.

- [ ] **Step 3: Commit changes**

```bash
git add apps/console/src/features/agentic/components/agentic-command-center.tsx
git commit -m "feat(console): integrate OperationsProposalModal and clearance cross-department collaboration"
```

---

### Task 5: End-to-End Verification & Repo Audit

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run fast iteration checks**

Run: `pnpm check:fast`
Expected: 0 errors across all workspaces.

- [ ] **Step 2: Run full repository audit**

Run: `bash scripts/audit/repo.sh`
Expected: 100% compliant with SPDX headers, clean git diff, and no unapproved dependencies.

- [ ] **Step 3: Update `CHANGELOG.md` under `[Unreleased]`**

Document the Operations & Inventory workforce upgrade, interactive replenishment modal, dynamic budgeting, and clearance sale collaboration.

- [ ] **Step 4: Commit changelog**

```bash
git add CHANGELOG.md
git commit -m "docs: update changelog for operations inventory workforce upgrade"
```
