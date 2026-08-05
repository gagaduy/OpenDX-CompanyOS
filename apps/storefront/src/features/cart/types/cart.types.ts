// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";
import type { cartLineSchema, cartSchema } from "../schemas/cart.schema";
export type StorefrontCart = z.infer<typeof cartSchema>;
export type StorefrontCartLine = z.infer<typeof cartLineSchema>;
