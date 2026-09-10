// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";
import type {
  wishlistEnvelopeSchema,
  wishlistMutationEnvelopeSchema,
} from "../schemas/wishlist.schema";

type WishlistEnvelope = z.infer<typeof wishlistEnvelopeSchema>;
export type WishlistMutation = z.infer<
  typeof wishlistMutationEnvelopeSchema
>["data"];
export interface WishlistPage {
  readonly items: WishlistEnvelope["data"];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}
