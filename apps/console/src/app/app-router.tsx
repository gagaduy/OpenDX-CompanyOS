// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { CompanyOverviewPage } from "../features/company-overview/pages/company-overview-page";
import { ProtectedRoute } from "../features/authentication/components/protected-route";
import { StaffRoleRoute } from "../features/authentication/components/staff-role-route";
import { AuthCallbackPage } from "../features/authentication/pages/auth-callback-page";
import { SignInPage } from "../features/authentication/pages/sign-in-page";
import { useAuth } from "../features/authentication/hooks/auth-context";
import { createCatalogApi } from "../features/catalog/api/catalog-api";
import { CategoryPage } from "../features/catalog/pages/category-page";
import { ProductEditorPage } from "../features/catalog/pages/product-editor-page";
import { ProductListPage } from "../features/catalog/pages/product-list-page";
import { createInventoryApi, InventoryPage } from "../features/inventory";
import { createOrderOperationsApi } from "../features/orders/api/order-operations-api";
import { OrderDetailPage } from "../features/orders/pages/order-detail-page";
import { OrderOperationsPage } from "../features/orders/pages/order-operations-page";
import { createPaymentOperationsApi } from "../features/payments/api/payment-operations-api";
import { PaymentDetailPage } from "../features/payments/pages/payment-detail-page";
import { PaymentOperationsPage } from "../features/payments/pages/payment-operations-page";
import { ConsoleShell } from "./console-shell";

export function AppRouter({ apiBaseUrl = "http://localhost" }: { readonly apiBaseUrl?: string }) {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<ConsoleShell />}>
          <Route index element={<HomeRedirect />} />
          <Route path="/products" element={<CatalogPage apiBaseUrl={apiBaseUrl} page="products" />} />
          <Route path="/products/new" element={<CatalogPage apiBaseUrl={apiBaseUrl} page="editor" />} />
          <Route path="/products/:productId" element={<CatalogPage apiBaseUrl={apiBaseUrl} page="editor" />} />
          <Route path="/categories" element={<CatalogPage apiBaseUrl={apiBaseUrl} page="categories" />} />
          <Route path="/inventory" element={<InventoryRoute apiBaseUrl={apiBaseUrl} />} />
          <Route path="/orders" element={<OrderRoute apiBaseUrl={apiBaseUrl} />} />
          <Route path="/orders/:orderId" element={<OrderRoute apiBaseUrl={apiBaseUrl} detail />} />
          <Route path="/payments" element={<PaymentRoute apiBaseUrl={apiBaseUrl} />} />
          <Route path="/payments/:paymentId" element={<PaymentRoute apiBaseUrl={apiBaseUrl} detail />} />
          <Route path="/company-overview" element={<CompanyOverviewPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/products" replace />} />
    </Routes>
  );
}

function HomeRedirect() {
  const { session } = useAuth();
  const roles = session?.roles ?? [];
  const target = roles.includes("administrator") || roles.includes("catalog_manager")
    ? "/products"
    : roles.includes("operations_manager")
      ? "/orders"
      : roles.includes("finance_operator")
        ? "/payments"
        : "/inventory";
  return <Navigate to={target} replace />;
}

function InventoryRoute({ apiBaseUrl }: { readonly apiBaseUrl: string }) {
  const { session } = useAuth();
  const api = useMemo(() => createInventoryApi(apiBaseUrl, session?.accessToken ?? ""), [apiBaseUrl, session?.accessToken]);
  return <InventoryPage api={api} roles={session?.roles ?? []} />;
}

function CatalogPage({ apiBaseUrl, page }: { readonly apiBaseUrl: string; readonly page: "products" | "editor" | "categories" }) {
  const { session } = useAuth();
  const api = useMemo(
    () => createCatalogApi(apiBaseUrl, session?.accessToken ?? ""),
    [apiBaseUrl, session?.accessToken],
  );
  if (page === "products") return <ProductListPage api={api} />;
  if (page === "categories") return <CategoryPage api={api} />;
  return <ProductEditorPage api={api} roles={session?.roles ?? []} />;
}

function OrderRoute({ apiBaseUrl, detail = false }: { readonly apiBaseUrl: string; readonly detail?: boolean }) {
  const { session } = useAuth();
  const api = useMemo(() => createOrderOperationsApi(apiBaseUrl, session?.accessToken ?? ""), [apiBaseUrl, session?.accessToken]);
  return <StaffRoleRoute allowed={["administrator", "operations_manager"]}>{detail ? <OrderDetailPage api={api} roles={session?.roles ?? []} /> : <OrderOperationsPage api={api} />}</StaffRoleRoute>;
}

function PaymentRoute({ apiBaseUrl, detail = false }: { readonly apiBaseUrl: string; readonly detail?: boolean }) {
  const { session } = useAuth();
  const api = useMemo(() => createPaymentOperationsApi(apiBaseUrl, session?.accessToken ?? ""), [apiBaseUrl, session?.accessToken]);
  return <StaffRoleRoute allowed={["administrator", "finance_operator"]}>{detail ? <PaymentDetailPage api={api} /> : <PaymentOperationsPage api={api} />}</StaffRoleRoute>;
}
