// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";
import type { paymentStatusSchema } from "../schemas/payment.schema";

export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export interface PaymentSubmission {
  readonly actionUrl: string;
  readonly method: "POST";
  readonly fields: readonly {
    readonly name: string;
    readonly value: string;
  }[];
}
