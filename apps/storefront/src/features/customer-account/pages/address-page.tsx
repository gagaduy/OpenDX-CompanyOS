// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { useCustomerSession } from "../../authentication/hooks/customer-session-context";
import type { CustomerAccountApi } from "../api/customer-account-api";
import { AccountWorkspace } from "../components/account-workspace";
import { AddressForm } from "../components/address-form";
import { AddressList } from "../components/address-list";
import { useCustomerAccount } from "../hooks/use-customer-account";

export function AddressPage({ api }: { readonly api: CustomerAccountApi }) {
  const account = useCustomerAccount(api);
  const { logout } = useCustomerSession();
  const [mutationError, setMutationError] = useState<string>();
  const run = async (operation: () => Promise<unknown>): Promise<boolean> => {
    try {
      await operation();
      await account.reload();
      setMutationError(undefined);
      return true;
    } catch {
      setMutationError(
        "Không thể lưu thay đổi. Dữ liệu nhập vẫn được giữ để bạn sửa.",
      );
      return false;
    }
  };
  if (account.loading && account.profile === undefined) {
    return (
      <main id="main-content" className="content-page">
        <p role="status" className="state-panel">
          Đang tải địa chỉ...
        </p>
      </main>
    );
  }
  if (account.profile === undefined) {
    return (
      <main id="main-content" className="content-page">
        <p role="alert" className="state-panel">
          {account.error}
        </p>
      </main>
    );
  }
  return (
    <AccountWorkspace
      profile={account.profile}
      active="addresses"
      onLogout={() => void logout()}
    >
      {(account.error ?? mutationError) && (
        <p role="alert" className="inline-alert">
          {account.error ?? mutationError}
        </p>
      )}
      <section className="account-section account-profile-section">
        <header className="account-section-heading">
          <h2>Thêm địa chỉ</h2>
          <p>Lưu thông tin người nhận cho những lần mua sắm tiếp theo.</p>
        </header>
        <AddressForm
          disabled={account.loading}
          onSubmit={(input) => run(() => api.createAddress(input))}
        />
      </section>
      <section className="account-section">
        <header className="account-section-heading">
          <h2>Địa chỉ đã lưu</h2>
          <p>{account.addresses.length} địa chỉ trong tài khoản.</p>
        </header>
        <AddressList
          addresses={account.addresses}
          disabled={account.loading}
          onDefault={(id) => void run(() => api.setDefault(id))}
          onRemove={(id) => void run(() => api.removeAddress(id))}
          onUpdate={(id, input) => void run(() => api.updateAddress(id, input))}
        />
      </section>
    </AccountWorkspace>
  );
}
