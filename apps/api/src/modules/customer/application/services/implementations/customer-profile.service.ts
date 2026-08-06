// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { CustomerRepository } from "../../repositories/interfaces/customer.repository";
import type {
  AddressInput,
  CustomerProfileServiceContract,
} from "../interfaces/customer-profile.service";
import { CustomerApplicationError } from "../customer-application.error";
import { toProfile } from "../../dtos/customer.dto";
import {
  validateAddress,
  validateCustomerProfile,
} from "../../../domain/services/customer-rules";
export class CustomerProfileService implements CustomerProfileServiceContract {
  constructor(
    private readonly repo: CustomerRepository,
    private readonly tx: TransactionRunner,
    private readonly id: () => string,
    private readonly now: () => string,
  ) {}
  async get(cid: string) {
    return this.tx.runReadOnly(async (s) => {
      const c = await this.repo.findCustomerById(s, cid);
      if (c === undefined)
        throw new CustomerApplicationError(
          "CUSTOMER_SESSION_EXPIRED",
          "Customer not found",
        );
      return toProfile(c);
    });
  }
  async update(
    cid: string,
    input: { fullName?: string; phoneNumber?: string; version: number },
  ) {
    validateCustomerProfile(input.fullName, input.phoneNumber);
    return this.tx.run(async (s) => {
      const c = await this.repo.findCustomerById(s, cid);
      if (c === undefined)
        throw new CustomerApplicationError(
          "CUSTOMER_SESSION_EXPIRED",
          "Customer not found",
        );
      const next = {
        ...c,
        ...(input.fullName === undefined
          ? {}
          : { fullName: input.fullName.trim() }),
        ...(input.phoneNumber === undefined
          ? {}
          : { phoneNumber: input.phoneNumber.trim() }),
        version: c.version + 1,
        updatedAt: this.now(),
      };
      if (
        c.version !== input.version ||
        !(await this.repo.updateCustomer(s, next, input.version))
      )
        throw new CustomerApplicationError("STALE_VERSION", "Customer changed");
      return toProfile(next);
    });
  }
  listAddresses(cid: string) {
    return this.tx.runReadOnly((s) => this.repo.listAddresses(s, cid));
  }
  async createAddress(cid: string, input: AddressInput) {
    const at = this.now();
    return this.tx.run(async (s) => {
      const current = await this.repo.listAddresses(s, cid);
      const a = validateAddress({
        id: this.id(),
        customerId: cid,
        ...input,
        isDefault: current.length === 0,
        version: 1,
        createdAt: at,
        updatedAt: at,
      });
      await this.repo.createAddress(s, a);
      return a;
    });
  }
  async updateAddress(
    cid: string,
    aid: string,
    input: AddressInput & { version: number },
  ) {
    return this.tx.run(async (s) => {
      const a = await this.repo.findAddress(s, cid, aid);
      if (a === undefined)
        throw new CustomerApplicationError(
          "ADDRESS_NOT_FOUND",
          "Address not found",
        );
      const next = validateAddress({
        ...a,
        ...input,
        version: a.version + 1,
        updatedAt: this.now(),
      });
      if (
        a.version !== input.version ||
        !(await this.repo.updateAddress(s, next, input.version))
      )
        throw new CustomerApplicationError("STALE_VERSION", "Address changed");
      return next;
    });
  }
  async deleteAddress(cid: string, aid: string) {
    await this.tx.run(async (s) => {
      const a = await this.repo.findAddress(s, cid, aid);
      if (a === undefined)
        throw new CustomerApplicationError(
          "ADDRESS_NOT_FOUND",
          "Address not found",
        );
      if (!(await this.repo.deleteAddress(s, cid, aid)))
        throw new CustomerApplicationError(
          "ADDRESS_NOT_FOUND",
          "Address not found",
        );
      if (a.isDefault) {
        const left = await this.repo.listAddresses(s, cid);
        if (left[0])
          await this.repo.setDefaultAddress(s, cid, left[0].id, this.now());
      }
    });
  }
  async setDefaultAddress(cid: string, aid: string) {
    await this.tx.run(async (s) => {
      if (!(await this.repo.setDefaultAddress(s, cid, aid, this.now())))
        throw new CustomerApplicationError(
          "ADDRESS_NOT_FOUND",
          "Address not found",
        );
    });
  }
}
