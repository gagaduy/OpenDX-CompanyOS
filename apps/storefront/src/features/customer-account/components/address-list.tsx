// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Check, Pencil, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import type {
  AddressInput,
  CustomerAddress,
} from "../types/customer-account.types";

export function AddressList({
  addresses,
  disabled,
  onDefault,
  onRemove,
  onUpdate,
}: {
  readonly addresses: readonly CustomerAddress[];
  readonly disabled: boolean;
  readonly onDefault: (id: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onUpdate: (
    id: string,
    value: AddressInput & { version: number },
  ) => void;
}) {
  if (addresses.length === 0)
    return <p className="state-panel compact">Chưa có địa chỉ.</p>;
  return (
    <div className="address-list">
      {addresses.map((address) => (
        <article className="address-item" key={address.id}>
          <div className="address-copy">
            <h2>
              {address.recipientName}
              {address.isDefault && (
                <span className="status-badge">Mặc định</span>
              )}
            </h2>
            <p>{address.phoneNumber}</p>
            <p>
              {address.addressLine}, {address.ward}, {address.provinceOrCity}
            </p>
            <details>
              <summary>
                <Pencil /> Chỉnh sửa
              </summary>
              <EditAddressForm
                address={address}
                disabled={disabled}
                onSubmit={(value) => onUpdate(address.id, value)}
              />
            </details>
          </div>
          <div className="address-actions">
            <button
              className="icon-button"
              title="Đặt làm mặc định"
              aria-label={`Đặt địa chỉ ${address.recipientName} làm mặc định`}
              disabled={disabled || address.isDefault}
              onClick={() => onDefault(address.id)}
            >
              <Check />
            </button>
            <button
              className="icon-button"
              title="Xóa địa chỉ"
              aria-label={`Xóa địa chỉ ${address.recipientName}`}
              disabled={disabled}
              onClick={() => {
                if (window.confirm(`Xóa địa chỉ của ${address.recipientName}?`))
                  onRemove(address.id);
              }}
            >
              <Trash2 />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function EditAddressForm({
  address,
  disabled,
  onSubmit,
}: {
  readonly address: CustomerAddress;
  readonly disabled: boolean;
  readonly onSubmit: (value: AddressInput & { version: number }) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = (key: string) => String(form.get(key) ?? "").trim();
    const postalCode = get("postalCode"),
      deliveryNote = get("deliveryNote");
    onSubmit({
      recipientName: get("recipientName"),
      phoneNumber: get("phoneNumber"),
      addressLine: get("addressLine"),
      ward: get("ward"),
      provinceOrCity: get("provinceOrCity"),
      ...(postalCode ? { postalCode } : {}),
      ...(deliveryNote ? { deliveryNote } : {}),
      version: address.version,
    });
  };
  return (
    <form className="address-form edit-address-form" onSubmit={submit}>
      <label>
        Người nhận
        <input
          required
          name="recipientName"
          defaultValue={address.recipientName}
        />
      </label>
      <label>
        Số điện thoại
        <input required name="phoneNumber" defaultValue={address.phoneNumber} />
      </label>
      <label className="wide">
        Địa chỉ
        <input required name="addressLine" defaultValue={address.addressLine} />
      </label>
      <label>
        Phường / xã
        <input required name="ward" defaultValue={address.ward} />
      </label>
      <label>
        Tỉnh / thành phố
        <input
          required
          name="provinceOrCity"
          defaultValue={address.provinceOrCity}
        />
      </label>
      <label>
        Mã bưu chính
        <input name="postalCode" defaultValue={address.postalCode ?? ""} />
      </label>
      <label className="wide">
        Ghi chú
        <input name="deliveryNote" defaultValue={address.deliveryNote ?? ""} />
      </label>
      <button className="button primary" disabled={disabled}>
        Lưu địa chỉ
      </button>
    </form>
  );
}
