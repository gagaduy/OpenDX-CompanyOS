// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";

export interface InventoryHealthWindow {
  readonly start: string;
  readonly end: string;
  readonly timezone: "Asia/Ho_Chi_Minh";
  readonly limit?: number;
  readonly cursor?: string;
}

export type InventoryStockRiskCode =
  | "SOLD_OUT"
  | "LOW_STOCK"
  | "NO_SALES_VELOCITY"
  | "BELOW_14_DAY_COVER";

export interface InventoryStockRiskInput extends InventoryHealthWindow {
  readonly lowStockThreshold?: number;
}

export interface InventoryStockRiskResult {
  readonly summary: {
    readonly trackedVariants: number;
    readonly lowStockCount: number;
    readonly soldOutCount: number;
    readonly unitsOnHand: number;
    readonly unitsReserved: number;
    readonly unitsAvailable: number;
  };
  readonly evidence: readonly {
    readonly variantId: string;
    readonly onHand: number;
    readonly reserved: number;
    readonly available: number;
    readonly quantitySold: number;
    readonly dailyVelocityMilliunits: number;
    readonly daysCover: number | null;
    readonly riskCode: InventoryStockRiskCode;
  }[];
  readonly nextCursor?: string;
}

export interface InventorySlowStockInput extends InventoryHealthWindow {
  readonly minimumOnHand?: number;
}

export interface InventorySlowStockResult {
  readonly summary: {
    readonly candidateCount: number;
    readonly candidateUnits: number;
    readonly candidateValueVnd: number;
  };
  readonly evidence: readonly {
    readonly variantId: string;
    readonly available: number;
    readonly quantitySold: 0;
    readonly currentUnitPriceVnd: number;
    readonly stockValueVnd: number;
    readonly reasonCode: "NO_SALES_VELOCITY";
  }[];
  readonly nextCursor?: string;
}

export type InventoryReservationAnomalyReason =
  | "EXPIRED_ACTIVE"
  | "FINALIZED_TIMESTAMP_MISSING"
  | "STALE_PENDING";

export interface InventoryReservationAnomaly {
  readonly reservationId: string;
  readonly variantId: string;
  readonly quantity: number;
  readonly status: string;
  readonly expiresAt: string;
  readonly detectedAt: string;
  readonly reasonCode: InventoryReservationAnomalyReason;
}

export interface InventoryReservationAnomalyResult {
  readonly summary: {
    readonly expiredActiveCount: number;
    readonly finalizedWithoutTimestampCount: number;
    readonly stalePendingCount: number;
    readonly affectedUnits: number;
  };
  readonly evidence: readonly InventoryReservationAnomaly[];
  readonly nextCursor?: string;
}

export interface InventoryHealthReader {
  stockRisk(input: InventoryStockRiskInput): Promise<InventoryStockRiskResult>;
  slowStock(input: InventorySlowStockInput): Promise<InventorySlowStockResult>;
  reservationAnomalies(
    input: InventoryHealthWindow,
  ): Promise<InventoryReservationAnomalyResult>;
}

export interface InventoryCurrentStockFact {
  readonly variantId: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly available: number;
}

export interface InventoryReservationAnomalyQuery {
  readonly start: string;
  readonly end: string;
  readonly asOf: string;
  readonly limit: number;
  readonly after?: {
    readonly detectedAt: string;
    readonly reservationId: string;
  };
}

export interface InventoryHealthRepository {
  readCurrentStock(
    session: DatabaseSession,
    minimumAvailable?: number,
  ): Promise<readonly InventoryCurrentStockFact[]>;
  readReservationAnomalies(
    session: DatabaseSession,
    query: InventoryReservationAnomalyQuery,
  ): Promise<Omit<InventoryReservationAnomalyResult, "nextCursor">>;
}
