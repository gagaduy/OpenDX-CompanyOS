// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export { WishlistApi } from "./api/wishlist-api";
export { WishlistButton } from "./components/wishlist-button";
export { WishlistPage } from "./pages/wishlist-page";
export {
  WishlistProvider,
  useWishlist,
  type WishlistClient,
} from "./hooks/wishlist-context";
export type {
  WishlistMutation,
  WishlistPage as WishlistPageData,
} from "./types/wishlist.types";
