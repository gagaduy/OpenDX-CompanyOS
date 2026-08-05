// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface CustomerAddress {
  readonly id: string;
  readonly customerId: string;
  readonly recipientName: string;
  readonly phoneNumber: string;
  readonly addressLine: string;
  readonly ward: string;
  readonly provinceOrCity: string;
  readonly postalCode?: string;
  readonly deliveryNote?: string;
  readonly isDefault: boolean;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
