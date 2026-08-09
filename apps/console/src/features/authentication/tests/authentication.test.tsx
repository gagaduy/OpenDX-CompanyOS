// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppRouter } from "../../../app/app-router";
import {
  createOidcAuthClient,
  type AuthClient,
  type AuthSession,
} from "../api/oidc-manager";
import { AuthProvider } from "../hooks/auth-context";

const oidc = vi.hoisted(() => ({
  getUser: vi.fn(),
  signinRedirect: vi.fn(),
  signinRedirectCallback: vi.fn(),
  signoutRedirect: vi.fn(),
}));

vi.mock("oidc-client-ts", () => ({
  UserManager: class {
    getUser = oidc.getUser;
    signinRedirect = oidc.signinRedirect;
    signinRedirectCallback = oidc.signinRedirectCallback;
    signoutRedirect = oidc.signoutRedirect;
  },
  WebStorageStateStore: class {},
}));

const catalogSession: AuthSession = {
  accessToken: "signed-token",
  subject: "user_catalog",
  displayName: "Catalog Manager",
  roles: ["catalog_manager"],
};
const inventorySession: AuthSession = {
  accessToken: "inventory-token",
  subject: "user_inventory",
  displayName: "Inventory Manager",
  roles: ["inventory_manager"],
};

function createClient(session: AuthSession | null, completedSession: AuthSession = catalogSession): AuthClient {
  return {
    getSession: vi.fn(async () => session),
    signIn: vi.fn(async () => undefined),
    completeSignIn: vi.fn(async () => completedSession),
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
  it("keeps only approved Phase 7 realm roles in a restored session", async () => {
    oidc.getUser.mockResolvedValueOnce({
      access_token: "phase-seven-token",
      expired: false,
      profile: {
        sub: "phase-seven-user",
        name: "Phase Seven User",
        realm_access: {
          roles: ["crm_operator", "support_operator", "executive_viewer", "offline_access"],
        },
      },
    });
    const client = createOidcAuthClient({
      apiBaseUrl: "http://localhost",
      oidcAuthority: "https://identity.example.test/realms/opendx",
      oidcClientId: "opendx-console",
      oidcRedirectUri: "http://localhost/auth/callback",
      oidcPostLogoutRedirectUri: "http://localhost/sign-in",
    });

    await expect(client.getSession()).resolves.toMatchObject({
      roles: ["crm_operator", "support_operator", "executive_viewer"],
    });
  });

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

  it("completes Inventory Manager sign-in and opens inventory", async () => {
    const client = createClient(null, inventorySession);
    renderRoute("/auth/callback", client);
    await waitFor(() => expect(client.completeSignIn).toHaveBeenCalledOnce());
    expect(await screen.findByRole("heading", { name: "Inventory" })).toBeVisible();
  });

  it("allows Inventory Managers into their workspace", async () => {
    renderRoute("/inventory", createClient(inventorySession));
    expect(await screen.findByRole("heading", { name: "Inventory" })).toBeVisible();
  });

  it.each(["administrator", "catalog_manager"] as const)(
    "allows the %s role into catalog",
    async (role) => {
      renderRoute("/products", createClient({ ...catalogSession, roles: [role] }));
      expect(await screen.findByRole("heading", { name: "Products" })).toBeVisible();
    },
  );

  it.each([
    "operations_manager",
    "finance_operator",
    "crm_operator",
    "support_operator",
    "executive_viewer",
  ] as const)(
    "recognizes the %s as an authorized staff role",
    async (role) => {
      renderRoute("/company-overview", createClient({
        ...catalogSession,
        roles: [role],
      }));
      expect(await screen.findByRole("heading", { name: /company operating console/i })).toBeVisible();
    },
  );

  it("renders permission denied for authenticated users without a staff role", async () => {
    renderRoute(
      "/products",
      createClient({ ...catalogSession, roles: [] }),
    );
    expect(await screen.findByText(/permission denied/i)).toBeVisible();
  });
});
