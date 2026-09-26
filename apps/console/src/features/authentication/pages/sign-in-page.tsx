// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { LogIn, ShieldCheck } from "lucide-react";
import { useAuth } from "../hooks/auth-context";

export function SignInPage() {
  const { signIn, error } = useAuth();
  return (
    <main className="authPage">
      <section className="authPanel" aria-labelledby="sign-in-title">
        <div className="authBrand">
          <span className="brandMark">N</span>
          <strong>NovaCommerce</strong>
        </div>
        <p className="sectionKicker">Operations Console</p>
        <h1 id="sign-in-title">Staff console</h1>
        <p>Use your company identity to access role-aware commerce operations.</p>
        {error === undefined ? null : <div className="inlineError">{error}</div>}
        <button className="primaryButton" type="button" onClick={() => void signIn()}>
          <LogIn aria-hidden="true" size={16} />
          Sign in with Keycloak
        </button>

        {import.meta.env.DEV && (
          <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--hairline)" }}>
            <button
              type="button"
              style={{
                width: "100%",
                background: "#1e293b",
                color: "#38bdf8",
                border: "1px solid #334155",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                padding: "0.65rem 1rem",
                borderRadius: "8px",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
              onClick={() => {
                const storedUser = {
                  access_token: "dev-admin-token",
                  token_type: "Bearer",
                  scope: "openid",
                  profile: {
                    sub: "dev-admin",
                    name: "Administrator (Dev)",
                    realm_access: {
                      roles: [
                        "administrator",
                        "agentic_operator",
                        "agentic_approver",
                        "agentic_governance_admin",
                        "agentic_auditor",
                        "catalog_manager",
                        "inventory_manager",
                        "operations_manager",
                        "finance_operator",
                        "crm_operator",
                        "support_operator",
                        "executive_viewer",
                      ],
                    },
                  },
                  expires_at: Math.floor(Date.now() / 1000) + 86400 * 30,
                };
                sessionStorage.setItem("oidc.user:http://localhost:8081/realms/opendx:opendx-console", JSON.stringify(storedUser));
                sessionStorage.setItem("oidc.user:http://localhost:8080/realms/opendx:opendx-console", JSON.stringify(storedUser));
                window.location.href = "/agentic/workflows";
              }}
            >
              ⚡ Đăng Nhập Nhanh (Dev Administrator)
            </button>
            <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.75rem", color: "var(--ink-subtle)", textAlign: "center" }}>
              Dành cho chế độ thử nghiệm cục bộ
            </p>
          </div>
        )}

        <small className="authTrust"><ShieldCheck size={14} aria-hidden="true" /> Backend-enforced staff access</small>
      </section>
    </main>
  );
}
