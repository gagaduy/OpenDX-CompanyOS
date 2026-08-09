// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckoutExpiryServiceContract } from "../../application/services/interfaces/checkout-expiry.service";
import { CheckoutExpiryWorker } from "./checkout-expiry.worker";

describe("CheckoutExpiryWorker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs bounded non-overlapping expiry batches and stops cleanly", async () => {
    let finish: (() => void) | undefined;
    const service: CheckoutExpiryServiceContract = {
      expireDue: vi.fn(
        () => new Promise<number>((resolve) => { finish = () => resolve(1); }),
      ),
    };
    const onError = vi.fn();
    const worker = new CheckoutExpiryWorker(service, 30_000, onError);
    worker.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(service.expireDue).toHaveBeenCalledTimes(1);
    expect(service.expireDue).toHaveBeenCalledWith(100);
    finish?.();
    await Promise.resolve();
    worker.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(service.expireDue).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
});
