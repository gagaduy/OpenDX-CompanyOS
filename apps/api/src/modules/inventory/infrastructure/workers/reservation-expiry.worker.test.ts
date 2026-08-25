// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryReservationPort } from "../../application/services/interfaces/inventory-reservations";
import { ReservationExpiryWorker } from "./reservation-expiry.worker";

describe("ReservationExpiryWorker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs bounded expiry batches and stops cleanly", async () => {
    const reservations: InventoryReservationPort = {
      reserve: vi.fn(),
      release: vi.fn(),
      consume: vi.fn(),
      expireDue: vi.fn(async () => 2),
    };
    const onError = vi.fn();
    const worker = new ReservationExpiryWorker(
      reservations,
      {
        actorType: "system",
        actorId: "system:reservation-expiry",
        correlationId: "reservation-expiry-worker",
      },
      30_000,
      onError,
    );

    worker.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reservations.expireDue).toHaveBeenCalledOnce();
    expect(reservations.expireDue).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ actorId: "system:reservation-expiry" }),
    );

    worker.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reservations.expireDue).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });
});
