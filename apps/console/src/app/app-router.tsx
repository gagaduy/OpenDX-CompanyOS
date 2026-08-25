// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
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
import { createCrmOperationsApi, CustomerDetailPage } from "../features/crm";
import { createCustomerOperationsApi, CustomerListPage } from "../features/customers";
import { createDashboardApi, DashboardPage } from "../features/dashboard";
import { createInventoryApi, InventoryPage } from "../features/inventory";
import { createOrderOperationsApi } from "../features/orders/api/order-operations-api";
import { OrderDetailPage } from "../features/orders/pages/order-detail-page";
import { OrderOperationsPage } from "../features/orders/pages/order-operations-page";
import { createPaymentOperationsApi } from "../features/payments/api/payment-operations-api";
import { PaymentDetailPage } from "../features/payments/pages/payment-detail-page";
import { PaymentOperationsPage } from "../features/payments/pages/payment-operations-page";
import { createSupportOperationsApi, SupportPage, TicketDetailPage } from "../features/support";
import { AgenticApprovalsPage, AgenticEmployeeDetailPage, AgenticEmployeesPage, AgenticTaskDetailPage, AgenticTaskIntakePage, AgenticTasksPage, createAgenticApi, type AgentKind } from "../features/agentic";
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
          <Route path="/customers" element={<CustomerRoute apiBaseUrl={apiBaseUrl} />} />
          <Route path="/customers/:customerId" element={<CustomerRoute apiBaseUrl={apiBaseUrl} detail />} />
          <Route path="/support" element={<SupportRoute apiBaseUrl={apiBaseUrl} />} />
          <Route path="/support/:ticketId" element={<SupportRoute apiBaseUrl={apiBaseUrl} detail />} />
          <Route path="/dashboard" element={<DashboardRoute apiBaseUrl={apiBaseUrl} />} />
          <Route path="/company-overview" element={<CompanyOverviewPage />} />
          <Route path="/agentic/tasks" element={<AgenticRoute apiBaseUrl={apiBaseUrl} />} />
          <Route path="/agentic/tasks/new" element={<AgenticRoute apiBaseUrl={apiBaseUrl} intake />} />
          <Route path="/agentic/tasks/:taskId" element={<AgenticRoute apiBaseUrl={apiBaseUrl} detail />} />
          <Route path="/agentic/approvals" element={<AgenticApprovalRoute apiBaseUrl={apiBaseUrl} />} />
          <Route path="/agentic/employees" element={<AgenticEmployeeRoute apiBaseUrl={apiBaseUrl} />} />
          <Route path="/agentic/employees/:agentKind" element={<AgenticEmployeeRoute apiBaseUrl={apiBaseUrl} detail />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/products" replace />} />
    </Routes>
  );
}

function AgenticApprovalRoute({ apiBaseUrl }: { readonly apiBaseUrl: string }) {
  const { session } = useAuth();
  const api = useMemo(() => createAgenticApi(apiBaseUrl, session?.accessToken ?? ""), [apiBaseUrl, session?.accessToken]);
  const readers = ["administrator", "agentic_operator", "agentic_approver", "agentic_governance_admin"] as const;
  return <StaffRoleRoute allowed={readers}><AgenticApprovalsPage api={api} roles={session?.roles ?? []} /></StaffRoleRoute>;
}

function AgenticEmployeeRoute({ apiBaseUrl, detail = false }: { readonly apiBaseUrl: string; readonly detail?: boolean }) {
  const { session } = useAuth(); const { agentKind } = useParams();
  const api = useMemo(() => createAgenticApi(apiBaseUrl, session?.accessToken ?? ""), [apiBaseUrl, session?.accessToken]);
  const readers = ["administrator", "agentic_operator", "agentic_approver", "agentic_governance_admin", "agentic_auditor"] as const;
  const kinds = ["ai_ceo", "catalog", "inventory", "order", "finance", "crm", "support"];
  const content = detail
    ? kinds.includes(agentKind ?? "") ? <AgenticEmployeeDetailPage api={api} agentKind={agentKind as AgentKind} /> : <Navigate to="/agentic/employees" replace />
    : <AgenticEmployeesPage api={api} />;
  return <StaffRoleRoute allowed={readers}>{content}</StaffRoleRoute>;
}

