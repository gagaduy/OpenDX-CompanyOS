// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/auth-context";

export function ProtectedRoute() {
  const { loading, session, signOut } = useAuth();
  if (loading) return <main className="centeredState">Loading staff session…</main>;
  if (session === null) return <Navigate to="/sign-in" replace />;
  if (session.roles.length === 0) {
    return (
      <main className="centeredState" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0a0d14", color: "#f1f5f9" }}>
        <div style={{ textAlign: "center", maxWidth: "420px", padding: "2rem", background: "#11151e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px" }}>
          <h1 style={{ fontSize: "1.4rem", color: "#f87171", marginBottom: "0.5rem" }}>Không có quyền truy cập (Permission denied)</h1>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
            Tài khoản hiện tại chưa được cấp quyền Staff. Vui lòng đăng xuất và đăng nhập lại bằng tài khoản Điều hành AI hoặc Administrator.
          </p>
          <button
            type="button"
            onClick={() => signOut()}
            style={{ background: "#f59e0b", color: "#000", border: "none", borderRadius: "8px", padding: "0.6rem 1.2rem", fontWeight: 700, cursor: "pointer" }}
          >
            Đăng nhập tài khoản khác
          </button>
        </div>
      </main>
    );
  }
  return <Outlet />;
}
