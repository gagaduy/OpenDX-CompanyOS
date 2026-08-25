// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { FormEvent, useState } from "react";
import { ComingSoonControl } from "../../../shared/components/coming-soon-control";

export function SupportMessageComposer({
  onSend,
  pending,
}: {
  readonly onSend: (body: string) => Promise<void>;
  readonly pending: boolean;
}) {
  const [body, setBody] = useState("");
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

  return (
    <form className="supportMessageComposer" onSubmit={(event) => void submit(event)}>
      <label>
        <span>Reply</span>
        <textarea
          aria-label="Reply"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a customer-facing reply…"
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
