// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  ChevronDown,
  Menu,
  Moon,
  Heart,
  Search,
  ShoppingBag,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import type { FormEvent } from "react";
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
import type { StorefrontCategory } from "../features/catalog";
import { LiveChatWidget } from "../features/livechat";

const supportedCatalogParameters = [
  "category",
  "minPrice",
  "maxPrice",
  "stockStatus",
  "discountStatus",
  "sort",
  "pageSize",
] as const;

function catalogSearchState(search: string) {
  const current = new URLSearchParams(search);
  const supported = new URLSearchParams();

  for (const name of supportedCatalogParameters) {
    const value = current.get(name);
    if (value !== null) supported.set(name, value);
  }

  return supported;
}

export function StorefrontShell({
  cartCount = 0,
  wishlistCount = 0,
  authenticated = false,
  categories = [],
  children,
}: {
  readonly cartCount?: number;
  readonly wishlistCount?: number;
  readonly authenticated?: boolean;
  readonly categories?: readonly StorefrontCategory[];
  readonly children?: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openNavigationMenu, setOpenNavigationMenu] = useState<
    "categories" | "discovery" | null
  >(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { resolvedTheme, toggleTheme } = useTheme();

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenNavigationMenu(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    setOpenNavigationMenu(null);
    setMenuOpen(false);
  }, [location.pathname, location.search, location.hash]);

  function submitHeaderSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = String(form.get("query") ?? "").trim();
    const next = catalogSearchState(location.search);

    if (query.length > 0) {
      next.set("query", query);
      next.set("page", "1");
    } else {
      next.delete("query");
      next.delete("page");
    }

    const queryString = next.toString();
    navigate(
      `/products${queryString.length > 0 ? `?${queryString}` : ""}#catalog`,
    );
  }

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
        <div className="topbar-inner">
          <Link className="brand" to="/">
            <span className="brand-mark" aria-hidden="true">N</span>
            <span>NovaCommerce</span>
          </Link>
          <form
            className="header-search"
            role="search"
            aria-label="Tìm kiếm sản phẩm"
            onSubmit={submitHeaderSearch}
          >
            <input
              aria-label="Tìm kiếm sản phẩm"
              name="query"
              type="search"
              defaultValue={
                new URLSearchParams(location.search).get("query") ?? ""
              }
              placeholder="Tìm kiếm sản phẩm, thương hiệu..."
            />
            <button type="submit" aria-label="Tìm kiếm">
              <Search aria-hidden="true" />
            </button>
          </form>
          <div className="topbar-actions">
            <button
              className="icon-button mobile-menu"
              aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X /> : <Menu />}
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
              className="header-action account-button"
              aria-label={authenticated ? "Tài khoản" : "Đăng nhập"}
              to={authenticated ? "/account" : "/sign-in"}
            >
              <UserRound aria-hidden="true" />
              <span>{authenticated ? "Tài khoản" : "Đăng nhập"}</span>
            </Link>
            <Link
              className="header-action wishlist-header-button"
              aria-label={`Yêu thích, ${wishlistCount} sản phẩm`}
              to="/account/wishlist"
            >
              <Heart aria-hidden="true" />
              <span>Yêu thích</span>
              {wishlistCount > 0 ? <b>{wishlistCount}</b> : null}
            </Link>
            <Link
              className="header-action cart-button"
              aria-label={`Giỏ hàng, ${cartCount} sản phẩm`}
              to="/cart"
            >
              <ShoppingBag aria-hidden="true" />
              <span>Giỏ hàng</span>
              {cartCount > 0 ? <b>{cartCount}</b> : null}
            </Link>
          </div>
        </div>
        <div className="header-nav-row">
          <nav
            className={menuOpen ? "main-nav open" : "main-nav"}
            aria-label="Điều hướng chính"
          >
            <NavLink to="/" end>Trang chủ</NavLink>
            <NavLink to="/products">Sản phẩm</NavLink>
            <div className="nav-menu">
              <button
                type="button"
                aria-expanded={openNavigationMenu === "categories"}
                aria-haspopup="menu"
                onClick={() =>
                  setOpenNavigationMenu((current) =>
                    current === "categories" ? null : "categories",
                  )
                }
              >
                Danh mục <ChevronDown aria-hidden="true" />
              </button>
              {openNavigationMenu === "categories" ? (
                <div className="nav-dropdown" role="menu">
                  {categories.map((category) => (
                    <Link
                      key={category.id}
                      role="menuitem"
                      to={`/products?category=${encodeURIComponent(category.slug)}#catalog`}
                    >
                      {category.name}
                    </Link>
                  ))}
                  <Link role="menuitem" to="/products#catalog">Tất cả danh mục</Link>
                </div>
              ) : null}
            </div>
            <div className="nav-menu">
              <button
                type="button"
                aria-expanded={openNavigationMenu === "discovery"}
                aria-haspopup="menu"
                onClick={() =>
                  setOpenNavigationMenu((current) =>
                    current === "discovery" ? null : "discovery",
                  )
                }
              >
                Khám phá <ChevronDown aria-hidden="true" />
              </button>
              {openNavigationMenu === "discovery" ? (
                <div className="nav-dropdown" role="menu">
                  <Link role="menuitem" to="/products?discountStatus=on_sale#catalog">
                    Sản phẩm nổi bật
                  </Link>
                  <Link role="menuitem" to="/products?sort=best_selling#catalog">
                    Sản phẩm bán chạy
                  </Link>
                  <Link role="menuitem" to="/products?sort=newest#catalog">
                    Sản phẩm mới nhất
                  </Link>
                </div>
              ) : null}
            </div>
          </nav>
        </div>
      </header>
      {children ?? <Outlet />}
      <footer id="support" className="footer">
        <div className="footer-brand">
          <strong>NovaCommerce</strong>
          <span>Nền tảng thương mại điện tử của OpenDX CompanyOS</span>
        </div>
        <nav aria-label="Điều hướng chân trang">
          <Link to="/">Trang chủ</Link>
          <Link to="/products">Sản phẩm</Link>
          <Link to="/products#catalog">Danh mục</Link>
          <Link to="/account">Tài khoản</Link>
          <Link to="/orders">Đơn hàng</Link>
          <Link to="/cart">Giỏ hàng</Link>
        </nav>
      </footer>
      <LiveChatWidget />
    </div>
  );
}
