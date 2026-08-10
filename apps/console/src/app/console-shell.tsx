// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  BarChart3,
  Boxes,
  Building2,
  CreditCard,
  FolderTree,
  Headphones,
  LogOut,
  Moon,
  PackageSearch,
  ShoppingBag,
  Sun,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../features/authentication/hooks/auth-context";

const consoleThemeStorageKey = "opendx.console.theme";
type ConsoleTheme = "light" | "night";

function readInitialConsoleTheme(): ConsoleTheme {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem(consoleThemeStorageKey) === "night"
    ? "night"
    : "light";
}

export function ConsoleShell() {
  const { session, signOut } = useAuth();
  const [theme, setTheme] = useState<ConsoleTheme>(readInitialConsoleTheme);
  const canUseCatalog = session?.roles.some((role) => role === "administrator" || role === "catalog_manager") === true;
  const canReadInventory = session?.roles.some((role) => role === "administrator" || role === "catalog_manager" || role === "inventory_manager") === true;
  const canOperateOrders = session?.roles.some((role) => role === "administrator" || role === "operations_manager") === true;
  const canOperatePayments = session?.roles.some((role) => role === "administrator" || role === "finance_operator") === true;
  const canOperateCustomers = session?.roles.some((role) => role === "administrator" || role === "crm_operator") === true;
  const canOperateSupport = session?.roles.some((role) => role === "administrator" || role === "support_operator" || role === "crm_operator") === true;
  const canReadDashboard = session?.roles.some((role) => role === "administrator" || role === "executive_viewer") === true;
  useEffect(() => {
    window.localStorage.setItem(consoleThemeStorageKey, theme);
  }, [theme]);

  const nightModeEnabled = theme === "night";

  return (
    <div
      className="consoleLayout"
      data-theme={theme}
      data-testid="console-layout"
    >
      <aside className="consoleSidebar">
        <div className="consoleBrand"><span className="brandMark">DX</span><span>NovaCommerce</span></div>
        <nav aria-label="Primary navigation">
          {canUseCatalog && <NavLink to="/products" title="Products"><PackageSearch size={17} aria-hidden="true" /> Products</NavLink>}
          {canUseCatalog && <NavLink to="/categories" title="Categories"><FolderTree size={17} aria-hidden="true" /> Categories</NavLink>}
          {canReadInventory && <NavLink to="/inventory" title="Inventory"><Boxes size={17} aria-hidden="true" /> Inventory</NavLink>}
          {canOperateOrders && <NavLink to="/orders" title="Orders"><ShoppingBag size={17} aria-hidden="true" /> Orders</NavLink>}
          {canOperatePayments && <NavLink to="/payments" title="Payments"><CreditCard size={17} aria-hidden="true" /> Payments</NavLink>}
          {canOperateCustomers && <NavLink to="/customers" title="Customers"><Users size={17} aria-hidden="true" /> Customers</NavLink>}
          {canOperateSupport && <NavLink to="/support" title="Support"><Headphones size={17} aria-hidden="true" /> Support</NavLink>}
          {canReadDashboard && <NavLink to="/dashboard" title="Dashboard"><BarChart3 size={17} aria-hidden="true" /> Dashboard</NavLink>}
          <NavLink to="/company-overview" title="Company Overview"><Building2 size={17} aria-hidden="true" /> Company Overview <span className="alphaBadge">Alpha</span></NavLink>
        </nav>
        <div className="staffIdentity">
          <span>{session?.displayName}</span>
          <div className="staffActions">
            <button
              type="button"
              title={nightModeEnabled ? "Tắt chế độ night" : "Bật chế độ night"}
              aria-label={nightModeEnabled ? "Tắt chế độ night" : "Bật chế độ night"}
              onClick={() => setTheme(nightModeEnabled ? "light" : "night")}
            >
              {nightModeEnabled ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              type="button"
              title="Sign out"
              aria-label="Sign out"
              onClick={() => void signOut()}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className="consoleContent"><Outlet /></main>
    </div>
  );
}
