// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/auth-context";

export function ProtectedRoute() {
  const { loading, session } = useAuth();
  if (loading) return <main className="centeredState">Loading staff session…</main>;
  if (session === null) return <Navigate to="/sign-in" replace />;
  if (session.roles.length === 0) {
    return (
      <main className="centeredState">
        <div>
          <h1>Permission denied</h1>
          <p>Your account does not have an authorized staff role.</p>
        </div>
      </main>
    );
  }
  return <Outlet />;
}
