// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import type { PaymentOperationsApi } from "../api/payment-operations-api";
import type { PaymentDetailView, PaymentPageView, PaymentQuery } from "../types/payment.types";

export function usePayments(api: PaymentOperationsApi, query: PaymentQuery) {
  const [data, setData] = useState<PaymentPageView>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(undefined);

    api
      .list(query, controller.signal)
      .then((payments) => {
        if (active) setData(payments);
      })
      .catch((reason: unknown) => {
        if (active && !(reason instanceof DOMException && reason.name === "AbortError")) {
          setError("Payments could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [api, query, version]);

  return { data, error, loading, reload };
}

export function usePayment(api: PaymentOperationsApi, paymentId: string | undefined) {
  const [data, setData] = useState<PaymentDetailView>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    if (!paymentId) {
      setError("Payment identifier is missing.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(undefined);

    api
      .get(paymentId, controller.signal)
      .then((payment) => {
        if (active) setData(payment);
      })
      .catch((reason: unknown) => {
        if (active && !(reason instanceof DOMException && reason.name === "AbortError")) {
          setError("Payment detail could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [api, paymentId, version]);

  return { data, error, loading, reload, replace: setData };
}
