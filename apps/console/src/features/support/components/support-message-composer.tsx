// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { FormEvent, useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { ComingSoonControl } from "../../../shared/components/coming-soon-control";

export function SupportMessageComposer({
  onSend,
  pending,
  onDraftAi,
}: {
  readonly onSend: (body: string) => Promise<void>;
  readonly pending: boolean;
  readonly onDraftAi?: () => Promise<string>;
}) {
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const trimmedBody = body.trim();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedBody || pending) return;
    try {
      await onSend(trimmedBody);
      setBody("");
    } catch {
      // The owner renders the retryable error; retain the draft for correction.
    }
  };

  const handleDraftAi = async () => {
    if (!onDraftAi || drafting || pending) return;
    setDrafting(true);
    try {
      const draft = await onDraftAi();
      if (draft) {
        setBody(draft);
      }
    } catch (err) {
      console.error("Failed to generate AI draft reply:", err);
    } finally {
      setDrafting(false);
    }
  };

  return (
    <form className="supportMessageComposer" onSubmit={(event) => void submit(event)}>
      <label>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <span>Reply</span>
          {onDraftAi && (
            <button
              type="button"
              className="secondaryButton"
              disabled={pending || drafting}
              onClick={() => void handleDraftAi()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                padding: "3px 10px",
                cursor: drafting ? "not-allowed" : "pointer",
              }}
              title="Sử dụng OpenRouter AI để tự động soạn câu trả lời mẫu theo ngữ cảnh"
            >
              {drafting ? (
                <>
                  <RefreshCw size={12} className="livechat-spin" />
                  <span>AI đang soạn thảo...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} style={{ color: "var(--primary, #5e6ad2)" }} />
                  <span>✨ Gợi ý trả lời AI</span>
                </>
              )}
            </button>
          )}
        </div>
        <textarea
          aria-label="Reply"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a customer-facing reply…"
          rows={5}
        />
      </label>
      <div className="dialogActions">
        <ComingSoonControl label="Internal note" />
        <button className="primaryButton" type="submit" disabled={pending || !trimmedBody}>
          {pending ? "Sending…" : "Send reply"}
        </button>
      </div>
    </form>
  );
}
