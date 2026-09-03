// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface LivechatMessageItem {
  readonly id: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface LivechatSessionData {
  readonly sessionId: string;
  readonly ticketId: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly messages: readonly LivechatMessageItem[];
}

export async function initLivechatSession(
  baseUrl: string,
  input: { email: string; fullName: string; message?: string },
): Promise<LivechatSessionData> {
  const response = await fetch(`${baseUrl}/v1/public/support/livechat/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Không thể khởi tạo phiên trò chuyện");
  }

  const json = await response.json();
  return json.session;
}

export async function getLivechatSession(
  baseUrl: string,
  sessionId: string,
): Promise<LivechatSessionData> {
  const response = await fetch(`${baseUrl}/v1/public/support/livechat/${sessionId}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Không thể tải phiên trò chuyện");
  }

  const json = await response.json();
  return json.session;
}

export async function sendLivechatMessage(
  baseUrl: string,
  sessionId: string,
  body: string,
): Promise<LivechatMessageItem> {
  const response = await fetch(`${baseUrl}/v1/public/support/livechat/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Không thể gửi tin nhắn");
  }

  const json = await response.json();
  return json.message;
}

export function subscribeLivechatEvents(
  baseUrl: string,
  sessionId: string,
  onEvent: (event: any) => void,
): () => void {
  const eventSource = new EventSource(`${baseUrl}/v1/public/support/livechat/${sessionId}/events`);

  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onEvent(data);
    } catch {
      // ignore parse error on heartbeat
    }
  };

  eventSource.onerror = () => {
    // EventSource automatically retries connection
  };

  return () => {
    eventSource.close();
  };
}
