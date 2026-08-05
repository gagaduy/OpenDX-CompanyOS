// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Building2, FolderTree, LogOut, PackageSearch } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../features/authentication/hooks/auth-context";

export function ConsoleShell() {
  const { session, signOut } = useAuth();
  return (
    <div className="consoleLayout">
      <aside className="consoleSidebar">
        <div className="consoleBrand"><span className="brandMark">DX</span><span>NovaCommerce</span></div>
        <nav aria-label="Primary navigation">
          <NavLink to="/products" title="Products"><PackageSearch size={17} aria-hidden="true" /> Products</NavLink>
          <NavLink to="/categories" title="Categories"><FolderTree size={17} aria-hidden="true" /> Categories</NavLink>
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
