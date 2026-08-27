// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { GoogleSignInButton } from "../components/google-sign-in-button";
import { useCustomerSession } from "../hooks/customer-session-context";
import { safeReturnUrl } from "../lib/safe-return-url";

export function SignInPage({
  googleClientId,
  catalogApi,
  apiBaseUrl,
}: {
  readonly googleClientId?: string;
  readonly catalogApi?: SignInCatalogReader;
  readonly apiBaseUrl?: string;
}) {
  const { session, login } = useCustomerSession();
  const navigate = useNavigate();
  const [parameters] = useSearchParams();
  const [error, setError] = useState<string>();
  const [backdrop, setBackdrop] = useState({
    src: "/sign-in-product.png",
    alt: "Máy tính NovaCommerce trong không gian làm việc",
  });
  const returnTo = safeReturnUrl(parameters.get("returnTo"));
  const credential = useCallback(
    async (value: string) => {
      try {
        const next = await login(value);
        navigate(
          next.kind === "customer" && next.cartResolution === "required"
            ? "/cart?resolution=required"
            : returnTo,
          { replace: true },
        );
      } catch {
        setError("Đăng nhập không thành công. Vui lòng thử lại.");
      }
    },
    [login, navigate, returnTo],
  );
  useEffect(() => {
    if (catalogApi === undefined || apiBaseUrl === undefined) return;
    let active = true;
    void catalogApi
      .products(new URLSearchParams("sort=best_selling&page=1&pageSize=1"))
      .then((page) => {
        const product = page.items[0];
        if (active && product !== undefined) {
          setBackdrop({
            src: new URL(product.primaryMedia.contentUrl, apiBaseUrl).toString(),
            alt: product.primaryMedia.altText,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [apiBaseUrl, catalogApi]);
  if (session.kind === "customer") return <Navigate replace to={returnTo} />;
  return (
    <main id="main-content" className="auth-page">
      <img
        className="auth-backdrop"
        src={backdrop.src}
        alt={backdrop.alt}
      />
      <span className="auth-scrim" />
      <section className="auth-panel">
        <span className="auth-brand">NovaCommerce</span>
        <span className="eyebrow">Tài khoản khách hàng</span>
        <h1>Đăng nhập NovaCommerce</h1>
        <p>
          Lưu giỏ hàng, quản lý địa chỉ và tiếp tục hành trình mua sắm trên mọi
          thiết bị.
        </p>
        {error && (
          <p role="alert" className="inline-alert">
            {error}
          </p>
        )}
        <GoogleSignInButton
          clientId={googleClientId}
          onCredential={(value) => void credential(value)}
        />
        <Link className="auth-return" to="/">
          <ArrowLeft /> Quay lại cửa hàng
        </Link>
      </section>
    </main>
  );
}

export interface SignInCatalogReader {
  products(parameters: URLSearchParams): Promise<{
    readonly items: readonly {
      readonly primaryMedia: {
        readonly contentUrl: string;
        readonly altText: string;
      };
    }[];
  }>;
}
