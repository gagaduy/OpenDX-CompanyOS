// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppRouter } from "../../../app/app-router";
import type { AuthClient, AuthSession } from "../api/oidc-manager";
import { AuthProvider } from "../hooks/auth-context";

const catalogSession: AuthSession = {
  accessToken: "signed-token",
  subject: "user_catalog",
  displayName: "Catalog Manager",
  roles: ["catalog_manager"],
};

function createClient(session: AuthSession | null): AuthClient {
  return {
    getSession: vi.fn(async () => session),
    signIn: vi.fn(async () => undefined),
    completeSignIn: vi.fn(async () => catalogSession),
    signOut: vi.fn(async () => undefined),
  };
}

function renderRoute(path: string, client: AuthClient) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider client={client}>
        <AppRouter />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("console authentication routes", () => {
  it("redirects anonymous staff to sign in and starts OIDC login", async () => {
    const client = createClient(null);
    renderRoute("/products", client);
    await userEvent.click(await screen.findByRole("button", { name: /sign in/i }));
    expect(client.signIn).toHaveBeenCalledOnce();
  });

  it("completes the explicit callback and opens the catalog", async () => {
    const client = createClient(null);
    renderRoute("/auth/callback", client);
    await waitFor(() => expect(client.completeSignIn).toHaveBeenCalledOnce());
    expect(await screen.findByRole("heading", { name: "Products" })).toBeVisible();
  });

  it.each(["administrator", "catalog_manager"] as const)(
    "allows the %s role into catalog",
    async (role) => {
      renderRoute("/products", createClient({ ...catalogSession, roles: [role] }));
      expect(await screen.findByRole("heading", { name: "Products" })).toBeVisible();
    },
  );

  it("renders permission denied for authenticated staff without a catalog role", async () => {
    renderRoute(
      "/products",
      createClient({ ...catalogSession, roles: [] }),
    );
    expect(await screen.findByText(/permission denied/i)).toBeVisible();
  });
});
