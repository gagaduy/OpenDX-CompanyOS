// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import type { ProductPrice, ProductVariant } from "../types/catalog.types";

export function PriceEditor({ variant, currentPrice, onReplace }: { readonly variant: ProductVariant; readonly currentPrice?: ProductPrice; readonly onReplace: (amountMinor: number) => Promise<void> }) {
  const [amount, setAmount] = useState(""); const [confirming, setConfirming] = useState(false); const numeric = Number(amount);
  return <div className="priceEditor"><label>VND price for {variant.sku}<input aria-label={`VND price for ${variant.sku}`} inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} /></label><span>{Number.isSafeInteger(numeric) && numeric > 0 ? formatVnd(numeric) : currentPrice ? formatVnd(currentPrice.amountMinor) : "Not priced"}</span><button className="secondaryButton" type="button" disabled={!Number.isSafeInteger(numeric) || numeric <= 0} onClick={() => setConfirming(true)}>Replace price</button>{confirming && <div className="inlineConfirm"><p>Replace the current price? Price history will remain immutable.</p><button className="secondaryButton" type="button" onClick={() => setConfirming(false)}>Cancel</button><button className="primaryButton" type="button" onClick={() => void onReplace(numeric).then(() => setConfirming(false))}>Confirm replacement</button></div>}</div>;
}
function formatVnd(amount: number) { return `₫${new Intl.NumberFormat("en-US").format(amount)}`; }
