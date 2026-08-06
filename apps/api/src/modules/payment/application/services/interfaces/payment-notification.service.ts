// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
export interface PaymentNotificationResult { readonly result: "applied" | "already_processed" | "review_required"; }
export interface PaymentNotificationServiceContract { process(payload: unknown, correlationId: string): Promise<PaymentNotificationResult>; }
