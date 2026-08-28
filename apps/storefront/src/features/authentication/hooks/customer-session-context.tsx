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
import type { CustomerSessionApi } from "../api/customer-session-api";
import type { CustomerSession } from "../types/authentication.types";

interface SessionContextValue {
  readonly session: CustomerSession;
  readonly loading: boolean;
  readonly error?: string;
  readonly restore: () => Promise<void>;
  readonly login: (credential: string) => Promise<CustomerSession>;
  readonly logout: () => Promise<void>;
}
const SessionContext = createContext<SessionContextValue | undefined>(
  undefined,
);
export function CustomerSessionProvider({
  api,
  children,
}: {
  readonly api: CustomerSessionApi;
  readonly children: ReactNode;
}) {
  const [session, setSession] = useState<CustomerSession>({
    kind: "anonymous",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const restoreInFlight = useRef<Promise<void> | undefined>(undefined);
  const restore = useCallback(() => {
    const activeRestore = restoreInFlight.current;
    if (activeRestore !== undefined) return activeRestore;

    const request = (async () => {
      setLoading(true);
      try {
        setSession(await api.get());
        setError(undefined);
      } catch {
        setSession({ kind: "anonymous" });
        setError("Không thể khôi phục phiên đăng nhập.");
      } finally {
        setLoading(false);
      }
    })();
    restoreInFlight.current = request;
    void request.finally(() => {
      if (restoreInFlight.current === request) {
        restoreInFlight.current = undefined;
      }
    });
    return request;
  }, [api]);
  useEffect(() => {
    void restore();
  }, [restore]);
  const login = useCallback(
    async (credential: string) => {
      setLoading(true);
      try {
        const next = await api.login(credential);
        setSession(next);
        setError(undefined);
        return next;
      } finally {
        setLoading(false);
      }
    },
    [api],
  );
  const logout = useCallback(async () => {
    await api.logout();
    setSession({ kind: "anonymous" });
  }, [api]);
  const value = useMemo(
    () => ({
      session,
      loading,
      ...(error === undefined ? {} : { error }),
      restore,
      login,
      logout,
    }),
    [session, loading, error, restore, login, logout],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
export function useCustomerSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === undefined)
    throw new Error("CustomerSessionProvider is required");
  return value;
}
