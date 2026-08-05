// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type CartOwner =
  | { readonly kind: "guest"; readonly guestSessionId: string; readonly expiresAt: string }
  | { readonly kind: "customer"; readonly customerId: string; readonly expiresAt: string };

export interface CartLineDto {
  readonly id: string;
  readonly variantId: string;
  readonly productId?: string;
  readonly productName: string;
  readonly productSlug?: string;
  readonly variantTitle: string;
  readonly sku?: string;
  readonly optionValues: Readonly<Record<string, string>>;
  readonly primaryMediaUrl?: string;
  readonly primaryMediaAltText: string;
  readonly quantity: number;
  readonly unitPriceVnd: number;
  readonly subtotalVnd: number;
  readonly availableQuantity: number;
  readonly purchasable: boolean;
  readonly change: "unchanged" | "price_changed" | "unavailable";
}

export interface CartDto {
  readonly id?: string;
  readonly ownerKind: "anonymous" | "guest" | "customer";
  readonly version: number;
  readonly status: "empty" | "active" | "checkout_ready";
  readonly items: readonly CartLineDto[];
  readonly itemCount: number;
  readonly totalVnd: number;
  readonly requiresAction: boolean;
}
