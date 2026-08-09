// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { CustomerRepository } from "../../repositories/interfaces/customer.repository";
import { CheckoutCustomerReaderService } from "./checkout-customer-reader";

const session: DatabaseSession = { query: vi.fn() };

describe("CheckoutCustomerReaderService", () => {
  it("reads an active customer and owned address in the supplied session", async () => {
    const repository = {
      findCustomerById: vi.fn(async () => ({
        id: "customer-1", email: "buyer@example.com",
        emailVerifiedAt: "2026-08-01T00:00:00.000Z", fullName: "Nova Buyer",
        phoneNumber: "0901234567", status: "active", version: 1,
        createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
      })),
      findAddress: vi.fn(async () => ({
        id: "address-1", customerId: "customer-1", recipientName: "Nova Buyer",
        phoneNumber: "0901234567", addressLine: "1 Nguyen Hue", ward: "Ben Nghe",
        provinceOrCity: "Ho Chi Minh City", isDefault: true, version: 1,
        createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
      })),
    } as unknown as CustomerRepository;
    const reader = new CheckoutCustomerReaderService(repository);

    await expect(reader.readOwnedAddress(session, "customer-1", "address-1")).resolves.toMatchObject({
      customerId: "customer-1",
      contact: { email: "buyer@example.com", fullName: "Nova Buyer", phoneNumber: "0901234567" },
      address: { addressId: "address-1", recipientName: "Nova Buyer" },
    });
    expect(repository.findCustomerById).toHaveBeenCalledWith(session, "customer-1", true);
    expect(repository.findAddress).toHaveBeenCalledWith(session, "customer-1", "address-1", true);
  });
});
