// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, type FormEvent } from "react";
import type { InventoryItemView } from "../types/inventory.types";

export type StockMutation =
  | { readonly mode: "receive"; readonly quantity: number }
  | { readonly mode: "adjust"; readonly delta: number; readonly reason: string };

export function StockMutationDialog({ item, mode, pending, serverError, onCancel, onSubmit }: {
  readonly item: InventoryItemView; readonly mode: "receive" | "adjust"; readonly pending: boolean;
  readonly serverError?: string; readonly onCancel: () => void; readonly onSubmit: (mutation: StockMutation) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState<string>();
  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = Number(quantity);
    if (!Number.isSafeInteger(parsed) || parsed === 0 || (mode === "receive" && parsed < 1)) {
      setValidation(mode === "receive" ? "Quantity must be a positive whole number." : "Quantity change must be a non-zero whole number."); return;
    }
    if (mode === "adjust" && reason.trim().length === 0) { setValidation("Reason is required."); return; }
    setValidation(undefined);
    await onSubmit(mode === "receive" ? { mode, quantity: parsed } : { mode, delta: parsed, reason: reason.trim() });
  }
  return <div className="dialogBackdrop" role="presentation"><form className="confirmDialog stockDialog" role="dialog" aria-modal="true" aria-labelledby="stock-dialog-title" onSubmit={(event) => void submit(event)}>
    <h2 id="stock-dialog-title">{mode === "receive" ? "Receive stock" : "Adjust stock"}</h2><p>{item.productName} · {item.sku}</p>
    <label>{mode === "receive" ? "Quantity received" : "Quantity change"}<input autoFocus type="number" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
    {mode === "adjust" && <label>Reason<textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>}
    {(validation || serverError) && <p role="alert" className="formError">{validation ?? serverError}</p>}
    <div><button className="secondaryButton" type="button" onClick={onCancel}>Cancel</button><button className="primaryButton" type="submit" disabled={pending}>{pending ? "Saving…" : mode === "receive" ? "Receive stock" : "Save adjustment"}</button></div>
  </form></div>;
}
