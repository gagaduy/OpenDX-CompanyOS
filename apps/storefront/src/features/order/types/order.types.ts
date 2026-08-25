// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";
import type {
  orderDetailSchema,
  orderListEnvelopeSchema,
} from "../schemas/order.schema";

export type OrderDetail = z.infer<typeof orderDetailSchema>;
export type OrderList = z.infer<typeof orderListEnvelopeSchema>["data"];
