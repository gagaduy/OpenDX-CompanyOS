// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Check, X } from "lucide-react";
import { useState } from "react";
import type { Product, PublicationReadiness, PublicationRequirement } from "../types/catalog.types";

const requirements: readonly { readonly key: PublicationRequirement; readonly label: string }[] = [
  { key: "ACTIVE_CATEGORY", label: "Active category" },
  { key: "ACTIVE_VARIANT", label: "Active variant" },
  { key: "CURRENT_PRICE", label: "Current VND price" },
  { key: "PRIMARY_IMAGE", label: "Primary image with alt text" },
  { key: "INVENTORY_ITEM", label: "Initialized inventory" },
];

export function ProductStatus({ status, available }: { readonly status: Product["status"]; readonly available?: number }) {
  const label = status === "published" && available === 0
    ? "Published · Out of stock"
    : `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
  return <span className={`status status-${status}`}>{label}</span>;
}

export function PublicationPanel({ product, readiness, canPublish, pending = false, onPublish, onUnpublish }: {
  readonly product: Product;
  readonly readiness?: PublicationReadiness;
  readonly canPublish: boolean;
  readonly pending?: boolean;
  readonly onPublish: () => Promise<void>;
  readonly onUnpublish: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const missing = new Set(readiness?.missing ?? requirements.map(({ key }) => key));
  return <div className="editorPanel publicationPanel">
    <header><div><p className="sectionKicker">Storefront publication</p><h2>Publication readiness</h2></div><ProductStatus status={product.status} /></header>
    <p>Only products that meet every requirement can be published to the public storefront catalog.</p>
    <ul className="publicationChecklist">
      {requirements.map(({ key, label }) => <li key={key} className={missing.has(key) ? "requirementMissing" : "requirementReady"}>
        {missing.has(key) ? <X size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}<span>{label}</span>
      </li>)}
    </ul>
    {!canPublish && <p className="notice">Publication controls are available to Catalog Managers and Administrators.</p>}
    {canPublish && product.status === "draft" && <div className="publicationActions"><button className="primaryButton" type="button" disabled={!readiness?.ready || pending} onClick={() => void onPublish()}>Publish product</button></div>}
    {canPublish && product.status === "published" && !confirming && <div className="publicationActions"><button className="secondaryButton" type="button" disabled={pending} onClick={() => setConfirming(true)}>Unpublish product</button></div>}
    {canPublish && product.status === "published" && confirming && <div className="unpublishConfirmation" role="alert"><p>Unpublishing removes this product from storefront discovery but will keep its inventory and catalog data.</p><div><button className="secondaryButton" type="button" disabled={pending} onClick={() => setConfirming(false)}>Cancel</button><button className="dangerButton" type="button" disabled={pending} onClick={() => void onUnpublish().then(() => setConfirming(false))}>Confirm unpublish</button></div></div>}
  </div>;
}
