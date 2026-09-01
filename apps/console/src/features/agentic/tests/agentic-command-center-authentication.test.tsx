// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthClient } from "../../authentication/api/oidc-manager";
import { AuthProvider } from "../../authentication/hooks/auth-context";
import type { AgenticOperationsApi } from "../api/agentic-api";
import { AgenticCommandCenter } from "../components/agentic-command-center";

describe("AgenticCommandCenter authentication recovery", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts a new sign-in when an expired session is reported", async () => {
    vi.useFakeTimers();
    const authClient = fakeAuthClient();
    const api = fakeAgenticApi();
    vi.mocked(api.createTask).mockRejectedValue(new Error("Authentication required"));

    render(
      <AuthProvider client={authClient}>
        <MemoryRouter>
          <AgenticCommandCenter api={api} />
        </MemoryRouter>
      </AuthProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText(/Hãy giao việc chiến lược/), {
      target: { value: "Rà soát hoạt động công ty" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_300);
    });

    expect(screen.getByText(/Phiên đăng nhập đã hết hạn/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập lại" }));

    expect(authClient.signIn).toHaveBeenCalledOnce();
  });
});

function fakeAuthClient(): AuthClient {
  return {
    getSession: vi.fn(async () => null),
    signIn: vi.fn(async () => undefined),
    completeSignIn: vi.fn(),
    signOut: vi.fn(),
  };
}

function fakeAgenticApi(): AgenticOperationsApi {
  return {
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
}
