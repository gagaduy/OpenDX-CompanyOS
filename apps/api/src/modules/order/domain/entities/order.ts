// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type OrderStatus = "pending_payment" | "paid" | "processing" | "ready_for_fulfillment" | "completed" | "canceled" | "expired";
export type OrderActorType = "customer" | "staff" | "system" | "provider";

export interface OrderAddressSnapshot {
  readonly addressId: string;
  readonly recipientName: string;
  readonly phoneNumber: string;
  readonly addressLine: string;
  readonly ward: string;
  readonly provinceOrCity: string;
  readonly postalCode?: string;
  readonly deliveryNote?: string;
  readonly version: number;
}

export interface OrderContactSnapshot {
  readonly email: string;
  readonly fullName?: string;
  readonly phoneNumber?: string;
}

export interface Order {
  readonly id: string;
  readonly publicNumber: string;
  readonly customerId: string;
  readonly checkoutId: string;
  readonly addressSnapshot: OrderAddressSnapshot;
  readonly contactSnapshot: OrderContactSnapshot;
  readonly promotionCode?: string;
  readonly subtotalVnd: number;
  readonly discountVnd: number;
  readonly totalVnd: number;
  readonly currency: "VND";
  readonly taxMode: "included_not_separated";
  readonly status: OrderStatus;
  readonly reservationExpiresAt: string;
  readonly paidAt?: string;
  readonly completedAt?: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
