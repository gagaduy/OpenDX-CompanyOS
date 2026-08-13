// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { InventoryApi } from "../api/inventory-api";
import type { InventoryItemView, InventoryMovementView, InventoryPageView } from "../types/inventory.types";

export function InventoryDetailPanel({ api, item, onClose }: { readonly api: InventoryApi; readonly item: InventoryItemView; readonly onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InventoryPageView<InventoryMovementView>>();
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    api.listMovements(item.id, page, 20, controller.signal).then(setData).catch((reason: unknown) => {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(true);
    });
    return () => controller.abort();
  }, [api, item.id, page]);
  return <section className="inventoryDetail" aria-label={`Inventory detail for ${item.sku}`}>
    <header><div><p className="sectionKicker">{item.sku}</p><h2>Movement history</h2></div><button type="button" aria-label="Close inventory detail" onClick={onClose}><X size={17} /></button></header>
    <dl className="balanceSummary"><div><dt>On hand</dt><dd>{item.onHand}</dd></div><div><dt>Reserved</dt><dd>{item.reserved}</dd></div><div><dt>Available</dt><dd>{item.available}</dd></div></dl>
    {error ? <p role="alert" className="formError">Movement history could not be loaded.</p> : data === undefined ? <p className="inlineError">Loading movements…</p> : data.items.length === 0 ? <p className="inlineError">No movements recorded.</p> : <ul className="movementList">{data.items.map((movement) => <li key={movement.id}><span><strong>{movement.reasonCode}</strong><small>{movement.movementType} · {movement.actorId}</small></span><span>{signed(movement.onHandDelta)} on hand<br />{signed(movement.reservedDelta)} reserved</span></li>)}</ul>}
    {data && data.totalPages > 1 && <div className="pagination"><button className="secondaryButton" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page}</span><button className="secondaryButton" type="button" disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
  </section>;
}
function signed(value: number): string { return value > 0 ? `+${value}` : String(value); }
