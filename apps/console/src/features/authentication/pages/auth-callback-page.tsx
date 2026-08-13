// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SystemState } from "../../../shared/components/system-state";
import { useAuth } from "../hooks/auth-context";

export function AuthCallbackPage() {
  const { completeSignIn } = useAuth();
  const navigate = useNavigate();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void completeSignIn()
      .then(() => navigate("/", { replace: true }))
      .catch(() => setFailed(true));
  }, [completeSignIn, navigate]);

  return (
    <main className="authPage callbackPage">
      {failed ? (
        <SystemState
          kind="error"
          title="Sign-in could not be completed"
          description="The identity response was unavailable or invalid. Return to sign in and try again."
          action={(
            <button
              className="primaryButton"
              type="button"
              onClick={() => navigate("/sign-in", { replace: true })}
            >
              Return to sign in
            </button>
          )}
        />
      ) : (
        <SystemState
          kind="loading"
          title="Completing secure sign-in"
          description="Finalizing your staff session with Keycloak."
        />
      )}
    </main>
  );
}
