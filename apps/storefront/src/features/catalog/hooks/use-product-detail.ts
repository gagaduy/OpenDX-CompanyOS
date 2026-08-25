// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import type { StorefrontCatalogApi } from "../api/storefront-catalog-api";
import type { StorefrontProduct } from "../types/catalog.types";
export function useProductDetail(api: StorefrontCatalogApi, slug: string) {
  const [state, setState] = useState<{
    loading: boolean;
    product?: StorefrontProduct;
    error?: string;
  }>({ loading: true });
  useEffect(() => {
    let active = true;
    void api
      .product(slug)
      .then((product) => active && setState({ loading: false, product }))
      .catch(
        () =>
          active &&
          setState({ loading: false, error: "Không thể tải sản phẩm." }),
      );
    return () => {
      active = false;
    };
  }, [api, slug]);
  return state;
}
