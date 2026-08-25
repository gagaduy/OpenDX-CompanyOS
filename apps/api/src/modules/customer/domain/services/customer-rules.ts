// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CustomerAddress } from "../entities/customer-address";
import type { CustomerSession } from "../entities/customer-session";
import type { GuestSession } from "../entities/guest-session";
import { CustomerDomainError } from "../exceptions/customer-domain.error";

export const GUEST_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const CUSTOMER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

export function validateVerifiedIdentity(input: {
  readonly subject: string;
  readonly email: string;
  readonly emailVerified: boolean;
}): void {
  if (
    !input.emailVerified ||
    input.subject.trim().length === 0 ||
    !/^\S+@\S+\.\S+$/.test(input.email)
  ) {
    throw new CustomerDomainError(
      "GOOGLE_TOKEN_INVALID",
      "Verified identity is invalid",
    );
  }
}

export function validateCustomerProfile(
  fullName?: string,
  phoneNumber?: string,
): void {
  if (
    (fullName !== undefined &&
      (fullName.trim().length === 0 || fullName.length > 120)) ||
    (phoneNumber !== undefined &&
      (phoneNumber.trim().length === 0 || phoneNumber.length > 30))
  ) {
    throw new CustomerDomainError(
      "INVALID_CUSTOMER_PROFILE",
      "Customer profile is invalid",
    );
  }
}

export function sessionExpiresAt(now: string, ttlMs: number): string {
  const timestamp = Date.parse(now);
  if (
    !Number.isFinite(timestamp) ||
    ![GUEST_SESSION_TTL_MS, CUSTOMER_SESSION_TTL_MS].includes(ttlMs)
  ) {
    throw new CustomerDomainError(
      "INVALID_SESSION_EXPIRY",
      "Session expiry is invalid",
    );
  }
  return new Date(timestamp + ttlMs).toISOString();
}

export function assertCustomerSessionActive(
  session: CustomerSession,
  now: string,
): void {
  assertSessionActive(session.expiresAt, session.revokedAt, now);
}

export function assertGuestSessionActive(
  session: GuestSession,
  now: string,
): void {
  assertSessionActive(session.expiresAt, session.revokedAt, now);
}

export function rotateCustomerSession(
  session: CustomerSession,
  replacementTokenHash: string,
  now: string,
): CustomerSession {
  assertCustomerSessionActive(session, now);
  if (!/^[a-f0-9]{64}$/.test(replacementTokenHash)) {
    throw new CustomerDomainError(
      "INVALID_SESSION_TOKEN",
      "Session token hash is invalid",
    );
  }
  return {
    ...session,
    tokenHash: replacementTokenHash,
    rotatedAt: now,
    lastSeenAt: now,
  };
}

export function validateAddress(address: CustomerAddress): CustomerAddress {
  for (const [name, value, maximum] of [
    ["recipientName", address.recipientName, 120],
    ["phoneNumber", address.phoneNumber, 30],
    ["addressLine", address.addressLine, 300],
    ["ward", address.ward, 120],
    ["provinceOrCity", address.provinceOrCity, 120],
  ] as const) {
    if (value.trim().length === 0 || value.length > maximum) {
      throw new CustomerDomainError("INVALID_ADDRESS", `${name} is invalid`);
    }
  }
  if (
    (address.postalCode?.length ?? 0) > 20 ||
    (address.deliveryNote?.length ?? 0) > 500
  ) {
    throw new CustomerDomainError(
      "INVALID_ADDRESS",
      "Optional address data is invalid",
    );
  }
  return address;
}

export function setDefaultAddress(
  addresses: readonly CustomerAddress[],
  addressId: string,
  updatedAt: string,
): readonly CustomerAddress[] {
  if (!addresses.some(({ id }) => id === addressId)) {
    throw new CustomerDomainError("ADDRESS_NOT_FOUND", "Address not found");
  }
  return addresses.map((address) => ({
    ...address,
    isDefault: address.id === addressId,
    version:
      address.version +
      (address.isDefault !== (address.id === addressId) ? 1 : 0),
    updatedAt:
      address.isDefault !== (address.id === addressId)
        ? updatedAt
        : address.updatedAt,
  }));
}

function assertSessionActive(
  expiresAt: string,
  revokedAt: string | undefined,
  now: string,
): void {
  if (revokedAt !== undefined) {
    throw new CustomerDomainError("SESSION_REVOKED", "Session is revoked");
  }
  if (Date.parse(expiresAt) <= Date.parse(now)) {
    throw new CustomerDomainError("SESSION_EXPIRED", "Session is expired");
  }
}
