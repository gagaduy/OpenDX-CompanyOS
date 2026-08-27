// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export { StorefrontCatalogApi } from "./api/storefront-catalog-api";
export { ProductCard } from "./components/product-card";
export { ProductGrid } from "./components/product-grid";
export { useNavigationCategories } from "./hooks/use-navigation-categories";
export { CategoryPage } from "./pages/category-page";
export { HomePage } from "./pages/home-page";
export { IntroHomePage } from "./pages/intro-home-page";
export { ProductDetailPage } from "./pages/product-detail-page";
export { SearchPage } from "./pages/search-page";
export { productSchema } from "./schemas/storefront-catalog.schema";
export type {
  StorefrontCategory,
  StorefrontHeroSlide,
  StorefrontProduct,
  StorefrontVariant,
} from "./types/catalog.types";
