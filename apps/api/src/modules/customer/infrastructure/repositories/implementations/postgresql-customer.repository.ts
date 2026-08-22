// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type {
  CustomerRepository,
  CustomerOperationsSearchQuery,
  ExternalIdentityRecord,
} from "../../../application/repositories/interfaces/customer.repository";
import type { Customer } from "../../../domain/entities/customer";
import type { CustomerSession } from "../../../domain/entities/customer-session";
import type { GuestSession } from "../../../domain/entities/guest-session";
import type { CustomerAddress } from "../../../domain/entities/customer-address";
type Row = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const optional = (v: unknown) =>
  v === null || v === undefined ? undefined : String(v);
function customer(r: Row): Customer {
  return {
    id: String(r.id),
    email: String(r.email),
    emailVerifiedAt: iso(r.email_verified_at),
    ...(optional(r.full_name) === undefined
      ? {}
      : { fullName: optional(r.full_name)! }),
    ...(optional(r.phone_number) === undefined
      ? {}
      : { phoneNumber: optional(r.phone_number)! }),
    status: String(r.status) as Customer["status"],
    version: Number(r.version),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}
function customerSession(r: Row): CustomerSession {
  return {
    id: String(r.id),
    customerId: String(r.customer_id),
    tokenHash: String(r.token_hash),
    expiresAt: iso(r.expires_at),
    lastSeenAt: iso(r.last_seen_at),
    ...(optional(r.rotated_at) === undefined
      ? {}
      : { rotatedAt: iso(r.rotated_at) }),
    ...(optional(r.revoked_at) === undefined
      ? {}
      : { revokedAt: iso(r.revoked_at) }),
    createdAt: iso(r.created_at),
  };
}
function guestSession(r: Row): GuestSession {
  return {
    id: String(r.id),
    tokenHash: String(r.token_hash),
    expiresAt: iso(r.expires_at),
    lastSeenAt: iso(r.last_seen_at),
    ...(optional(r.revoked_at) === undefined
      ? {}
      : { revokedAt: iso(r.revoked_at) }),
    createdAt: iso(r.created_at),
  };
}
function address(r: Row): CustomerAddress {
  return {
    id: String(r.id),
    customerId: String(r.customer_id),
    recipientName: String(r.recipient_name),
    phoneNumber: String(r.phone_number),
    addressLine: String(r.address_line),
    ward: String(r.ward),
    provinceOrCity: String(r.province_or_city),
    ...(optional(r.postal_code) === undefined
      ? {}
      : { postalCode: optional(r.postal_code)! }),
    ...(optional(r.delivery_note) === undefined
      ? {}
      : { deliveryNote: optional(r.delivery_note)! }),
    isDefault: Boolean(r.is_default),
    version: Number(r.version),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}
export class PostgresqlCustomerRepository implements CustomerRepository {
  async lockIdentityRegistration(
    session: DatabaseSession,
    provider: "google",
    subject: string,
    email: string,
  ): Promise<void> {
    // Serialize both stable-subject registration and case-insensitive email conflict checks.
    await session.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`customer-identity:${provider}:${subject}`],
    );
    await session.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`customer-email:${email.trim().toLowerCase()}`],
    );
  }

  async findCustomerById(s: DatabaseSession, id: string, lock = false) {
    const r = await s.query<Row>(`SELECT * FROM customers WHERE id=$1${lock ? " FOR SHARE" : ""}`, [id]);
    return r.rows[0] === undefined ? undefined : customer(r.rows[0]);
  }
  async findCustomerByEmail(s: DatabaseSession, email: string) {
    const r = await s.query<Row>(
      "SELECT * FROM customers WHERE lower(email)=lower($1)",
      [email],
    );
    return r.rows[0] === undefined ? undefined : customer(r.rows[0]);
  }
  async findCustomersByIds(s: DatabaseSession, ids: readonly string[]) {
    const r = await s.query<Row>(
      `SELECT * FROM customers
       WHERE id = ANY($1::uuid[])
       ORDER BY array_position($1::uuid[], id)`,
      [ids],
    );
    return r.rows.map(customer);
  }
  async searchOperations(s: DatabaseSession, query: CustomerOperationsSearchQuery) {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (query.search !== undefined) {
      values.push(`%${query.search}%`);
      const parameter = `$${values.length}`;
      clauses.push(`(
        id::text ILIKE ${parameter}
        OR email ILIKE ${parameter}
        OR COALESCE(full_name, '') ILIKE ${parameter}
        OR COALESCE(phone_number, '') ILIKE ${parameter}
      )`);
    }
    const where = clauses.length === 0 ? "TRUE" : clauses.join(" AND ");
    const count = await s.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM customers WHERE ${where}`,
      values,
    );
    const rows = await s.query<Row>(
      `SELECT * FROM customers WHERE ${where} ORDER BY created_at DESC, id
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return {
      items: rows.rows.map(customer),
      totalItems: safeInteger(count.rows[0]?.total ?? "0", "customer total"),
    };
  }
  async findIdentity(
    s: DatabaseSession,
    provider: "google",
    subject: string,
  ): Promise<ExternalIdentityRecord | undefined> {
    const r = await s.query<Row>(
      "SELECT * FROM customer_external_identities WHERE provider=$1 AND provider_subject=$2",
      [provider, subject],
    );
    const x = r.rows[0];
    return x === undefined
      ? undefined
      : {
          id: String(x.id),
          customerId: String(x.customer_id),
          provider: "google",
          providerSubject: String(x.provider_subject),
          providerEmail: String(x.provider_email),
        };
  }
  async createCustomer(s: DatabaseSession, c: Customer) {
    await s.query(
      "INSERT INTO customers(id,email,email_verified_at,full_name,phone_number,status,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        c.id,
        c.email,
        c.emailVerifiedAt,
        c.fullName ?? null,
        c.phoneNumber ?? null,
        c.status,
        c.version,
        c.createdAt,
        c.updatedAt,
      ],
    );
  }
  async createIdentity(
    s: DatabaseSession,
    i: ExternalIdentityRecord,
    now: string,
  ) {
    await s.query(
      "INSERT INTO customer_external_identities(id,customer_id,provider,provider_subject,provider_email,last_authenticated_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$6,$6)",
      [i.id, i.customerId, i.provider, i.providerSubject, i.providerEmail, now],
    );
  }
  async touchIdentity(
    s: DatabaseSession,
    id: string,
    email: string,
    now: string,
  ) {
    await s.query(
      "UPDATE customer_external_identities SET provider_email=$2,last_authenticated_at=$3,updated_at=$3 WHERE id=$1",
      [id, email, now],
    );
  }
  async createCustomerSession(s: DatabaseSession, x: CustomerSession) {
    await s.query(
      "INSERT INTO customer_sessions(id,customer_id,token_hash,expires_at,last_seen_at,rotated_at,revoked_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        x.id,
        x.customerId,
        x.tokenHash,
        x.expiresAt,
        x.lastSeenAt,
        x.rotatedAt ?? null,
        x.revokedAt ?? null,
        x.createdAt,
      ],
    );
  }
  async findCustomerSessionByHash(
    s: DatabaseSession,
    hash: string,
    lock = false,
  ) {
    const r = await s.query<Row>(
      `SELECT * FROM customer_sessions WHERE token_hash=$1${lock ? " FOR UPDATE" : ""}`,
      [hash],
    );
    return r.rows[0] === undefined ? undefined : customerSession(r.rows[0]);
  }
  async replaceCustomerSession(s: DatabaseSession, x: CustomerSession) {
    await s.query(
      "UPDATE customer_sessions SET token_hash=$2,last_seen_at=$3,rotated_at=$4 WHERE id=$1",
      [x.id, x.tokenHash, x.lastSeenAt, x.rotatedAt ?? null],
    );
  }
  async revokeCustomerSession(s: DatabaseSession, id: string, now: string) {
    await s.query(
      "UPDATE customer_sessions SET revoked_at=COALESCE(revoked_at,$2) WHERE id=$1",
      [id, now],
    );
  }
  async createGuestSession(s: DatabaseSession, x: GuestSession) {
    await s.query(
      "INSERT INTO guest_sessions(id,token_hash,expires_at,last_seen_at,revoked_at,created_at) VALUES($1,$2,$3,$4,$5,$6)",
      [
        x.id,
        x.tokenHash,
        x.expiresAt,
        x.lastSeenAt,
        x.revokedAt ?? null,
        x.createdAt,
      ],
    );
  }
  async findGuestSessionByHash(s: DatabaseSession, hash: string) {
    const r = await s.query<Row>(
      "SELECT * FROM guest_sessions WHERE token_hash=$1",
      [hash],
    );
    return r.rows[0] === undefined ? undefined : guestSession(r.rows[0]);
  }
  async updateCustomer(s: DatabaseSession, c: Customer, v: number) {
    const r = await s.query(
      "UPDATE customers SET full_name=$2,phone_number=$3,version=$4,updated_at=$5 WHERE id=$1 AND version=$6",
      [
        c.id,
        c.fullName ?? null,
        c.phoneNumber ?? null,
        c.version,
        c.updatedAt,
        v,
      ],
    );
    return r.rowCount === 1;
  }
  async listAddresses(s: DatabaseSession, cid: string) {
    const r = await s.query<Row>(
      "SELECT * FROM customer_addresses WHERE customer_id=$1 ORDER BY is_default DESC,created_at",
      [cid],
    );
    return r.rows.map(address);
  }
  async findAddress(s: DatabaseSession, cid: string, id: string, lock = false) {
    const r = await s.query<Row>(
      `SELECT * FROM customer_addresses WHERE customer_id=$1 AND id=$2${lock ? " FOR SHARE" : ""}`,
      [cid, id],
    );
    return r.rows[0] === undefined ? undefined : address(r.rows[0]);
  }
  async createAddress(s: DatabaseSession, a: CustomerAddress) {
    await s.query(
      "INSERT INTO customer_addresses(id,customer_id,recipient_name,phone_number,address_line,ward,province_or_city,postal_code,delivery_note,is_default,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
      [
        a.id,
        a.customerId,
        a.recipientName,
        a.phoneNumber,
        a.addressLine,
        a.ward,
        a.provinceOrCity,
        a.postalCode ?? null,
        a.deliveryNote ?? null,
        a.isDefault,
        a.version,
        a.createdAt,
        a.updatedAt,
      ],
    );
  }
  async updateAddress(s: DatabaseSession, a: CustomerAddress, v: number) {
    const r = await s.query(
      "UPDATE customer_addresses SET recipient_name=$3,phone_number=$4,address_line=$5,ward=$6,province_or_city=$7,postal_code=$8,delivery_note=$9,version=$10,updated_at=$11 WHERE customer_id=$1 AND id=$2 AND version=$12",
      [
        a.customerId,
        a.id,
        a.recipientName,
        a.phoneNumber,
        a.addressLine,
        a.ward,
        a.provinceOrCity,
        a.postalCode ?? null,
        a.deliveryNote ?? null,
        a.version,
        a.updatedAt,
        v,
      ],
    );
    return r.rowCount === 1;
  }
  async deleteAddress(s: DatabaseSession, cid: string, id: string) {
    return (
      (
        await s.query(
          "DELETE FROM customer_addresses WHERE customer_id=$1 AND id=$2",
          [cid, id],
        )
      ).rowCount === 1
    );
  }
  async setDefaultAddress(
    s: DatabaseSession,
    cid: string,
    id: string,
    now: string,
  ) {
    const exists = await s.query(
      "SELECT id FROM customer_addresses WHERE customer_id=$1 AND id=$2 FOR UPDATE",
      [cid, id],
    );
    if (exists.rowCount !== 1) return false;
    await s.query(
      "UPDATE customer_addresses SET is_default=(id=$2),version=version+CASE WHEN is_default<>(id=$2) THEN 1 ELSE 0 END,updated_at=CASE WHEN is_default<>(id=$2) THEN $3 ELSE updated_at END WHERE customer_id=$1",
      [cid, id, now],
    );
    return true;
  }
}

function safeInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Unsafe persisted ${label}`);
  }
  return parsed;
}
