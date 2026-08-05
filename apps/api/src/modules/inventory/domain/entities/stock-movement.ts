// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type StockMovementType =
  | "receive"
  | "adjustment"
  | "reservation"
  | "release"
  | "expiry"
  | "consume";

export interface StockMovement {
  readonly id: string;
  readonly inventoryItemId: string;
  readonly reservationId?: string;
  readonly movementType: StockMovementType;
  readonly onHandDelta: number;
  readonly reservedDelta: number;
  readonly reasonCode: string;
  readonly reasonNote?: string;
  readonly actorType: "staff" | "system";
  readonly actorId: string;
  readonly correlationId: string;
  readonly idempotencyKey?: string;
  readonly occurredAt: string;
}
