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
        <small className="authTrust"><ShieldCheck size={14} aria-hidden="true" /> Backend-enforced staff access</small>
      </section>
    </main>
  );
}
