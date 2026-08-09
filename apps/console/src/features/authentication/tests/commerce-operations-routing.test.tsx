// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppRouter } from "../../../app/app-router";
import type { AuthClient, StaffRole } from "../api/oidc-manager";
import { AuthProvider } from "../hooks/auth-context";

function renderRoute(role: StaffRole, route: string) {
  const client: AuthClient = {
    getSession: vi.fn(async () => ({ accessToken: "token", subject: "staff-1", displayName: "Staff", roles: [role] })),
    signIn: vi.fn(), completeSignIn: vi.fn(), signOut: vi.fn(),
  };
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, message: "ok", data: { items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }), { status: 200, headers: { "content-type": "application/json" } }));
  return render(<MemoryRouter initialEntries={[route]}><AuthProvider client={client}><AppRouter /></AuthProvider></MemoryRouter>);
}

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
});
