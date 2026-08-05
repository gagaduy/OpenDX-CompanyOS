// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { FormEvent } from "react";
import type { AddressInput } from "../types/customer-account.types";

export function AddressForm({ disabled, onSubmit }: { readonly disabled: boolean; readonly onSubmit: (value: AddressInput) => Promise<boolean> }) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element); const get = (key: string) => String(form.get(key) ?? "").trim(); const postalCode = get("postalCode"), deliveryNote = get("deliveryNote");
    const saved = await onSubmit({ recipientName: get("recipientName"), phoneNumber: get("phoneNumber"), addressLine: get("addressLine"), ward: get("ward"), provinceOrCity: get("provinceOrCity"), ...(postalCode ? { postalCode } : {}), ...(deliveryNote ? { deliveryNote } : {}) }); if (saved) element.reset();
  };
  return <form className="address-form" onSubmit={(event) => void submit(event)}><label>Người nhận<input required name="recipientName" maxLength={120} /></label><label>Số điện thoại<input required name="phoneNumber" maxLength={30} /></label><label className="wide">Địa chỉ<input required name="addressLine" maxLength={300} /></label><label>Phường / xã<input required name="ward" maxLength={120} /></label><label>Tỉnh / thành phố<input required name="provinceOrCity" maxLength={120} /></label><label>Mã bưu chính<input name="postalCode" maxLength={20} /></label><label className="wide">Ghi chú giao hàng<input name="deliveryNote" maxLength={500} /></label><button className="button primary" disabled={disabled}>Thêm địa chỉ</button></form>;
}
