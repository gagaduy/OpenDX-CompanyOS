// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { CustomerAddress } from "../../../domain/entities/customer-address";
import type { CustomerSession } from "../../../domain/entities/customer-session";
import type { Customer } from "../../../domain/entities/customer";
import type { GuestSession } from "../../../domain/entities/guest-session";

export interface ExternalIdentityRecord {
  readonly id: string;
  readonly customerId: string;
  readonly provider: "google";
  readonly providerSubject: string;
  readonly providerEmail: string;
}

export interface CustomerOperationsSearchQuery {
  readonly search?: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface CustomerWishlistPageQuery {
  readonly page: number;
  readonly pageSize: number;
}

export interface CustomerWishlistPage {
  readonly productIds: readonly string[];
  readonly totalItems: number;
}

export interface CustomerRepository {
  lockIdentityRegistration(
    session: DatabaseSession,
    provider: "google",
    subject: string,
    email: string,
  ): Promise<void>;
  findCustomerById(
    session: DatabaseSession,
    id: string,
    lock?: boolean,
  ): Promise<Customer | undefined>;
  findCustomerByEmail(
    session: DatabaseSession,
    email: string,
  ): Promise<Customer | undefined>;
  findCustomersByIds(
    session: DatabaseSession,
    ids: readonly string[],
  ): Promise<readonly Customer[]>;
  searchOperations(
    session: DatabaseSession,
    query: CustomerOperationsSearchQuery,
  ): Promise<{ readonly items: readonly Customer[]; readonly totalItems: number }>;
  findIdentity(
    session: DatabaseSession,
    provider: "google",
    subject: string,
  ): Promise<ExternalIdentityRecord | undefined>;
  createCustomer(session: DatabaseSession, customer: Customer): Promise<void>;
  createIdentity(
    session: DatabaseSession,
    identity: ExternalIdentityRecord,
    now: string,
  ): Promise<void>;
  touchIdentity(
    session: DatabaseSession,
    identityId: string,
    email: string,
    now: string,
  ): Promise<void>;
  createCustomerSession(
    session: DatabaseSession,
    customerSession: CustomerSession,
  ): Promise<void>;
  findCustomerSessionByHash(
    session: DatabaseSession,
    hash: string,
    lock?: boolean,
  ): Promise<CustomerSession | undefined>;
  replaceCustomerSession(
    session: DatabaseSession,
    customerSession: CustomerSession,
  ): Promise<void>;
  revokeCustomerSession(
    session: DatabaseSession,
    id: string,
    now: string,
  ): Promise<void>;
  createGuestSession(
    session: DatabaseSession,
    guestSession: GuestSession,
  ): Promise<void>;
  findGuestSessionByHash(
    session: DatabaseSession,
    hash: string,
  ): Promise<GuestSession | undefined>;
  updateCustomer(
    session: DatabaseSession,
    customer: Customer,
    expectedVersion: number,
  ): Promise<boolean>;
  listAddresses(
    session: DatabaseSession,
    customerId: string,
  ): Promise<readonly CustomerAddress[]>;
  findAddress(
    session: DatabaseSession,
    customerId: string,
    addressId: string,
    lock?: boolean,
  ): Promise<CustomerAddress | undefined>;
  createAddress(
    session: DatabaseSession,
    address: CustomerAddress,
  ): Promise<void>;
  updateAddress(
    session: DatabaseSession,
    address: CustomerAddress,
    expectedVersion: number,
  ): Promise<boolean>;
  deleteAddress(
    session: DatabaseSession,
    customerId: string,
    addressId: string,
  ): Promise<boolean>;
  setDefaultAddress(
    session: DatabaseSession,
    customerId: string,
    addressId: string,
    now: string,
  ): Promise<boolean>;
  listWishlist(
    session: DatabaseSession,
    customerId: string,
    query: CustomerWishlistPageQuery,
  ): Promise<CustomerWishlistPage>;
  addWishlistItem(
    session: DatabaseSession,
    customerId: string,
    productId: string,
    createdAt: string,
  ): Promise<void>;
  removeWishlistItem(
    session: DatabaseSession,
    customerId: string,
    productId: string,
  ): Promise<void>;
}
