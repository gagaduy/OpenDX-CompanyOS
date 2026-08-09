// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import type { PaymentApi } from "../api/payment-api";
import type { PaymentStatus } from "../types/payment.types";

const maximumPollAttempts = 10;

export function usePaymentStatus(
  api: PaymentApi,
  checkoutId: string | undefined,
) {
  const [checkout, setCheckout] = useState<PaymentStatus>();
  const [error, setError] = useState<string>();
  const [polling, setPolling] = useState(checkoutId !== undefined);

  useEffect(() => {
    if (checkoutId === undefined) {
      setPolling(false);
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const poll = async () => {
      try {
        const current = await api.getCheckoutStatus(checkoutId);
        if (!active) return;
        attempts += 1;
        setCheckout(current);
        setError(undefined);
        if (
          current.status !== "order_created" ||
          attempts >= maximumPollAttempts
        ) {
          setPolling(false);
          return;
        }
        timer = setTimeout(
          poll,
          Math.min(1_500 * 2 ** (attempts - 1), 10_000),
        );
      } catch {
        if (!active) return;
        setError("Không thể kiểm tra trạng thái thanh toán lúc này.");
        setPolling(false);
      }
    };
    void poll();
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [api, checkoutId]);

  return { checkout, error, polling };
}
