// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";
import type { addressSchema, profileSchema } from "../schemas/customer-account.schema";
export type CustomerProfile = z.infer<typeof profileSchema>;
export type CustomerAddress = z.infer<typeof addressSchema>;
export interface AddressInput { readonly recipientName: string; readonly phoneNumber: string; readonly addressLine: string; readonly ward: string; readonly provinceOrCity: string; readonly postalCode?: string; readonly deliveryNote?: string }
