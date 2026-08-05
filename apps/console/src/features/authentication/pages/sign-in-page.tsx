// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { LogIn } from "lucide-react";
import { useAuth } from "../hooks/auth-context";

export function SignInPage() {
  const { signIn, error } = useAuth();
  return (
    <main className="authPage">
      <section className="authPanel" aria-labelledby="sign-in-title">
        <span className="brandMark">DX</span>
        <p className="sectionKicker">NovaCommerce operations</p>
        <h1 id="sign-in-title">Staff console</h1>
        <p>Sign in with the company identity provider to manage the catalog.</p>
        {error === undefined ? null : <div className="inlineError">{error}</div>}
        <button className="primaryButton" type="button" onClick={() => void signIn()}>
          <LogIn aria-hidden="true" size={16} />
          Sign in with Keycloak
        </button>
      </section>
    </main>
  );
}
