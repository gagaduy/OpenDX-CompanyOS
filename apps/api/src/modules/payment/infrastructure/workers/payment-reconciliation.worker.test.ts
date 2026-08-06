// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentReconciliationServiceContract } from "../../application/services/interfaces/payment-reconciliation.service";
import { PaymentReconciliationWorker } from "./payment-reconciliation.worker";

describe("PaymentReconciliationWorker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs a bounded batch and reports provider failures", async () => {
    const providerError = new Error("provider unavailable");
    const service: PaymentReconciliationServiceContract = {
      list: vi.fn(), get: vi.fn(), reconcile: vi.fn(),
      reconcileDue: vi.fn(async () => { throw providerError; }),
    };
    const onError = vi.fn();
    const worker = new PaymentReconciliationWorker(service, 60_000, onError);
    worker.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(service.reconcileDue).toHaveBeenCalledWith(25);
    expect(onError).toHaveBeenCalledWith(providerError);
    worker.stop();
  });
});
