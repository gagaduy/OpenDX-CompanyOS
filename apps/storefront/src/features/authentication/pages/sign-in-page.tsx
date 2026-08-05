// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { GoogleSignInButton } from "../components/google-sign-in-button";
import { useCustomerSession } from "../hooks/customer-session-context";

const allowedReturns = new Set(["/cart", "/account", "/account/addresses"]);
export function SignInPage({ googleClientId }: { readonly googleClientId?: string }) {
  const { session, login } = useCustomerSession(); const navigate = useNavigate(); const [parameters] = useSearchParams(); const [error, setError] = useState<string>();
  const returnTo = allowedReturns.has(parameters.get("returnTo") ?? "") ? parameters.get("returnTo")! : "/account";
  const credential = useCallback(async (value: string) => { try { const next = await login(value); navigate(next.kind === "customer" && next.cartResolution === "required" ? "/cart?resolution=required" : returnTo, { replace: true }); } catch { setError("Đăng nhập không thành công. Vui lòng thử lại."); } }, [login, navigate, returnTo]);
  if (session.kind === "customer") return <Navigate replace to={returnTo} />;
  return <main id="main-content" className="content-page auth-page"><section><span className="eyebrow">Tài khoản NovaCommerce</span><h1>Đăng nhập</h1><p>Đăng nhập để kiểm tra giỏ hàng trước khi chuyển sang quy trình đặt hàng ở Phase 6.</p>{error && <p role="alert" className="inline-alert">{error}</p>}<GoogleSignInButton clientId={googleClientId} onCredential={(value) => void credential(value)} /></section></main>;
}
