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
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useTheme } from "./theme-provider";

export function StorefrontShell({
  cartCount = 0,
  children,
}: {
  readonly cartCount?: number;
  readonly children?: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { resolvedTheme, toggleTheme } = useTheme();

  useEffect(() => {
    if (location.hash.length <= 1) return;
    const sectionId = decodeURIComponent(location.hash.slice(1));
    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;

    const scrollToSection = () => {
      if (cancelled) return;
      const section = document.getElementById(sectionId);
      if (section !== null) {
        section.scrollIntoView({ block: "start", behavior: "smooth" });
        return;
      }
      attempts += 1;
      if (attempts < 20) {
        timer = window.setTimeout(scrollToSection, 50);
      }
    };

    timer = window.setTimeout(scrollToSection, 0);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [location.hash, location.pathname, location.search]);

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
      {children ?? <Outlet />}
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
