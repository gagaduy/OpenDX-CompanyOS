// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { CustomerSessionApi } from "../../authentication/api/customer-session-api";
import { CustomerSessionProvider } from "../../authentication/hooks/customer-session-context";
import type { CustomerAccountApi } from "../api/customer-account-api";
import { AccountPage } from "../pages/account-page";

describe("customer account", () => {
  it("shows verified email and submits purpose-specific profile data", async () => {
    const profile = {
      id: "customer-1",
      email: "verified@example.com",
      fullName: "Duy",
      version: 1,
    };
    const updateProfile = vi.fn(async (input) => ({
      ...profile,
      ...input,
      version: 2,
    }));
    const account = {
      profile: vi.fn(async () => profile),
      addresses: vi.fn(async () => []),
      updateProfile,
    } as unknown as CustomerAccountApi;
    const sessions = {
      get: vi.fn(async () => ({
        kind: "customer" as const,
        customerId: "customer-1",
        email: profile.email,
        expiresAt: "2099-01-01",
      })),
    } as unknown as CustomerSessionApi;
    render(
      <MemoryRouter>
        <CustomerSessionProvider api={sessions}>
          <AccountPage api={account} />
        </CustomerSessionProvider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByDisplayValue("verified@example.com"),
    ).toHaveAttribute("readonly");
    await userEvent.clear(screen.getByLabelText("Họ và tên"));
    await userEvent.type(screen.getByLabelText("Họ và tên"), "Duy Nguyen");
    await userEvent.click(screen.getByRole("button", { name: "Lưu hồ sơ" }));
    expect(updateProfile).toHaveBeenCalledWith({
      fullName: "Duy Nguyen",
      version: 1,
    });
  });

  it("shows profile mutation errors without discarding entered values", async () => {
    const profile = {
      id: "customer-1",
      email: "verified@example.com",
      fullName: "Duy",
      version: 1,
    };
    const account = {
      profile: vi.fn(async () => profile),
      addresses: vi.fn(async () => []),
      updateProfile: vi.fn(async () => {
        throw new Error("dependency unavailable");
      }),
    } as unknown as CustomerAccountApi;
    const sessions = {
      get: vi.fn(async () => ({
        kind: "customer" as const,
        customerId: "customer-1",
        email: profile.email,
        expiresAt: "2099-01-01",
      })),
    } as unknown as CustomerSessionApi;
    render(
      <MemoryRouter>
        <CustomerSessionProvider api={sessions}>
          <AccountPage api={account} />
        </CustomerSessionProvider>
      </MemoryRouter>,
    );
    const name = await screen.findByLabelText("Họ và tên");
    await userEvent.clear(name);
    await userEvent.type(name, "Duy Nguyen");
    await userEvent.click(screen.getByRole("button", { name: "Lưu hồ sơ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể lưu hồ sơ",
    );
    expect(name).toHaveValue("Duy Nguyen");
  });
});
