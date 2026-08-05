// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CartApi } from "../api/cart-api";
import { emptyAnonymousCart } from "../mappers/cart.mapper";
import type { StorefrontCart } from "../types/cart.types";

interface CartContextValue {
  readonly cart: StorefrontCart;
  readonly loading: boolean;
  readonly error?: string;
  readonly refresh: () => Promise<void>;
  readonly add: (variantId: string, quantity?: number) => Promise<void>;
  readonly update: (itemId: string, quantity: number) => Promise<void>;
  readonly remove: (itemId: string) => Promise<void>;
  readonly checkoutReadiness: () => Promise<void>;
  readonly resolve: (action: "keep_guest" | "keep_saved" | "merge") => Promise<void>;
  readonly resolution?: { readonly guestCart?: StorefrontCart; readonly savedCart?: StorefrontCart };
  readonly inspectResolution: () => Promise<void>;
}
const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ api, children }: { readonly api: CartApi; readonly children: ReactNode }) {
  const [cart, setCart] = useState(emptyAnonymousCart); const [loading, setLoading] = useState(true); const [error, setError] = useState<string>();
  const [resolution, setResolution] = useState<{ readonly guestCart?: StorefrontCart; readonly savedCart?: StorefrontCart }>();
  const refresh = useCallback(async () => { setLoading(true); try { setCart(await api.get()); setError(undefined); } catch { setError("Không thể tải giỏ hàng."); } finally { setLoading(false); } }, [api]);
  useEffect(() => { void refresh(); }, [refresh]);
  const mutate = useCallback(async (operation: () => Promise<StorefrontCart>) => { setLoading(true); try { setCart(await operation()); setError(undefined); } catch { setError("Không thể cập nhật giỏ hàng."); throw new Error("Cart mutation failed"); } finally { setLoading(false); } }, []);
  const add = useCallback(async (variantId: string, quantity = 1) => { if (cart.ownerKind === "anonymous") await api.createGuest(); await mutate(() => api.add(variantId, quantity)); }, [api, cart.ownerKind, mutate]);
  const resolve = useCallback(async (action: "keep_guest" | "keep_saved" | "merge") => { setLoading(true); try { const response = await api.resolve(action, crypto.randomUUID()); if (response.data.resultingCart !== undefined) setCart(response.data.resultingCart); setError(undefined); } catch { setError("Không thể giải quyết xung đột giỏ hàng."); throw new Error("Cart resolution failed"); } finally { setLoading(false); } }, [api]);
  const inspectResolution = useCallback(async () => { try { const state = await api.inspectResolution(); setResolution({ ...(state.guestCart === undefined ? {} : { guestCart: state.guestCart }), ...(state.savedCart === undefined ? {} : { savedCart: state.savedCart }) }); } catch { setError("Không thể tải thông tin xung đột giỏ hàng."); } }, [api]);
  const value = useMemo<CartContextValue>(() => ({ cart, loading, ...(error === undefined ? {} : { error }), refresh, add, update: (itemId, quantity) => mutate(() => api.update(itemId, quantity)), remove: (itemId) => mutate(() => api.remove(itemId)), checkoutReadiness: () => mutate(() => api.checkoutReadiness()), resolve, ...(resolution === undefined ? {} : { resolution }), inspectResolution }), [cart, loading, error, refresh, add, api, mutate, resolve, resolution, inspectResolution]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export function useCart(): CartContextValue { const value = useContext(CartContext); if (value === undefined) throw new Error("CartProvider is required"); return value; }
