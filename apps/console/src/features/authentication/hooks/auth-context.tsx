// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthClient, AuthSession } from "../api/oidc-manager";

interface AuthContextValue {
  readonly loading: boolean;
  readonly session: AuthSession | null;
  readonly error?: string;
  signIn(): Promise<void>;
  completeSignIn(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  client,
  children,
}: {
  readonly client: AuthClient;
  readonly children: ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string>();
  const operationVersion = useRef(0);

  useEffect(() => {
    if (operationVersion.current !== 0) return;
    let active = true;
    const version = operationVersion.current;
    client
      .getSession()
      .then((value) => {
        if (active && operationVersion.current === version) setSession(value);
      })
      .catch(() => {
        if (active && operationVersion.current === version) {
          setError("Unable to restore the staff session.");
        }
      })
      .finally(() => {
        if (active && operationVersion.current === version) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client]);

  const completeSignIn = useCallback(async () => {
    operationVersion.current += 1;
    setLoading(true);
    try {
      setSession(await client.completeSignIn());
      setError(undefined);
    } finally {
      setLoading(false);
    }
  }, [client]);

  const signOut = useCallback(async () => {
    operationVersion.current += 1;
    await client.signOut();
    setSession(null);
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      ...(error === undefined ? {} : { error }),
      signIn: () => client.signIn(),
      completeSignIn,
      signOut,
    }),
    [client, completeSignIn, error, loading, session, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === undefined) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
