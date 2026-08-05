// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";
import type { productsEnvelopeSchema } from "../schemas/storefront-catalog.schema";
import type { ProductPage } from "../types/catalog.types";

export function mapProductPage(
  envelope: z.infer<typeof productsEnvelopeSchema>,
): ProductPage {
  return { items: envelope.data, ...envelope.meta };
}
