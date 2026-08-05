// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";

export function StorefrontShell({ cartCount = 0 }: { readonly cartCount?: number }) {
  const [menuOpen, setMenuOpen] = useState(false); const navigate = useNavigate();
  return <div className="storefront-shell">
    <a className="skip-link" href="#main-content">Bỏ qua đến nội dung</a>
    <header className="topbar"><Link className="brand" to="/"><span className="brand-mark">N</span><span>NovaCommerce</span></Link>
      <nav className={menuOpen ? "main-nav open" : "main-nav"} aria-label="Điều hướng chính"><NavLink to="/">Sản phẩm</NavLink><NavLink to="/account">Tài khoản</NavLink></nav>
      <div className="topbar-actions"><button className="icon-button mobile-menu" aria-label={menuOpen ? "Đóng menu" : "Mở menu"} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button><button className="icon-button" aria-label="Tìm kiếm" onClick={() => navigate("/search")}><Search /></button><Link className="icon-button" aria-label="Tài khoản" to="/account"><UserRound /></Link><Link className="icon-button cart-button" aria-label={`Giỏ hàng, ${cartCount} sản phẩm`} to="/cart"><ShoppingBag /><span>{cartCount}</span></Link></div>
    </header>
    <Outlet />
    <footer className="footer"><strong>NovaCommerce</strong><span>Nền tảng thương mại điện tử của OpenDX CompanyOS</span></footer>
  </div>;
}
