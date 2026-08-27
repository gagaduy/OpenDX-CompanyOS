// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, type KeyboardEvent } from "react";
import { formatVnd } from "../../../shared/format/currency";
import type { StorefrontCart } from "../types/cart.types";

export function CartResolutionDialog({
  busy,
  guestCart,
  savedCart,
  onResolve,
}: {
  readonly busy: boolean;
  readonly guestCart?: StorefrontCart;
  readonly savedCart?: StorefrontCart;
  readonly onResolve: (action: "keep_guest" | "keep_saved" | "merge") => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
    return () => previous?.focus();
  }, []);
  const trap = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab" || dialog.current === null) return;
    const controls = [
      ...dialog.current.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ),
    ];
    if (controls.length === 0) return;
    const first = controls[0]!,
      last = controls.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <dialog
      ref={dialog}
      open
      className="resolution-dialog transaction-dialog"
      aria-labelledby="resolution-title"
      onKeyDown={trap}
    >
      <h2 id="resolution-title">Chọn giỏ hàng</h2>
      <p>
        Giỏ hàng vừa dùng và giỏ hàng đã lưu đều có sản phẩm. Chọn cách tiếp
        tục.
      </p>
      <dl className="resolution-summary">
        <div>
          <dt>Giỏ hiện tại</dt>
          <dd>
            {guestCart?.itemCount ?? 0} sản phẩm ·{" "}
            {formatVnd(guestCart?.totalVnd ?? 0)}
          </dd>
        </div>
        <div>
          <dt>Giỏ đã lưu</dt>
          <dd>
            {savedCart?.itemCount ?? 0} sản phẩm ·{" "}
            {formatVnd(savedCart?.totalVnd ?? 0)}
          </dd>
        </div>
      </dl>
      <div>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => onResolve("keep_saved")}
        >
          Giữ giỏ đã lưu
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => onResolve("keep_guest")}
        >
          Giữ giỏ hiện tại
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => onResolve("merge")}
        >
          Gộp hai giỏ
        </button>
      </div>
    </dialog>
  );
}
