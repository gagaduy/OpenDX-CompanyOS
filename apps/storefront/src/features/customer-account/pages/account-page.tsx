// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Link } from "react-router-dom";
import { useCustomerSession } from "../../authentication/hooks/customer-session-context";
import type { CustomerAccountApi } from "../api/customer-account-api";
import { ProfileForm } from "../components/profile-form";
import { useCustomerAccount } from "../hooks/use-customer-account";
export function AccountPage({ api }: { readonly api: CustomerAccountApi }) { const account = useCustomerAccount(api); const { logout } = useCustomerSession(); if (account.loading && account.profile === undefined) return <main id="main-content" className="content-page"><p role="status" className="state-panel">Đang tải tài khoản...</p></main>; if (account.profile === undefined) return <main id="main-content" className="content-page"><p role="alert" className="state-panel">{account.error}</p></main>; return <main id="main-content" className="content-page"><div className="page-heading"><div><span className="eyebrow">Khách hàng</span><h1>Tài khoản</h1></div><button className="button secondary" onClick={() => void logout()}>Đăng xuất</button></div><section className="account-section"><h2>Hồ sơ</h2><ProfileForm profile={account.profile} disabled={account.loading} onSubmit={(input) => void api.updateProfile(input).then(account.reload)} /></section><section className="account-section"><h2>Địa chỉ</h2><p>{account.addresses.length} địa chỉ đã lưu</p><Link className="button secondary" to="/account/addresses">Quản lý địa chỉ</Link></section></main>; }
