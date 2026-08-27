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
import type { StorefrontCatalogApi } from "../api/storefront-catalog-api";
import type { StorefrontContent } from "../types/catalog.types";

type StorefrontContentState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly content: StorefrontContent }
  | { readonly status: "empty" }
  | { readonly status: "error" };

export type StorefrontContentContextValue = StorefrontContentState & {
  readonly retry: () => void;
};

const StorefrontContentContext = createContext<
  StorefrontContentContextValue | undefined
>(undefined);

export function StorefrontContentProvider({
  api,
  children,
}: {
  readonly api: Pick<StorefrontCatalogApi, "content">;
  readonly children: ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<StorefrontContentState>({
    status: "loading",
  });
  const requestSequence = useRef(0);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    setState({ status: "loading" });
    void api.content().then(
      (content) => {
        if (sequence !== requestSequence.current) return;
        setState(
          content.assurances.length === 0 && content.metrics.length === 0
            ? { status: "empty" }
            : { status: "ready", content },
        );
      },
      () => {
        if (sequence === requestSequence.current) setState({ status: "error" });
      },
    );
    return () => {
      if (sequence === requestSequence.current) requestSequence.current += 1;
    };
  }, [api, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const value = useMemo(() => ({ ...state, retry }), [retry, state]);

  return (
    <StorefrontContentContext.Provider value={value}>
      {children}
    </StorefrontContentContext.Provider>
  );
}

export function useStorefrontContent(): StorefrontContentContextValue {
  const value = useContext(StorefrontContentContext);
  if (value === undefined) {
    throw new Error("useStorefrontContent must be used within StorefrontContentProvider");
  }
  return value;
}