function HomeRedirect() {
  const { session } = useAuth();
  const roles = session?.roles ?? [];
  const target = roles.includes("administrator") || roles.includes("catalog_manager")
    ? "/products"
    : roles.includes("executive_viewer")
      ? "/dashboard"
    : roles.includes("operations_manager")
      ? "/orders"
      : roles.includes("finance_operator")
        ? "/payments"
        : roles.includes("crm_operator")
          ? "/customers"
          : roles.includes("support_operator")
            ? "/support"
            : roles.some((role) => role === "agentic_operator" || role === "agentic_approver" || role === "agentic_governance_admin")
              ? "/agentic/tasks"
              : "/inventory";
  return <Navigate to={target} replace />;
}

function AgenticRoute({ apiBaseUrl, intake = false, detail = false }: { readonly apiBaseUrl: string; readonly intake?: boolean; readonly detail?: boolean }) {
  const { session } = useAuth();
  const { taskId } = useParams();
  const api = useMemo(() => createAgenticApi(apiBaseUrl, session?.accessToken ?? ""), [apiBaseUrl, session?.accessToken]);
  const readers = ["administrator", "agentic_operator", "agentic_approver", "agentic_governance_admin"] as const;
  if (intake) return <StaffRoleRoute allowed={["administrator", "agentic_operator", "agentic_governance_admin"]}><AgenticTaskIntakePage api={api} roles={session?.roles ?? []} /></StaffRoleRoute>;
  if (detail && taskId !== undefined) return <StaffRoleRoute allowed={readers}><AgenticTaskDetailPage api={api} taskId={taskId} roles={session?.roles ?? []} /></StaffRoleRoute>;
  return <StaffRoleRoute allowed={readers}><AgenticTasksPage api={api} roles={session?.roles ?? []} /></StaffRoleRoute>;
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

function CustomerRoute({ apiBaseUrl, detail = false }: { readonly apiBaseUrl: string; readonly detail?: boolean }) {
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const customerApi = useMemo(() => createCustomerOperationsApi(apiBaseUrl, accessToken), [apiBaseUrl, accessToken]);
  const crmApi = useMemo(() => createCrmOperationsApi(apiBaseUrl, accessToken), [apiBaseUrl, accessToken]);
  return <StaffRoleRoute allowed={["administrator", "crm_operator"]}>{detail ? <CustomerDetailPage api={crmApi} /> : <CustomerListPage api={customerApi} />}</StaffRoleRoute>;
}

function SupportRoute({ apiBaseUrl, detail = false }: { readonly apiBaseUrl: string; readonly detail?: boolean }) {
  const { session } = useAuth();
  const api = useMemo(() => createSupportOperationsApi(apiBaseUrl, session?.accessToken ?? ""), [apiBaseUrl, session?.accessToken]);
  return <StaffRoleRoute allowed={["administrator", "support_operator", "crm_operator"]}>{detail ? <TicketDetailPage api={api} roles={session?.roles ?? []} /> : <SupportPage api={api} roles={session?.roles ?? []} />}</StaffRoleRoute>;
}

function DashboardRoute({ apiBaseUrl }: { readonly apiBaseUrl: string }) {
  const { session } = useAuth();
  const api = useMemo(() => createDashboardApi(apiBaseUrl, session?.accessToken ?? ""), [apiBaseUrl, session?.accessToken]);
  return <StaffRoleRoute allowed={["administrator", "executive_viewer"]}><DashboardPage api={api} /></StaffRoleRoute>;
}
