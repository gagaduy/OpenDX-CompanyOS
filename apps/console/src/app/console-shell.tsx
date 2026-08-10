// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Boxes, Building2, CreditCard, FolderTree, LogOut, PackageSearch, ShoppingBag, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../features/authentication/hooks/auth-context";

export function ConsoleShell() {
  const { session, signOut } = useAuth();
  const canUseCatalog = session?.roles.some((role) => role === "administrator" || role === "catalog_manager") === true;
  const canReadInventory = session?.roles.some((role) => role === "administrator" || role === "catalog_manager" || role === "inventory_manager") === true;
  const canOperateOrders = session?.roles.some((role) => role === "administrator" || role === "operations_manager") === true;
  const canOperatePayments = session?.roles.some((role) => role === "administrator" || role === "finance_operator") === true;
  const canOperateCustomers = session?.roles.some((role) => role === "administrator" || role === "crm_operator") === true;
  return (
    <div className="consoleLayout">
      <aside className="consoleSidebar">
        <div className="consoleBrand"><span className="brandMark">DX</span><span>NovaCommerce</span></div>
        <nav aria-label="Primary navigation">
          {canUseCatalog && <NavLink to="/products" title="Products"><PackageSearch size={17} aria-hidden="true" /> Products</NavLink>}
          {canUseCatalog && <NavLink to="/categories" title="Categories"><FolderTree size={17} aria-hidden="true" /> Categories</NavLink>}
          {canReadInventory && <NavLink to="/inventory" title="Inventory"><Boxes size={17} aria-hidden="true" /> Inventory</NavLink>}
          {canOperateOrders && <NavLink to="/orders" title="Orders"><ShoppingBag size={17} aria-hidden="true" /> Orders</NavLink>}
          {canOperatePayments && <NavLink to="/payments" title="Payments"><CreditCard size={17} aria-hidden="true" /> Payments</NavLink>}
          {canOperateCustomers && <NavLink to="/customers" title="Customers"><Users size={17} aria-hidden="true" /> Customers</NavLink>}
          <NavLink to="/company-overview" title="Company Overview"><Building2 size={17} aria-hidden="true" /> Company Overview <span className="alphaBadge">Alpha</span></NavLink>
        </nav>
        <div className="staffIdentity">
          <span>{session?.displayName}</span>
          <button type="button" title="Sign out" aria-label="Sign out" onClick={() => void signOut()}><LogOut size={16} /></button>
        </div>
      </aside>
      <main className="consoleContent"><Outlet /></main>
    </div>
  );
}
