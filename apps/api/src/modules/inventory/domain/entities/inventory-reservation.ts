// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type InventoryReservationReferenceType = "checkout" | "order";
export type InventoryReservationStatus =
  | "active"
  | "released"
  | "expired"
  | "consumed";
export type InventoryReservationTerminalStatus = Exclude<
  InventoryReservationStatus,
  "active"
>;

export interface InventoryReservation {
  readonly id: string;
  readonly referenceType: InventoryReservationReferenceType;
  readonly referenceId: string;
  readonly variantId: string;
  readonly quantity: number;
  readonly status: InventoryReservationStatus;
  readonly expiresAt: string;
  readonly finalizedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
