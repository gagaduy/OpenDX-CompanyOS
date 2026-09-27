// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  Calendar,
  CheckCircle2,
  Crown,
  CreditCard,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { formatVnd } from "../../../shared/format/currency";
import type { Customer360View } from "../types/crm.types";
import "../../customers/styles/customers.css";

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #6366f1, #8b5cf6)",
  "linear-gradient(135deg, #3b82f6, #06b6d4)",
  "linear-gradient(135deg, #10b981, #059669)",
  "linear-gradient(135deg, #f59e0b, #d97706)",
  "linear-gradient(135deg, #ec4899, #8b5cf6)",
  "linear-gradient(135deg, #0ea5e9, #6366f1)",
];

function getAvatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

function getInitials(fullName?: string, email?: string): string {
  if (fullName && fullName.trim().length > 0) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "KH";
}

export function CustomerSummary({ view }: { readonly view: Customer360View }) {
  const customer = view.customer;
  const initials = getInitials(customer.fullName, customer.email);
  const avatarGradient = getAvatarGradient(customer.email || customer.id);
  const isVip = view.segments.includes("high_value");

  return (
    <section className="detailCard customer360SectionCard" aria-label="Customer summary">
      <div className="customer360SectionHeader">
        <h2 className="customer360SectionTitle">
          <ShieldCheck size={18} style={{ color: "#818cf8" }} aria-hidden="true" />
          <span>Read-only profile</span>
        </h2>
        <span
          className={`customerStatusBadge ${customer.status === "active" ? "active" : "disabled"}`}
        >
          <span className="customerStatusDot" />
          <span>{customer.status === "active" ? "Hoạt động (Active)" : "Vô hiệu hóa"}</span>
        </span>
      </div>

      {/* Profile Overview Box */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem 0" }}>
        <div
          className="customerAvatar"
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            fontSize: "1.1rem",
            background: avatarGradient,
          }}
          aria-hidden="true"
        >
          {initials}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <strong style={{ fontSize: "1.05rem", color: "var(--ink, #ffffff)" }}>
            {customer.fullName ?? customer.email}
          </strong>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--ink-subtle, #94a3b8)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Mail size={13} aria-hidden="true" />
            <span>{customer.email}</span>
          </p>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--ink-subtle, #94a3b8)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Phone size={13} aria-hidden="true" />
            <span>{customer.phoneNumber ?? "No phone"}</span>
          </p>
        </div>
      </div>

      {/* Financial Facts Banner */}
      <div
        style={{
          background: "var(--surface-2, #141518)",
          border: "1px solid var(--hairline, #2a2d35)",
          borderRadius: "10px",
          padding: "0.85rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <CreditCard size={16} style={{ color: "#34d399" }} aria-hidden="true" />
          <span style={{ fontWeight: 600, color: "var(--ink, #ffffff)", fontSize: "0.88rem" }}>
            {view.paidFacts.paidOrderCount} paid orders · {formatVnd(view.paidFacts.lifetimePaidVnd)}
          </span>
        </div>
        {view.paidFacts.latestPaidAt ? (
          <span style={{ fontSize: "0.78rem", color: "var(--ink-subtle, #8a8f98)" }}>
            Gần nhất: {new Date(view.paidFacts.latestPaidAt).toLocaleDateString("vi-VN")}
          </span>
        ) : null}
      </div>

      {/* Customer Segments */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink-subtle, #8a8f98)" }}>
          Phân khúc khách hàng (Segments)
        </span>
        <div className="chipRow customer360SegmentsRow">
          {view.segments.map((seg) => {
            const isHigh = seg === "high_value";
            return (
              <span
                className={`statusChip customer360SegmentChip ${isHigh ? "vip" : ""}`}
                key={seg}
              >
                {isHigh ? <Crown size={12} style={{ color: "#fbbf24" }} aria-hidden="true" /> : null}
                <span>{segmentLabel(seg)}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Addresses */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.5rem" }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "0.45rem", color: "var(--ink, #ffffff)" }}>
          <MapPin size={15} style={{ color: "#f43f5e" }} aria-hidden="true" />
          <span>Addresses</span>
        </h3>

        {view.customer.addresses.length === 0 ? (
          <p style={{ fontSize: "0.82rem", color: "var(--ink-subtle, #8a8f98)", fontStyle: "italic", margin: 0 }}>
            Chưa lưu địa chỉ giao hàng nào.
          </p>
        ) : (
          <div className="customerAddressList">
            {view.customer.addresses.map((address) => (
              <address
                key={address.id}
                className={`customerAddressCard ${address.isDefault ? "isDefault" : ""}`}
              >
                <div className="customerAddressHeaderRow">
                  <span className="customerAddressRecipient">{address.recipientName}</span>
                  {address.isDefault ? (
                    <span className="customerAddressDefaultBadge">Mặc định (Default)</span>
                  ) : null}
                </div>
                <span className="customerAddressSub">
                  <Phone size={12} style={{ opacity: 0.7 }} aria-hidden="true" />
                  <span>{address.phoneNumber}</span>
                </span>
                <span className="customerAddressLine">{address.addressLine}</span>
                <span className="customerAddressSub">
                  {address.ward}, {address.provinceOrCity}
                </span>
              </address>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function segmentLabel(value: string) {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
