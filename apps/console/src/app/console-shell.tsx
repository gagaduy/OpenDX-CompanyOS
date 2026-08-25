// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  BarChart3,
  Boxes,
  Building2,
  Bot,
  ClipboardCheck,
  CreditCard,
  FolderTree,
  Headphones,
  LogOut,
  Menu,
  Moon,
  PackageSearch,
  ShoppingBag,
  Sun,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../features/authentication/hooks/auth-context";

const consoleThemeStorageKey = "opendx.console.theme";
type ConsoleTheme = "light" | "night";

function readInitialConsoleTheme(): ConsoleTheme {
  if (typeof window === "undefined") return "night";
  return window.localStorage.getItem(consoleThemeStorageKey) === "light"
    ? "light"
    : "night";
}

const routeTitles = [
  ["/agentic/approvals", "Approval Inbox"],
  ["/agentic/tasks", "Digital Workforce"],
  ["/company-overview", "Company Overview"],
  ["/categories", "Categories"],
  ["/inventory", "Inventory"],
  ["/products", "Products"],
  ["/orders", "Orders"],
  ["/payments", "Payments"],
  ["/customers", "Customers"],
  ["/support", "Support"],
  ["/dashboard", "Dashboard"],
] as const;

export function ConsoleShell() {
  const { session, signOut } = useAuth();
  const location = useLocation();
  const [theme, setTheme] = useState<ConsoleTheme>(readInitialConsoleTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const canUseCatalog = session?.roles.some((role) => role === "administrator" || role === "catalog_manager") === true;
  const canReadInventory = session?.roles.some((role) => role === "administrator" || role === "catalog_manager" || role === "inventory_manager") === true;
  const canOperateOrders = session?.roles.some((role) => role === "administrator" || role === "operations_manager") === true;
  const canOperatePayments = session?.roles.some((role) => role === "administrator" || role === "finance_operator") === true;
  const canOperateCustomers = session?.roles.some((role) => role === "administrator" || role === "crm_operator") === true;
  const canOperateSupport = session?.roles.some((role) => role === "administrator" || role === "support_operator" || role === "crm_operator") === true;
  const canReadDashboard = session?.roles.some((role) => role === "administrator" || role === "executive_viewer") === true;
  const canReadAgenticTasks = session?.roles.some((role) => role === "administrator" || role === "agentic_operator" || role === "agentic_approver" || role === "agentic_governance_admin") === true;
  useEffect(() => {
    window.localStorage.setItem(consoleThemeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const nightModeEnabled = theme === "night";
  const currentTitle = routeTitles.find(([path]) =>
    location.pathname.startsWith(path),
  )?.[1] ?? "Operations Console";

  const navigationGroups = [
    {
      label: "Overview",
      items: [
        { to: "/dashboard", label: "Dashboard", icon: BarChart3, visible: canReadDashboard },
        { to: "/company-overview", label: "Company Overview", icon: Building2, visible: true, alpha: true },
      ],
    },
    {
      label: "Catalog",
      items: [
        { to: "/products", label: "Products", icon: PackageSearch, visible: canUseCatalog },
        { to: "/categories", label: "Categories", icon: FolderTree, visible: canUseCatalog },
        { to: "/inventory", label: "Inventory", icon: Boxes, visible: canReadInventory },
      ],
    },
    {
      label: "Operations",
      items: [
        { to: "/orders", label: "Orders", icon: ShoppingBag, visible: canOperateOrders },
        { to: "/payments", label: "Payments", icon: CreditCard, visible: canOperatePayments },
        { to: "/customers", label: "Customers", icon: Users, visible: canOperateCustomers },
        { to: "/support", label: "Support", icon: Headphones, visible: canOperateSupport },
      ],
    },
    {
      label: "Digital Workforce",
      items: [
        { to: "/agentic/tasks", label: "Tasks", icon: Bot, visible: canReadAgenticTasks },
        { to: "/agentic/approvals", label: "Approvals", icon: ClipboardCheck, visible: canReadAgenticTasks },
      ],
    },
  ];

  return (
    <div
      className="consoleLayout"
      data-theme={theme}
      data-testid="console-layout"
    >
      <aside className="consoleSidebar" data-mobile-open={menuOpen}>
        <div className="consoleBrand">
          <span className="brandMark">N</span>
          <span className="navText">NovaCommerce</span>
          <button
            className="mobileCloseButton"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Primary navigation" data-mobile-open={menuOpen}>
          {navigationGroups.map((group) => {
            const visibleItems = group.items.filter((item) => item.visible);
            if (visibleItems.length === 0) return null;
            return (
              <section className="navGroup" key={group.label}>
                <p className="navGroupLabel">{group.label}</p>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      title={item.label}
                      onClick={() => setMenuOpen(false)}
                    >
                      <Icon size={17} aria-hidden="true" />
                      <span className="navText">{item.label}</span>
                      {item.alpha && <span className="alphaBadge">Alpha</span>}
                    </NavLink>
                  );
                })}
              </section>
            );
          })}
        </nav>
        <div className="staffIdentity">
          <span className="navText">{session?.displayName}</span>
          <div className="staffActions">
            <button
              type="button"
              title={nightModeEnabled ? "Use light theme" : "Use night theme"}
              aria-label={nightModeEnabled ? "Use light theme" : "Use night theme"}
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
      {menuOpen && (
        <button
          className="consoleMobileBackdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="consoleWorkspace">
        <header className="consoleTopbar" aria-label="Workspace context">
          <button
            ref={menuTriggerRef}
            className="mobileMenuButton"
            type="button"
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={19} aria-hidden="true" />
          </button>
          <div>
            <p>NovaCommerce / {currentTitle}</p>
            <strong>{currentTitle}</strong>
          </div>
        </header>
        <main className="consoleContent"><Outlet /></main>
      </div>
    </div>
  );
}
