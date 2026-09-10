// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../authentication/hooks/auth-context";
import { AgenticCommandCenter } from "../components/agentic-command-center";

describe("AgenticCommandCenter Social Tokens Monitor & 1-Click Operations", () => {
  const authClient = {
    getSession: vi.fn(async () => ({ user: { id: "test-user" } })),
    signIn: vi.fn(async () => undefined),
    completeSignIn: vi.fn(),
    signOut: vi.fn(),
  };

  const fakeApi = {
    overview: vi.fn(),
    listTasks: vi.fn(),
    createTask: vi.fn(),
    readyTask: vi.fn(),
    startTask: vi.fn(),
    uploadFile: vi.fn(),
    loadFile: vi.fn(),
    previewFile: vi.fn(),
    approveFile: vi.fn(),
    rejectFile: vi.fn(),
    loadOperations: vi.fn(),
    cancelWorkflow: vi.fn(),
    listApprovals: vi.fn(),
    loadApproval: vi.fn(),
    decideApproval: vi.fn(),
    listEmployees: vi.fn(),
    loadEmployee: vi.fn(),
    listAudit: vi.fn(),
  };

  it("renders Social Token: OK green badge when accounts are healthy", async () => {
    const mockMarketingApi = {
      getSocialTokensStatus: vi.fn().mockResolvedValue({
        accounts: [
          {
            platform: "facebook",
            accountId: "page-1",
            accountName: "OpenDX Shop",
            status: "valid",
            expiresAt: null,
            daysRemaining: null,
            tokenPreview: "EAAB...cd12",
            lastCheckedAt: "2026-09-10T00:00:00.000Z",
            lastError: null,
            requiresAction: false,
            actionType: "none",
            message: "Permanent token active",
          },
        ],
        hasExpiringOrInvalid: false,
        urgentActionRequired: false,
        checkedAt: "2026-09-10T00:00:00.000Z",
      }),
      refreshSocialToken: vi.fn(),
      exchangeSocialOAuthCode: vi.fn(),
      checkSocialTokens: vi.fn(),
    };

    render(
      <AuthProvider client={authClient as any}>
        <MemoryRouter>
          <AgenticCommandCenter api={fakeApi as any} marketingApi={mockMarketingApi as any} />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByRole("button", { name: /Social Token Health Status/i })).toBeInTheDocument();
    expect(screen.getByText(/Social Token: OK/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders warning badge and proactive alert card with 1-click auto-renew button when token is expiring soon", async () => {
    const user = userEvent.setup();
    const mockMarketingApi = {
      getSocialTokensStatus: vi.fn().mockResolvedValue({
        accounts: [
          {
            platform: "facebook",
            accountId: "page-1",
            accountName: "OpenDX Fanpage",
            status: "expiring_soon",
            expiresAt: "2026-09-15T00:00:00.000Z",
            daysRemaining: 5,
            tokenPreview: "EAAB...ef34",
            lastCheckedAt: "2026-09-10T00:00:00.000Z",
            lastError: null,
            requiresAction: true,
            actionType: "auto_refresh",
            message: "Token expires in 5 days, auto-renewal recommended",
          },
        ],
        hasExpiringOrInvalid: true,
        urgentActionRequired: false,
        checkedAt: "2026-09-10T00:00:00.000Z",
      }),
      refreshSocialToken: vi.fn().mockResolvedValue({
        platform: "facebook",
        accountId: "page-1",
        accountName: "OpenDX Fanpage",
        status: "valid",
        expiresAt: null,
        daysRemaining: null,
        tokenPreview: "EAAB...renewed",
        lastCheckedAt: "2026-09-10T00:00:00.000Z",
        lastError: null,
        requiresAction: false,
        actionType: "none",
        message: "Successfully auto-renewed token",
      }),
      exchangeSocialOAuthCode: vi.fn(),
      checkSocialTokens: vi.fn(),
    };

    render(
      <AuthProvider client={authClient as any}>
        <MemoryRouter>
          <AgenticCommandCenter api={fakeApi as any} marketingApi={mockMarketingApi as any} />
        </MemoryRouter>
      </AuthProvider>,
    );

    // Header badge
    expect(await screen.findByText(/⚡ Token FB hết hạn sau 5 ngày/i)).toBeInTheDocument();

    // Proactive Alert Card in Marketing Column
    expect(screen.getByText(/⚡ Token Facebook sắp hết hạn \(5 ngày\)/i)).toBeInTheDocument();
    expect(screen.getByText(/OpenDX Fanpage/i)).toBeInTheDocument();

    // 1-Click Auto-Renew Button
    const renewBtn = screen.getByRole("button", { name: /Tự động Gia hạn ngay/i });
    expect(renewBtn).toBeInTheDocument();

    // Click Auto-Renew: Zero copy-paste!
    await user.click(renewBtn);

    expect(mockMarketingApi.refreshSocialToken).toHaveBeenCalledWith({
      platform: "facebook",
      accountId: "page-1",
    });
  });

  it("renders danger badge and alert card with 1-click reconnect button when token is expired or invalid", async () => {
    const mockMarketingApi = {
      getSocialTokensStatus: vi.fn().mockResolvedValue({
        accounts: [
          {
            platform: "facebook",
            accountId: "page-1",
            accountName: "OpenDX Fanpage",
            status: "expired",
            expiresAt: "2026-09-01T00:00:00.000Z",
            daysRemaining: 0,
            tokenPreview: "EAAB...dead",
            lastCheckedAt: "2026-09-10T00:00:00.000Z",
            lastError: "Session expired (Error code 190). OAuth re-authorization required.",
            requiresAction: true,
            actionType: "oauth_reconnect",
            message: "Token expired. Please reconnect.",
          },
        ],
        hasExpiringOrInvalid: true,
        urgentActionRequired: true,
        checkedAt: "2026-09-10T00:00:00.000Z",
      }),
      refreshSocialToken: vi.fn(),
      exchangeSocialOAuthCode: vi.fn(),
      checkSocialTokens: vi.fn(),
    };

    render(
      <AuthProvider client={authClient as any}>
        <MemoryRouter>
          <AgenticCommandCenter api={fakeApi as any} marketingApi={mockMarketingApi as any} />
        </MemoryRouter>
      </AuthProvider>,
    );

    // Danger Header Badge
    expect(await screen.findByText(/🚨 Token FB lỗi \/ hết hạn/i)).toBeInTheDocument();

    // Danger Alert Card
    expect(screen.getByText(/🚨 Token Facebook đã hết hạn \/ lỗi/i)).toBeInTheDocument();
    expect(screen.getByText(/Session expired/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1-Click Kết nối lại/i })).toBeInTheDocument();
  });

  it("opens SocialTokenManagerModal when header badge or detail button is clicked, and performs on-demand check", async () => {
    const user = userEvent.setup();
    const mockMarketingApi = {
      getSocialTokensStatus: vi.fn().mockResolvedValue({
        accounts: [
          {
            platform: "facebook",
            accountId: "page-1",
            accountName: "OpenDX Fanpage",
            status: "valid",
            expiresAt: null,
            daysRemaining: null,
            tokenPreview: "EAAB...cd12",
            lastCheckedAt: "2026-09-10T00:00:00.000Z",
            lastError: null,
            requiresAction: false,
            actionType: "none",
            message: "Permanent token active",
          },
          {
            platform: "instagram",
            accountId: "ig-1",
            accountName: "OpenDX Instagram",
            status: "valid",
            expiresAt: null,
            daysRemaining: null,
            tokenPreview: "EAAB...ig99",
            lastCheckedAt: "2026-09-10T00:00:00.000Z",
            lastError: null,
            requiresAction: false,
            actionType: "none",
            message: "Linked to FB Page",
          },
        ],
        hasExpiringOrInvalid: false,
        urgentActionRequired: false,
        checkedAt: "2026-09-10T00:00:00.000Z",
      }),
      refreshSocialToken: vi.fn(),
      exchangeSocialOAuthCode: vi.fn(),
      checkSocialTokens: vi.fn().mockResolvedValue({
        accounts: [],
        hasExpiringOrInvalid: false,
        urgentActionRequired: false,
        checkedAt: "2026-09-10T00:05:00.000Z",
      }),
    };

    render(
      <AuthProvider client={authClient as any}>
        <MemoryRouter>
          <AgenticCommandCenter api={fakeApi as any} marketingApi={mockMarketingApi as any} />
        </MemoryRouter>
      </AuthProvider>,
    );

    const badge = await screen.findByRole("button", { name: /Social Token Health Status/i });
    await user.click(badge);

    // Modal is now open
    expect(await screen.findByRole("heading", { name: /Giám sát & Tự động Quản lý Social Tokens/i })).toBeInTheDocument();
    expect(screen.getByText(/ID: page-1/i)).toBeInTheDocument();
    expect(screen.getByText(/ID: ig-1/i)).toBeInTheDocument();
    expect(screen.getByText(/EAAB...cd12/i)).toBeInTheDocument();
    expect(screen.getByText(/EAAB...ig99/i)).toBeInTheDocument();

    // Trigger on-demand check in modal
    const checkBtn = screen.getByRole("button", { name: /Kiểm tra sức khỏe ngay/i });
    await user.click(checkBtn);

    expect(mockMarketingApi.checkSocialTokens).toHaveBeenCalled();

    // Close modal
    const closeBtn = screen.getByRole("button", { name: /Đóng cửa sổ/i });
    await user.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /Giám sát & Tự động Quản lý Social Tokens/i })).not.toBeInTheDocument();
    });
  });
});
