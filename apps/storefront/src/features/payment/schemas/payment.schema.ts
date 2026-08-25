// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

export const paymentStatusSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  status: z.enum(["order_created", "completed", "expired", "canceled"]),
});

export const paymentStatusEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: paymentStatusSchema,
});
