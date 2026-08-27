// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { StorefrontProduct } from "../../catalog";
import { useCustomerSession } from "../../authentication/hooks/customer-session-context";
import type { WishlistMutation, WishlistPage } from "../types/wishlist.types";

export interface WishlistClient {
  list(page?: number, pageSize?: number): Promise<WishlistPage>;
  add(productId: string): Promise<WishlistMutation>;
  remove(productId: string): Promise<WishlistMutation>;
}

interface WishlistContextValue {
  readonly products: readonly StorefrontProduct[];
  readonly wishedProductIds: ReadonlySet<string>;
  readonly totalItems: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly loading: boolean;
  readonly pendingProductIds: ReadonlySet<string>;
  readonly error?: string;
  readonly refresh: (page?: number) => Promise<void>;
  readonly setWished: (productId: string, wished: boolean) => Promise<void>;
}

const WishlistContext = createContext<WishlistContextValue | undefined>(
  undefined,
);

export function WishlistProvider({
  api,
  children,
}: {
  readonly api: WishlistClient;
  readonly children: ReactNode;
}) {
  const { session, loading: sessionLoading } = useCustomerSession();
  const [products, setProducts] = useState<readonly StorefrontProduct[]>([]);
  const [wishedProductIds, setWishedProductIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [meta, setMeta] = useState({
    page: 1,
    pageSize: 24,
    totalItems: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [pendingProductIds, setPendingProductIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [error, setError] = useState<string>();

  const refresh = useCallback(
    async (page = 1) => {
      if (session.kind !== "customer") return;
      setLoading(true);
      try {
        const result = await api.list(page, 48);
        setProducts(result.items);
        setWishedProductIds(new Set(result.items.map(({ id }) => id)));
        setMeta({
          page: result.page,
          pageSize: result.pageSize,
          totalItems: result.totalItems,
          totalPages: result.totalPages,
        });
        setError(undefined);
      } catch {
        setError("Không thể tải danh sách yêu thích.");
      } finally {
        setLoading(false);
      }
    },
    [api, session.kind],
  );

  useEffect(() => {
    if (sessionLoading) return;
    if (session.kind === "customer") {
      void refresh();
      return;
    }
    setProducts([]);
    setWishedProductIds(new Set());
    setMeta({ page: 1, pageSize: 24, totalItems: 0, totalPages: 0 });
    setError(undefined);
  }, [refresh, session.kind, sessionLoading]);

  const setWished = useCallback(
    async (productId: string, wished: boolean) => {
      if (session.kind !== "customer" || pendingProductIds.has(productId)) return;
      setPendingProductIds((current) => new Set(current).add(productId));
      try {
        const confirmation = wished
          ? await api.add(productId)
          : await api.remove(productId);
        if (confirmation.wished !== wished) throw new Error("Wishlist state mismatch");
        await refresh(meta.page);
        setWishedProductIds((current) => {
          const next = new Set(current);
          wished ? next.add(productId) : next.delete(productId);
          return next;
        });
        if (!wished) {
          setProducts((current) => current.filter(({ id }) => id !== productId));
        }
        setError(undefined);
      } catch {
        setError("Không thể cập nhật danh sách yêu thích.");
      } finally {
        setPendingProductIds((current) => {
          const next = new Set(current);
          next.delete(productId);
          return next;
        });
      }
    },
    [api, meta.page, pendingProductIds, refresh, session.kind],
  );

  const value = useMemo(
    () => ({
      products,
      wishedProductIds,
      totalItems: meta.totalItems,
      page: meta.page,
      pageSize: meta.pageSize,
      totalPages: meta.totalPages,
      loading,
      pendingProductIds,
      ...(error === undefined ? {} : { error }),
      refresh,
      setWished,
    }),
    [
      products,
      wishedProductIds,
      meta,
      loading,
      pendingProductIds,
      error,
      refresh,
      setWished,
    ],
  );
  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistContextValue {
  const value = useContext(WishlistContext);
  if (value === undefined) throw new Error("WishlistProvider is required");
  return value;
}
