// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Boxes, Eye, PackagePlus, SlidersHorizontal } from "lucide-react";
import type { InventoryItemView } from "../types/inventory.types";

export function InventoryTable({ items, canWrite, onView, onReceive, onAdjust }: {
  readonly items: readonly InventoryItemView[];
  readonly canWrite: boolean;
  readonly onView: (item: InventoryItemView) => void;
  readonly onReceive: (item: InventoryItemView) => void;
  readonly onAdjust: (item: InventoryItemView) => void;
}) {
  return <div className="tableFrame"><table className="inventoryTable"><thead><tr><th>Product</th><th>SKU</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Status</th><th><span className="srOnly">Actions</span></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}>
    <td data-label="Product"><div className="productIdentity"><span className="thumbnail"><Boxes size={16} aria-hidden="true" /></span><span><strong>{item.productName}</strong><small>{item.variantTitle}{item.categoryName ? ` · ${item.categoryName}` : ""}</small></span></div></td>
    <td data-label="SKU"><strong>{item.sku}</strong></td><td data-label="On hand">{item.onHand}</td><td data-label="Reserved">{item.reserved}</td><td data-label="Available"><strong>{item.available} available</strong></td>
    <td data-label="Status"><span className={`status inventoryStatus status-${item.stockStatus}`} aria-label={`Stock status: ${statusLabel(item.stockStatus)}`}><PackageStatus status={item.stockStatus} />{statusLabel(item.stockStatus)}</span></td>
    <td data-label="Actions"><div className="rowActions"><button type="button" aria-label={`View ${item.sku}`} title="View movements" onClick={() => onView(item)}><Eye size={15} /></button>{canWrite && <><button type="button" aria-label={`Receive ${item.sku}`} title="Receive stock" onClick={() => onReceive(item)}><PackagePlus size={15} /></button><button type="button" aria-label={`Adjust ${item.sku}`} title="Adjust stock" onClick={() => onAdjust(item)}><SlidersHorizontal size={15} /></button></>}</div></td>
  </tr>)}</tbody></table></div>;
}

function PackageStatus({ status }: { readonly status: InventoryItemView["stockStatus"] }) {
  return status === "out_of_stock" ? <span aria-hidden="true">×</span> : status === "low" ? <span aria-hidden="true">!</span> : <span aria-hidden="true">✓</span>;
}
function statusLabel(status: InventoryItemView["stockStatus"]): string {
  return status === "out_of_stock" ? "Out of stock" : status === "low" ? "Low stock" : "Healthy";
}
