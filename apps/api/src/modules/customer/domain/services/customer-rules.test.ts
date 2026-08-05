// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { CustomerAddress } from "../entities/customer-address";
import type { CustomerSession } from "../entities/customer-session";
import { CUSTOMER_SESSION_TTL_MS, GUEST_SESSION_TTL_MS, assertCustomerSessionActive, rotateCustomerSession, sessionExpiresAt, setDefaultAddress, validateAddress, validateCustomerProfile, validateVerifiedIdentity } from "./customer-rules";

const NOW = "2026-08-05T00:00:00.000Z";
const session: CustomerSession = { id: "s", customerId: "c", tokenHash: "a".repeat(64), expiresAt: "2026-09-04T00:00:00.000Z", lastSeenAt: NOW, createdAt: NOW };
const address = (id: string, isDefault = false): CustomerAddress => ({ id, customerId: "c", recipientName: "Duy", phoneNumber: "0900000000", addressLine: "1 Nguyen Hue", ward: "Ben Nghe", provinceOrCity: "Ho Chi Minh City", isDefault, version: 1, createdAt: NOW, updatedAt: NOW });

describe("customer rules", () => {
  it("requires a verified provider identity and bounded profile", () => {
    validateVerifiedIdentity({ subject: "google-subject", email: "duy@example.com", emailVerified: true });
    expect(() => validateVerifiedIdentity({ subject: "google-subject", email: "duy@example.com", emailVerified: false })).toThrowError(expect.objectContaining({ code: "GOOGLE_TOKEN_INVALID" }));
    validateCustomerProfile("Duy", "0900000000");
    expect(() => validateCustomerProfile("x".repeat(121))).toThrowError(expect.objectContaining({ code: "INVALID_CUSTOMER_PROFILE" }));
  });
  it("fixes guest and customer absolute expiry", () => {
    expect(sessionExpiresAt(NOW, GUEST_SESSION_TTL_MS)).toBe("2026-08-12T00:00:00.000Z");
    expect(sessionExpiresAt(NOW, CUSTOMER_SESSION_TTL_MS)).toBe("2026-09-04T00:00:00.000Z");
    expect(() => sessionExpiresAt(NOW, 1)).toThrowError(expect.objectContaining({ code: "INVALID_SESSION_EXPIRY" }));
  });
  it("rejects expired and revoked sessions and rotates without extending expiry", () => {
    assertCustomerSessionActive(session, NOW);
    expect(rotateCustomerSession(session, "b".repeat(64), "2026-08-06T00:00:00.000Z")).toMatchObject({ tokenHash: "b".repeat(64), expiresAt: session.expiresAt });
    expect(() => assertCustomerSessionActive({ ...session, revokedAt: NOW }, NOW)).toThrowError(expect.objectContaining({ code: "SESSION_REVOKED" }));
    expect(() => assertCustomerSessionActive(session, session.expiresAt)).toThrowError(expect.objectContaining({ code: "SESSION_EXPIRED" }));
  });
  it("validates addresses and keeps one default", () => {
    expect(validateAddress(address("a"))).toEqual(address("a"));
    expect(() => validateAddress({ ...address("a"), recipientName: "" })).toThrowError(expect.objectContaining({ code: "INVALID_ADDRESS" }));
    expect(setDefaultAddress([address("a", true), address("b")], "b", NOW).filter(({ isDefault }) => isDefault).map(({ id }) => id)).toEqual(["b"]);
  });
});
