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
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-3 w-96 max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-6rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden transition-all duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white p-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-white dark:border-slate-900 rounded-full animate-pulse" />
              </div>
              <div>
                <h3 className="font-semibold text-sm leading-tight flex items-center gap-1.5">
                  NovaCommerce LiveChat
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                </h3>
                <p className="text-xs text-blue-100 flex items-center gap-1">
                  Trợ lý AI & CSKH trực tuyến 24/7
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Đóng cửa sổ"
              aria-label="Đóng cửa sổ"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 dark:bg-slate-950">
            {!sessionId ? (
              <form onSubmit={handleStartChat} className="space-y-4 my-auto py-2">
                <div className="text-center mb-4">
                  <div className="inline-flex p-3 bg-blue-50 dark:bg-blue-950/50 rounded-full text-blue-600 dark:text-blue-400 mb-2">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <h4 className="font-medium text-slate-800 dark:text-slate-200 text-sm">
                    Bắt đầu cuộc trò chuyện
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Nhập thông tin để nhận phản hồi ngay từ Trợ lý AI và đội ngũ CSKH NovaCommerce.
                  </p>
                </div>

                {error && (
                  <div className="p-2.5 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 rounded-lg border border-red-200 dark:border-red-900">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Email của bạn *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tenban@gmail.com"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Họ và tên
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Bạn cần hỗ trợ gì?
                  </label>
                  <textarea
                    rows={2}
                    value={initialQuery}
                    onChange={(e) => setInitialQuery(e.target.value)}
                    placeholder="Ví dụ: Tư vấn bảo hành máy chơi game, tra cứu đơn hàng..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isInitializing}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg shadow transition-colors flex items-center justify-center gap-2"
                >
                  {isInitializing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
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
                <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl p-2.5 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 flex-shrink-0 text-blue-500 mt-0.5" />
                  <span>
                    Trợ lý AI đang sẵn sàng trả lời ngay. Nhân viên CSKH sẽ hỗ trợ khi cần thiết.
                  </span>
                </div>

                {/* Message list */}
                {messages.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    Chưa có tin nhắn nào. Hãy gửi lời chào nhé!
                  </div>
                ) : (
                  messages.map((m) => {
                    const isCustomer = m.authorId === "customer";
                    const isAi = m.authorId === "support-ai" || m.authorId === "support-ai-steward";

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isCustomer ? "items-end" : "items-start"}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-400 px-1">
                          {isCustomer ? (
                            <>
                              <span>Bạn</span>
                              <User className="w-3 h-3" />
                            </>
                          ) : isAi ? (
                            <>
                              <Bot className="w-3 h-3 text-indigo-500" />
                              <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                                Trợ lý AI
                              </span>
                            </>
                          ) : (
                            <>
                              <MessageSquare className="w-3 h-3 text-blue-500" />
                              <span className="text-blue-600 dark:text-blue-400 font-medium">
                                CSKH NovaCommerce
                              </span>
                            </>
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
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                            isCustomer
                              ? "bg-blue-600 text-white rounded-br-none"
                              : isAi
                              ? "bg-indigo-50 dark:bg-indigo-950/60 text-slate-800 dark:text-slate-100 border border-indigo-200 dark:border-indigo-900/60 rounded-bl-none shadow-sm"
                              : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-none shadow-sm"
                          }`}
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
            <form
              onSubmit={handleSendMessage}
              className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Nhập tin nhắn..."
                disabled={isSending}
                className="flex-1 px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isSending}
                className="p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl transition-colors flex-shrink-0"
                aria-label="Gửi tin nhắn"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      )}

      {/* Floating Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group relative flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200"
        aria-label="Mở khung chat hỗ trợ trực tuyến"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
        </span>
        <MessageSquare className="w-5 h-5" />
        <span className="text-sm font-medium pr-1">Hỗ trợ trực tuyến</span>
      </button>
    </div>
  );
}
