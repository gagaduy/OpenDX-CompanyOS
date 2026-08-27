// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Heart } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCustomerSession } from "../../authentication/hooks/customer-session-context";
import { safeReturnUrl } from "../../authentication/lib/safe-return-url";
import { useWishlist } from "../hooks/wishlist-context";

export function WishlistButton({
  productId,
  productName,
}: {
  readonly productId: string;
  readonly productName: string;
}) {
  const { session } = useCustomerSession();
  const wishlist = useWishlist();
  const location = useLocation();
  const navigate = useNavigate();
  const wished = wishlist.wishedProductIds.has(productId);
  const pending = wishlist.pendingProductIds.has(productId);
  const label = wished
    ? `Xóa ${productName} khỏi yêu thích`
    : `Thêm ${productName} vào yêu thích`;

  const toggle = async () => {
    if (session.kind !== "customer") {
      const returnTo = safeReturnUrl(
        `${location.pathname}${location.search}${location.hash}`,
      );
      navigate(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    await wishlist.setWished(productId, !wished);
  };

  return (
    <>
      <button
        type="button"
        className={wished ? "wishlist-button wished" : "wishlist-button"}
        aria-label={label}
        aria-pressed={wished}
        disabled={pending}
        onClick={() => void toggle()}
      >
        <Heart aria-hidden="true" fill={wished ? "currentColor" : "none"} />
      </button>
      {wishlist.error === undefined ? null : (
        <span role="alert" className="wishlist-error">
          {wishlist.error}
        </span>
      )}
    </>
  );
}
