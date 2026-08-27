// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  CheckCircle2,
  Heart,
  LogOut,
  MapPin,
  Package,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import type { CustomerProfile } from "../types/customer-account.types";

export function AccountWorkspace({
  profile,
  active,
  onLogout,
  children,
}: {
  readonly profile: CustomerProfile;
  readonly active: "profile" | "addresses" | "wishlist" | "orders";
  readonly onLogout: () => void;
  readonly children: ReactNode;
}) {
  const customerName = profile.fullName?.trim() || "bạn";
  return (
    <main id="main-content" className="content-page account-page">
      <header className="account-hero">
        <div>
          <span className="eyebrow">Tài khoản khách hàng</span>
          <h1>Xin chào, {customerName}</h1>
          <p>
            <CheckCircle2 /> {profile.email}
          </p>
        </div>
        <button className="button secondary" onClick={onLogout}>
          <LogOut /> Đăng xuất
        </button>
      </header>
      <div className="account-workspace">
        <nav className="account-nav" aria-label="Điều hướng tài khoản">
          <NavLink className={active === "profile" ? "active" : ""} end to="/account">
            <UserRound /> Hồ sơ
          </NavLink>
          <NavLink
            className={active === "addresses" ? "active" : ""}
            to="/account/addresses"
          >
            <MapPin /> Địa chỉ
          </NavLink>
          <NavLink
            className={active === "wishlist" ? "active" : ""}
            to="/account/wishlist"
          >
            <Heart /> Yêu thích
          </NavLink>
          <NavLink className={active === "orders" ? "active" : ""} to="/orders">
            <Package /> Đơn hàng
          </NavLink>
        </nav>
        <div className="account-content">{children}</div>
      </div>
    </main>
  );
}
