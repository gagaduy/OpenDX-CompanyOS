// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  PaymentDetailDto,
  PaymentListDto,
  PaymentListQuery,
  PaymentStaffContext,
  ReconcilePaymentRequest,
} from "../../dtos/payment-admin.dto";

export interface PaymentReconciliationServiceContract {
  list(query: PaymentListQuery, context: PaymentStaffContext): Promise<PaymentListDto>;
  get(paymentId: string, context: PaymentStaffContext): Promise<PaymentDetailDto>;
  reconcile(
    paymentId: string,
    request: ReconcilePaymentRequest,
    context: PaymentStaffContext,
  ): Promise<PaymentDetailDto>;
  reconcileDue(limit: number): Promise<number>;
}
