// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppRouter } from "./app-router";
import type {
  AuthClient,
  AuthSession,
} from "../features/authentication/api/oidc-manager";
import { AuthProvider } from "../features/authentication/hooks/auth-context";

describe("ConsoleShell", () => {
  it("prioritizes catalog navigation and supports logout", async () => {
    const session: AuthSession = {
      accessToken: "token",
      subject: "user_admin",
      displayName: "Administrator",
      roles: ["administrator"],
    };
    const client: AuthClient = {
      getSession: vi.fn(async () => session),
      signIn: vi.fn(async () => undefined),
      completeSignIn: vi.fn(async () => {
        throw new Error("not used");
      }),
      signOut: vi.fn(async () => undefined),
    };
    render(
      <MemoryRouter initialEntries={["/products"]}>
        <AuthProvider client={client}>
          <AppRouter />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: /products/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /categories/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /company overview/i })).toHaveTextContent("Alpha");
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(client.signOut).toHaveBeenCalledOnce();
  });
});
