// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { LiveChatWidget } from "../components/live-chat-widget";
import * as livechatApi from "../api/livechat-api";

vi.mock("../api/livechat-api", () => ({
  initLivechatSession: vi.fn(),
  getLivechatSession: vi.fn(),
  sendLivechatMessage: vi.fn(),
  subscribeLivechatEvents: vi.fn(() => () => {}),
}));

describe("LiveChatWidget - Voucher Card & Realtime Rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("renders voucher card when message contains voucher syntax and copies code on click", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("novacommerce_livechat_session_id", "session-123");

    vi.mocked(livechatApi.getLivechatSession).mockResolvedValueOnce({
      sessionId: "session-123",
      ticketId: "ticket-123",
      customerId: "cust-123",
      customerName: "Nguyen Van A",
      customerEmail: "nguyen@example.com",
      messages: [
        {
          id: "msg-1",
          authorId: "support-ai",
          body: "Chúng tôi gửi tặng bạn mã giảm giá:\n🎁 [VOUCHER:PROMO50:Giảm 50.000đ cho đơn hàng tiếp theo]",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: writeTextMock,
      },
      configurable: true,
      writable: true,
    });

    render(<LiveChatWidget />);

    const trigger = screen.getByRole("button", { name: /hỗ trợ trực tuyến/i });
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Mã ưu đãi đặc biệt")).toBeInTheDocument();
      expect(screen.getByText("PROMO50")).toBeInTheDocument();
      expect(screen.getByText("Giảm 50.000đ cho đơn hàng tiếp theo")).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole("button", { name: /sao chép mã/i });
    await user.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith("PROMO50");
    await waitFor(() => {
      expect(screen.getByText("✓ Đã chép")).toBeInTheDocument();
    });
  });
});
