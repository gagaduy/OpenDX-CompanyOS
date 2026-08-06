// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useCustomerSession } from "../../authentication/hooks/customer-session-context";
import type { CustomerAccountApi } from "../api/customer-account-api";
import { ProfileForm } from "../components/profile-form";
import { AccountWorkspace } from "../components/account-workspace";
import { useCustomerAccount } from "../hooks/use-customer-account";

export function AccountPage({ api }: { readonly api: CustomerAccountApi }) {
  const account = useCustomerAccount(api);
  const { logout } = useCustomerSession();
  if (account.loading && account.profile === undefined) {
    return (
      <main id="main-content" className="content-page">
        <p role="status" className="state-panel">
          Đang tải tài khoản...
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
      active="profile"
      onLogout={() => void logout()}
    >
      {account.error && (
        <p role="alert" className="inline-alert">
          {account.error}
        </p>
      )}
      <section className="account-section account-profile-section">
        <header className="account-section-heading">
          <h2>Thông tin cá nhân</h2>
          <p>Cập nhật thông tin liên hệ được sử dụng cho tài khoản.</p>
        </header>
        <ProfileForm
          profile={account.profile}
          disabled={account.loading}
          onSubmit={account.saveProfile}
        />
      </section>
      <section className="account-section account-address-summary">
        <div>
          <h2>Địa chỉ giao hàng</h2>
          <p>
            {account.addresses.length === 0
              ? "Bạn chưa lưu địa chỉ giao hàng."
              : `Bạn có ${account.addresses.length} địa chỉ đã lưu.`}
          </p>
        </div>
        <Link to="/account/addresses">
          Quản lý địa chỉ <ArrowRight />
        </Link>
      </section>
    </AccountWorkspace>
  );
}
