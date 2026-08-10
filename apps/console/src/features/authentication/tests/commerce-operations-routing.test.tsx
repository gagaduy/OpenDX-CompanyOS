// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRouter } from "../../../app/app-router";
import type { AuthClient, StaffRole } from "../api/oidc-manager";
import { AuthProvider } from "../hooks/auth-context";

function renderRoute(role: StaffRole, route: string, options: { readonly keepFetchMock?: boolean } = {}) {
  const client: AuthClient = {
    getSession: vi.fn(async () => ({ accessToken: "token", subject: "staff-1", displayName: "Staff", roles: [role] })),
    signIn: vi.fn(), completeSignIn: vi.fn(), signOut: vi.fn(),
  };
  if (options.keepFetchMock !== true) {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, message: "ok", data: { items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }), { status: 200, headers: { "content-type": "application/json" } }));
  }
  return render(<MemoryRouter initialEntries={[route]}><AuthProvider client={client}><AppRouter /></AuthProvider></MemoryRouter>);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("commerce operations routes", () => {
  it.each([
    ["administrator", "/orders", "Orders"],
    ["administrator", "/payments", "Payments"],
    ["operations_manager", "/orders", "Orders"],
    ["finance_operator", "/payments", "Payments"],
  ] as const)("allows %s to open %s", async (role, route, heading) => {
    renderRoute(role, route);
    expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
  });

  it.each([
    ["operations_manager", "/payments"],
    ["finance_operator", "/orders"],
    ["catalog_manager", "/orders"],
    ["inventory_manager", "/payments"],
  ] as const)("denies %s at %s", async (role, route) => {
    renderRoute(role, route);
    expect(await screen.findByRole("heading", { name: "Permission denied" })).toBeVisible();
  });

  it.each(["administrator", "crm_operator"] as const)("allows %s to open customer CRM routes", async (role) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/v1/admin/customers/segments/high_value/customers") || url.includes("/v1/admin/customers?")) {
        return json({
        items: [{ id: "b1000000-0000-4000-8000-000000000001", email: "buyer@example.com", fullName: "Nguyễn Phương", phoneNumber: "0901000001", status: "active", createdAt: "2026-08-01T00:00:00.000Z" }],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        });
      }
      return json({ items: [{ id: "high_value", name: "High value", description: "Paid threshold", customerCount: 1 }], calculatedAt: "2026-08-10T00:00:00.000Z" });
    });
    renderRoute(role, "/customers?search=Nguy%E1%BB%85n&segment=high_value", { keepFetchMock: true });

    expect(await screen.findByRole("heading", { name: "Customers" })).toBeVisible();
    expect(screen.getByRole("main")).toBeVisible();
    expect(screen.getByRole("link", { name: /customers/i })).toBeVisible();
    expect(await screen.findByText("Nguyễn Phương")).toBeVisible();
  });

  it.each(["support_operator", "executive_viewer", "operations_manager", "finance_operator", "catalog_manager", "inventory_manager"] as const)("denies %s at customer CRM routes", async (role) => {
    renderRoute(role, "/customers");
    expect(await screen.findByRole("heading", { name: "Permission denied" })).toBeVisible();
  });
});

function json(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify({ success: true, message: "ok", data }), { status: 200, headers: { "content-type": "application/json" } }));
}
