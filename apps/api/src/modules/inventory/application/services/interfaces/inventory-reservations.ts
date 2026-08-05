// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  InventoryReservationReferenceType,
  InventoryReservationStatus,
} from "../../../domain/entities/inventory-reservation";
import type { InventorySystemContext } from "../../dtos/inventory.dto";

export interface ReservationReference {
  readonly referenceType: InventoryReservationReferenceType;
  readonly referenceId: string;
}

export interface ReserveInventoryRequest extends ReservationReference {
  readonly lines: readonly {
    readonly variantId: string;
    readonly quantity: number;
  }[];
}

export interface ReservationLineDto {
  readonly reservationId: string;
  readonly variantId: string;
  readonly quantity: number;
  readonly status: InventoryReservationStatus;
}

export interface ReservationGroupDto extends ReservationReference {
  readonly status: InventoryReservationStatus;
  readonly expiresAt: string;
  readonly lines: readonly ReservationLineDto[];
}

export interface InventoryReservationPort {
  reserve(
    request: ReserveInventoryRequest,
    context: InventorySystemContext,
  ): Promise<ReservationGroupDto>;
  release(
    reference: ReservationReference,
    context: InventorySystemContext,
  ): Promise<ReservationGroupDto>;
  consume(
    reference: ReservationReference,
    context: InventorySystemContext,
  ): Promise<ReservationGroupDto>;
  expireDue(limit: number, context: InventorySystemContext): Promise<number>;
}
