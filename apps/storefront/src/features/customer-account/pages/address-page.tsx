// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import type { CustomerAccountApi } from "../api/customer-account-api";
import { AddressForm } from "../components/address-form";
import { AddressList } from "../components/address-list";
import { useCustomerAccount } from "../hooks/use-customer-account";

export function AddressPage({ api }: { readonly api: CustomerAccountApi }) {
  const account = useCustomerAccount(api); const [mutationError, setMutationError] = useState<string>();
  const run = async (operation: () => Promise<unknown>): Promise<boolean> => { try { await operation(); await account.reload(); setMutationError(undefined); return true; } catch { setMutationError("Không thể lưu thay đổi. Dữ liệu nhập vẫn được giữ để bạn sửa."); return false; } };
  return <main id="main-content" className="content-page"><div className="page-heading"><div><span className="eyebrow">Tài khoản</span><h1>Địa chỉ</h1></div></div>{(account.error ?? mutationError) && <p role="alert" className="inline-alert">{account.error ?? mutationError}</p>}<section className="account-section"><h2>Thêm địa chỉ</h2><AddressForm disabled={account.loading} onSubmit={(input) => run(() => api.createAddress(input))} /></section><section className="account-section"><h2>Địa chỉ đã lưu</h2><AddressList addresses={account.addresses} disabled={account.loading} onDefault={(id) => void run(() => api.setDefault(id))} onRemove={(id) => void run(() => api.removeAddress(id))} onUpdate={(id, input) => void run(() => api.updateAddress(id, input))} /></section></main>;
}
