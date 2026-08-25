// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";

export interface CheckoutCustomerSnapshot {
  readonly customerId: string;
  readonly contact: {
    readonly email: string;
    readonly fullName?: string;
    readonly phoneNumber?: string;
  };
  readonly address: {
    readonly addressId: string;
    readonly recipientName: string;
    readonly phoneNumber: string;
    readonly addressLine: string;
    readonly ward: string;
    readonly provinceOrCity: string;
    readonly postalCode?: string;
    readonly deliveryNote?: string;
    readonly version: number;
  };
}

export interface CheckoutCustomerReader {
  readOwnedAddress(session: DatabaseSession, customerId: string, addressId: string): Promise<CheckoutCustomerSnapshot>;
}
