// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { CustomerRepository } from "../../repositories/interfaces/customer.repository";
import { CustomerApplicationError } from "../customer-application.error";
import type { CheckoutCustomerReader, CheckoutCustomerSnapshot } from "../interfaces/checkout-customer-reader";

export class CheckoutCustomerReaderService implements CheckoutCustomerReader {
  constructor(private readonly repository: CustomerRepository) {}

  async readOwnedAddress(session: DatabaseSession, customerId: string, addressId: string): Promise<CheckoutCustomerSnapshot> {
    const customer = await this.repository.findCustomerById(session, customerId, true);
    if (customer === undefined || customer.status !== "active") {
      throw new CustomerApplicationError("CUSTOMER_NOT_ACTIVE", "Active customer not found");
    }
    const address = await this.repository.findAddress(session, customerId, addressId, true);
    if (address === undefined) {
      throw new CustomerApplicationError("ADDRESS_NOT_FOUND", "Address not found");
    }
    return {
      customerId,
      contact: {
        email: customer.email,
        ...(customer.fullName === undefined ? {} : { fullName: customer.fullName }),
        ...(customer.phoneNumber === undefined ? {} : { phoneNumber: customer.phoneNumber }),
      },
      address: {
        addressId: address.id,
        recipientName: address.recipientName,
        phoneNumber: address.phoneNumber,
        addressLine: address.addressLine,
        ward: address.ward,
        provinceOrCity: address.provinceOrCity,
        ...(address.postalCode === undefined ? {} : { postalCode: address.postalCode }),
        ...(address.deliveryNote === undefined ? {} : { deliveryNote: address.deliveryNote }),
        version: address.version,
      },
    };
  }
}
