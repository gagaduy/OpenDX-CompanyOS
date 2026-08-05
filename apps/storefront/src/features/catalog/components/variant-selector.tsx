// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StorefrontVariant } from "../types/catalog.types";
export function VariantSelector({ variants, selectedId, onSelect }: { readonly variants: readonly StorefrontVariant[]; readonly selectedId: string; readonly onSelect: (id: string) => void }) { return <fieldset className="variant-selector"><legend>Phiên bản</legend>{variants.map((variant) => <button type="button" key={variant.id} className={variant.id === selectedId ? "variant-option selected" : "variant-option"} aria-pressed={variant.id === selectedId} onClick={() => onSelect(variant.id)}><strong>{variant.title}</strong><span>{variant.purchasable ? `${variant.availableQuantity} sản phẩm` : "Hết hàng"}</span></button>)}</fieldset>; }
