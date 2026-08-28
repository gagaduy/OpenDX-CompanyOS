// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
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
  const [panelOpen, setPanelOpen] = useState(false);
  const [backdrop, setBackdrop] = useState({
    src: "/sign-in-product.png",
    alt: "Máy tính NovaCommerce trong không gian làm việc",
  });
  const [videoSource, setVideoSource] = useState<string>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelWasOpen = useRef(false);
  const closePanel = useCallback(() => setPanelOpen(false), []);
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
  useEffect(() => {
    if (panelOpen) {
      panelWasOpen.current = true;
      closeRef.current?.focus();
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") closePanel();
      };
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    } else if (panelWasOpen.current) {
      triggerRef.current?.focus();
    }
  }, [closePanel, panelOpen]);
  useEffect(() => {
    if (catalogApi === undefined || apiBaseUrl === undefined) return;
    let active = true;
    void catalogApi
      .heroPresentation()
      .then((presentation) => {
        if (active && presentation.media !== undefined) {
          setVideoSource(
            new URL(presentation.media.contentUrl, apiBaseUrl).toString(),
          );
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
      {videoSource !== undefined ? (
        <video
          className="auth-backdrop auth-video"
          data-testid="sign-in-video"
          src={videoSource}
          poster={backdrop.src}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
          onError={() => setVideoSource(undefined)}
        />
      ) : null}
      <span className="auth-scrim" />
      {!panelOpen ? (
        <button
          ref={triggerRef}
          type="button"
          className="auth-google-trigger"
          aria-label="Mở đăng nhập Google"
          onClick={() => setPanelOpen(true)}
        >
          <span aria-hidden="true">
            <svg viewBox="0 0 18 18">
              <path
                fill="#4285f4"
                d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.876 2.684-6.613Z"
              />
              <path
                fill="#34a853"
                d="M9 18c2.43 0 4.467-.806 5.956-2.182l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.715H.956v2.332A9 9 0 0 0 9 18Z"
              />
              <path
                fill="#fbbc05"
                d="M3.963 10.704A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.167.281-1.704V4.964H.956A9 9 0 0 0 0 9c0 1.45.347 2.824.956 4.036l3.007-2.332Z"
              />
              <path
                fill="#ea4335"
                d="M9 3.58c1.322 0 2.507.455 3.441 1.346l2.581-2.582C13.463.891 11.426 0 9 0A9 9 0 0 0 .956 4.964l3.007 2.332C4.672 5.166 6.656 3.58 9 3.58Z"
              />
            </svg>
          </span>
        </button>
      ) : (
        <div
          className="auth-modal-layer"
          data-testid="auth-modal-layer"
          onClick={(event) => {
            if (event.target === event.currentTarget) closePanel();
          }}
        >
          <section
            className="auth-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sign-in-title"
          >
            <button
              ref={closeRef}
              type="button"
              className="auth-panel-close"
              aria-label="Thu gọn đăng nhập"
              onClick={closePanel}
            >
              <X aria-hidden="true" />
            </button>
            <span className="auth-brand">NovaCommerce</span>
            <span className="eyebrow">Tài khoản khách hàng</span>
            <h1 id="sign-in-title">Đăng nhập NovaCommerce</h1>
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
        </div>
      )}
    </main>
  );
}

export interface SignInCatalogReader {
  heroPresentation(): Promise<{
    readonly media?: {
      readonly contentUrl: string;
      readonly contentType: "video/mp4";
    };
  }>;
  products(parameters: URLSearchParams): Promise<{
    readonly items: readonly {
      readonly primaryMedia: {
        readonly contentUrl: string;
        readonly altText: string;
      };
    }[];
  }>;
}
