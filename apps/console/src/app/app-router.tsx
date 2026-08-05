// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Navigate, Route, Routes } from "react-router-dom";
import { CompanyOverviewPage } from "../features/company-overview/pages/company-overview-page";
import { ProtectedRoute } from "../features/authentication/components/protected-route";
import { AuthCallbackPage } from "../features/authentication/pages/auth-callback-page";
import { SignInPage } from "../features/authentication/pages/sign-in-page";
import { ConsoleShell } from "./console-shell";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<ConsoleShell />}>
          <Route index element={<Navigate to="/products" replace />} />
          <Route path="/products" element={<WorkspacePlaceholder title="Products" />} />
          <Route path="/categories" element={<WorkspacePlaceholder title="Categories" />} />
          <Route path="/company-overview" element={<CompanyOverviewPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/products" replace />} />
    </Routes>
  );
}

function WorkspacePlaceholder({ title }: { readonly title: string }) {
  return <section className="workspaceHeader"><p className="sectionKicker">Catalog</p><h1>{title}</h1></section>;
}
