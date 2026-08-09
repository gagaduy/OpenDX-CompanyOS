// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  Menu,
  Moon,
  Search,
  ShoppingBag,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTheme } from "./theme-provider";

export function StorefrontShell({
  cartCount = 0,
}: {
  readonly cartCount?: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { resolvedTheme, toggleTheme } = useTheme();
  return (
    <div className="storefront-shell">
      <a className="skip-link" href="#main-content">
        Bỏ qua đến nội dung
      </a>
      <header className="topbar">
        <Link className="brand" to="/">
          <span>NovaCommerce</span>
        </Link>
        <nav
          className={menuOpen ? "main-nav open" : "main-nav"}
          aria-label="Điều hướng chính"
        >
          <NavLink to="/" end>
            Sản phẩm
          </NavLink>
          <Link to="/#categories">Danh mục</Link>
          <Link to="/#catalog">Khám phá</Link>
        </nav>
        <div className="topbar-actions">
          <button
            className="icon-button mobile-menu"
            aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
          <button
            className="icon-button search-button"
            aria-label="Tìm kiếm"
            onClick={() => navigate("/search")}
          >
            <Search />
          </button>
          <button
            className="icon-button theme-toggle"
            aria-label={
              resolvedTheme === "dark"
                ? "Dùng giao diện sáng"
                : "Dùng giao diện tối"
            }
            title={
              resolvedTheme === "dark"
                ? "Dùng giao diện sáng"
                : "Dùng giao diện tối"
            }
            onClick={toggleTheme}
          >
            {resolvedTheme === "dark" ? <Sun /> : <Moon />}
          </button>
          <Link
            className="icon-button account-button"
            aria-label="Tài khoản"
            to="/account"
          >
            <UserRound />
          </Link>
          <Link
            className="icon-button cart-button"
            aria-label={`Giỏ hàng, ${cartCount} sản phẩm`}
            to="/cart"
          >
            <ShoppingBag />
            <span>{cartCount}</span>
          </Link>
        </div>
      </header>
      <Outlet />
      <footer className="footer">
        <div className="footer-brand">
          <strong>NovaCommerce</strong>
          <span>Nền tảng thương mại điện tử của OpenDX CompanyOS</span>
        </div>
        <nav aria-label="Điều hướng chân trang">
          <Link to="/">Sản phẩm</Link>
          <Link to="/#categories">Danh mục</Link>
          <Link to="/account">Tài khoản</Link>
          <Link to="/orders">Đơn hàng</Link>
          <Link to="/cart">Giỏ hàng</Link>
        </nav>
      </footer>
    </div>
  );
}
