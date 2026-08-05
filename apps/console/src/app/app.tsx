// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { BrowserRouter } from "react-router-dom";
import { createOidcAuthClient, type AuthClient } from "../features/authentication/api/oidc-manager";
import { AuthProvider } from "../features/authentication/hooks/auth-context";
import { AppRouter } from "./app-router";
import { parseConsoleEnvironment } from "./environment";

export function App({ authClient }: { readonly authClient?: AuthClient }) {
  const client =
    authClient ?? createOidcAuthClient(parseConsoleEnvironment(import.meta.env));
  return (
    <BrowserRouter>
      <AuthProvider client={client}>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}
