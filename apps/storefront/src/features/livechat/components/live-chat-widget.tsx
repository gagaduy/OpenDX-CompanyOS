// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { MessageSquare, X, Send, Bot, Sparkles, User, RefreshCw } from "lucide-react";
import {
  initLivechatSession,
  sendLivechatMessage,
  subscribeLivechatEvents,
  type LivechatMessageItem,
} from "../api/livechat-api";
import { useOptionalCustomerSession } from "../../authentication";

const SESSION_STORAGE_KEY = "novacommerce_livechat_session_id";

export function LiveChatWidget({
  apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001",
}: {
  readonly apiBaseUrl?: string;
}) {
  const session = useOptionalCustomerSession();
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
  });
  const [messages, setMessages] = useState<readonly LivechatMessageItem[]>([]);
  const [inputText, setInputText] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [initialQuery, setInitialQuery] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Pre-fill user profile if authenticated
  useEffect(() => {
    if (session && session.kind === "customer") {
      if (session.email) {
        setEmail(session.email);
        setFullName((prev) => prev || session.email.split("@")[0]);
      }
    }
  }, [session]);

  // Connect SSE when sessionId exists
  useEffect(() => {
    if (!sessionId) return;

    const unsubscribe = subscribeLivechatEvents(apiBaseUrl, sessionId, (event) => {
      if (event.type === "message_created" && event.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === event.message.id)) return prev;
          return [...prev, event.message];
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [apiBaseUrl, sessionId]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleStartChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setError("Vui lòng nhập địa chỉ email hợp lệ.");
      return;
    }

    setIsInitializing(true);
    setError(null);

    try {
      const data = await initLivechatSession(apiBaseUrl, {
        email,
        fullName: fullName || email.split("@")[0],
        message: initialQuery || undefined,
      });

      setSessionId(data.sessionId);
      sessionStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
      setMessages(data.messages);
      setInitialQuery("");
    } catch (err: any) {
      setError(err.message || "Không thể kết nối Live Chat.");
    } finally {
      setIsInitializing(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || !inputText.trim() || isSending) return;

    const textToSend = inputText.trim();
    setInputText("");
    setIsSending(true);

    try {
      const sentMsg = await sendLivechatMessage(apiBaseUrl, sessionId, textToSend);
      setMessages((prev) => {
        if (prev.some((m) => m.id === sentMsg.id)) return prev;
        return [...prev, sentMsg];
      });
    } catch (err: any) {
      setError(err.message || "Gửi tin nhắn thất bại.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="livechat-container">
      {/* Chat Window */}
      {isOpen && (
        <div className="livechat-window" role="dialog" aria-label="Khung trò chuyện trực tuyến">
          {/* Header */}
          <div className="livechat-header">
            <div className="livechat-header-info">
              <div className="livechat-avatar-wrapper">
                <Bot size={20} />
                <span className="livechat-avatar-badge" />
              </div>
              <div className="livechat-header-titles">
                <h3>
                  NovaCommerce LiveChat
                  <Sparkles size={14} color="#fcd34d" />
                </h3>
                <p>Trợ lý AI & CSKH trực tuyến 24/7</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="livechat-close-btn"
              title="Thu nhỏ cửa sổ"
              aria-label="Thu nhỏ cửa sổ"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="livechat-body">
            {!sessionId ? (
              <form onSubmit={handleStartChat} className="livechat-intro-card">
                <div className="livechat-intro-header">
                  <div className="livechat-intro-icon-box">
                    <MessageSquare size={24} />
                  </div>
                  <h4>Bắt đầu cuộc trò chuyện</h4>
                  <p>
                    Nhập thông tin để nhận hỗ trợ tức thì từ Trợ lý AI và chuyên viên CSKH NovaCommerce.
                  </p>
                </div>

                {error && <div className="livechat-error-banner">{error}</div>}

                <div className="livechat-field">
                  <label htmlFor="livechat-email">Email của bạn *</label>
                  <input
                    id="livechat-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tenban@gmail.com"
                    className="livechat-input"
                  />
                </div>

                <div className="livechat-field">
                  <label htmlFor="livechat-fullname">Họ và tên</label>
                  <input
                    id="livechat-fullname"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="livechat-input"
                  />
                </div>

                <div className="livechat-field">
                  <label htmlFor="livechat-message">Bạn cần hỗ trợ gì?</label>
                  <textarea
                    id="livechat-message"
                    rows={2}
                    value={initialQuery}
                    onChange={(e) => setInitialQuery(e.target.value)}
                    placeholder="Ví dụ: Hướng dẫn cắm dây HDMI, thông tin bảo hành máy..."
                    className="livechat-textarea"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isInitializing}
                  className="livechat-submit-btn"
                >
                  {isInitializing ? (
                    <>
                      <RefreshCw size={15} className="livechat-spin" />
                      Đang kết nối...
                    </>
                  ) : (
                    "Bắt đầu trò chuyện"
                  )}
                </button>
              </form>
            ) : (
              <>
                {/* Notice banner */}
                <div className="livechat-notice-banner">
                  <Sparkles size={16} />
                  <span>
                    Trợ lý AI đang trực tuyến giải đáp mọi câu hỏi. Chuyên viên CSKH sẵn sàng tiếp nhận khi có yêu cầu nâng cao.
                  </span>
                </div>

                {/* Message list */}
                {messages.length === 0 ? (
                  <div className="livechat-empty-state">
                    Chưa có tin nhắn nào. Hãy gửi lời chào nhé!
                  </div>
                ) : (
                  messages.map((m) => {
                    const isCustomer = m.authorId === "customer";
                    const isAi = m.authorId === "support-ai" || m.authorId === "support-ai-steward";

                    return (
                      <div
                        key={m.id}
                        className={`livechat-msg-row ${isCustomer ? "customer" : isAi ? "ai" : "staff"}`}
                      >
                        <div className="livechat-msg-meta">
                          {isCustomer ? (
                            <span className="livechat-author-badge customer">
                              Bạn <User size={11} />
                            </span>
                          ) : isAi ? (
                            <span className="livechat-author-badge ai">
                              <Bot size={12} /> Trợ lý AI
                            </span>
                          ) : (
                            <span className="livechat-author-badge staff">
                              <MessageSquare size={12} /> CSKH NovaCommerce
                            </span>
                          )}
                          <span>·</span>
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div
                          className={`livechat-bubble ${isCustomer ? "customer" : isAi ? "ai" : "staff"}`}
                        >
                          {m.body}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Footer Input */}
          {sessionId && (
            <form onSubmit={handleSendMessage} className="livechat-footer">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Nhập tin nhắn..."
                disabled={isSending}
                className="livechat-footer-input"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isSending}
                className="livechat-footer-send-btn"
                title="Gửi tin nhắn"
                aria-label="Gửi tin nhắn"
              >
                <Send size={15} />
              </button>
            </form>
          )}
        </div>
      )}

      {/* Floating Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="livechat-trigger"
        aria-label="Mở khung chat hỗ trợ trực tuyến"
      >
        <span className="livechat-pulse-indicator">
          <span className="livechat-pulse-ping" />
          <span className="livechat-pulse-dot" />
        </span>
        <MessageSquare size={18} />
        <span>Hỗ trợ trực tuyến</span>
      </button>
    </div>
  );
}
