// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRouter } from "./app-router";
import type {
  AuthClient,
  AuthSession,
} from "../features/authentication/api/oidc-manager";
import { AuthProvider } from "../features/authentication/hooks/auth-context";

describe("ConsoleShell", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

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
    expect(screen.getByRole("link", { name: /inventory/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /company overview/i })).toHaveTextContent("Alpha");
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(client.signOut).toHaveBeenCalledOnce();
  });

  it("toggles and persists the Console night mode", async () => {
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
    const { unmount } = render(
      <MemoryRouter initialEntries={["/products"]}>
        <AuthProvider client={client}>
          <AppRouter />
        </AuthProvider>
      </MemoryRouter>,
    );

    const layout = await screen.findByTestId("console-layout");
    expect(layout).toHaveAttribute("data-theme", "night");

    await userEvent.click(
      screen.getByRole("button", { name: "Use light theme" }),
    );

    expect(layout).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem("opendx.console.theme")).toBe("light");

    unmount();
    window.localStorage.setItem("opendx.console.theme", "invalid");

    render(
      <MemoryRouter initialEntries={["/products"]}>
        <AuthProvider client={client}>
          <AppRouter />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("console-layout")).toHaveAttribute(
      "data-theme",
      "night",
    );
  });

  it("groups role-aware navigation and identifies the current workspace", async () => {
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

    expect(await screen.findByText("NovaCommerce")).toBeVisible();
    const navigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(within(navigation).getByText("Overview")).toBeVisible();
    expect(within(navigation).getByText("Catalog")).toBeVisible();
    expect(within(navigation).getByText("Operations")).toBeVisible();
    expect(within(navigation).getByRole("link", { name: "Products" }))
      .toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("banner", { name: "Workspace context" }))
      .toHaveTextContent("Products");
  });

  it("shows implemented Digital Workforce task, approval, and employee navigation", async () => {
    const session: AuthSession = { accessToken: "token", subject: "operator-a", displayName: "Operator", roles: ["agentic_operator"] };
    const client: AuthClient = { getSession: vi.fn(async () => session), signIn: vi.fn(), completeSignIn: vi.fn(), signOut: vi.fn() };
    render(<MemoryRouter initialEntries={["/agentic/tasks"]}><AuthProvider client={client}><AppRouter /></AuthProvider></MemoryRouter>);
    const navigation = await screen.findByRole("navigation", { name: "Primary navigation" });
    expect(within(navigation).getByText("Digital Workforce")).toBeVisible();
    expect(within(navigation).getByRole("link", { name: "Tasks" })).toBeVisible();
    expect(within(navigation).getByRole("link", { name: "Approvals" })).toBeVisible();
    expect(within(navigation).getByRole("link", { name: "Employees" })).toBeVisible();
    expect(within(navigation).queryByText("Memory")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Digital Workforce" })).toBeVisible();
  });

  it("shows auditors only the read-only Digital Employee entry", async () => {
    const session: AuthSession = { accessToken: "token", subject: "auditor-a", displayName: "Auditor", roles: ["agentic_auditor"] };
    const client: AuthClient = { getSession: vi.fn(async () => session), signIn: vi.fn(), completeSignIn: vi.fn(), signOut: vi.fn() };
    render(<MemoryRouter initialEntries={["/company-overview"]}><AuthProvider client={client}><AppRouter /></AuthProvider></MemoryRouter>);
    const navigation = await screen.findByRole("navigation", { name: "Primary navigation" });
    expect(within(navigation).getByRole("link", { name: "Employees" })).toBeVisible();
    expect(within(navigation).queryByRole("link", { name: "Tasks" })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "Approvals" })).not.toBeInTheDocument();
  });

  it("closes mobile navigation with Escape and restores trigger focus", async () => {
    const user = userEvent.setup();
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

    const trigger = await screen.findByRole("button", {
      name: "Open navigation",
    });
    await user.click(trigger);
    expect(screen.getByRole("navigation", { name: "Primary navigation" }))
      .toHaveAttribute("data-mobile-open", "true");

    await user.keyboard("{Escape}");
    expect(screen.getByRole("navigation", { name: "Primary navigation" }))
      .toHaveAttribute("data-mobile-open", "false");
    expect(trigger).toHaveFocus();
  });
});
