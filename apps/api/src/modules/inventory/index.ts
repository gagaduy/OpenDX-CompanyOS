// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export {
  createInventoryHealthReader,
  createInventoryModule,
  type InventoryHealthDependencies,
  type InventoryModuleDependencies,
} from "./inventory.module";
export type { InventoryAvailabilityReader } from "./application/services/interfaces/inventory-availability";
export type { InventoryReservationPort } from "./application/services/interfaces/inventory-reservations";
export type { InventoryCheckoutPort } from "./application/services/interfaces/inventory-reservations";
export type {
  InventoryHealthReader,
  InventoryHealthWindow,
  InventoryReservationAnomaly,
  InventoryReservationAnomalyReason,
  InventoryReservationAnomalyResult,
  InventorySlowStockInput,
  InventorySlowStockResult,
  InventoryStockRiskCode,
  InventoryStockRiskInput,
  InventoryStockRiskResult,
} from "./application/services/interfaces/inventory-health-reader";
