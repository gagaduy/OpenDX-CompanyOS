// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AiLivechatAssistantService } from "./ai-livechat-assistant.service";

describe("AiLivechatAssistantService", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns fallback reply when OpenRouter API key is missing or call fails", async () => {
    const service = new AiLivechatAssistantService({});
    const result = await service.generateReply({
      customerName: "Anh Phương",
      currentMessage: "Tôi muốn hỏi cách kết nối máy PS5",
    });

    expect(result.reply).toBeDefined();
    expect(result.reply).toContain("Anh Phương");
    expect(result.isCritical).toBe(false);
  });

  it("detects critical issues and flags isCritical = true", async () => {
    const service = new AiLivechatAssistantService({});
    const result = await service.generateReply({
      customerName: "Anh Phương",
      currentMessage: "Máy bị cháy nổ và bốc khói, yêu cầu hoàn tiền gấp!",
    });

    expect(result.isCritical).toBe(true);
  });

  it("calls OpenRouter API and parses generated content", async () => {
    const mockReply = "Chào bạn, để kết nối PS5 với màn hình, bạn hãy dùng dây HDMI 2.1 đi kèm máy cắm vào cổng HDMI ARC trên TV nhé!";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: mockReply,
            },
          },
        ],
      }),
    } as any);

    const service = new AiLivechatAssistantService({ openRouterApiKey: "test-api-key" });
    const result = await service.generateReply({
      customerName: "Phương",
      currentMessage: "Làm sao cắm PS5 vô TV?",
    });

    expect(result.reply).toBe(mockReply);
    expect(result.isCritical).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
