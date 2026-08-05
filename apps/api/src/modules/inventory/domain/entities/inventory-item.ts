// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface InventoryItem {
  readonly id: string;
  readonly variantId: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
