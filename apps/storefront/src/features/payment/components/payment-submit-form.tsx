// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { LockKeyhole } from "lucide-react";
import type { PaymentSubmission } from "../types/payment.types";

const pendingCheckoutKey = "novacommerce.pending-checkout";

export function PaymentSubmitForm({
  checkoutId,
  payment,
}: {
  readonly checkoutId: string;
  readonly payment: PaymentSubmission;
}) {
  return (
    <form
      action={payment.actionUrl}
      method={payment.method}
      onSubmit={() => localStorage.setItem(pendingCheckoutKey, checkoutId)}
    >
      {payment.fields.map((field, index) => (
        <input
          key={`${field.name}-${index}`}
          type="hidden"
          name={field.name}
          value={field.value}
        />
      ))}
      <button className="button primary full-width" type="submit">
        <LockKeyhole aria-hidden="true" />
        Thanh toán qua SePay
      </button>
    </form>
  );
}

export function pendingCheckoutId(): string | undefined {
  return localStorage.getItem(pendingCheckoutKey) ?? undefined;
}

export function clearPendingCheckout(): void {
  localStorage.removeItem(pendingCheckoutKey);
}
