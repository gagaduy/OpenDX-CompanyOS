// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Navigate, useParams } from "react-router-dom";
export function CategoryPage() {
  const { categorySlug } = useParams();
  return (
    <Navigate
      replace
      to={`/?category=${encodeURIComponent(categorySlug ?? "")}`}
    />
  );
}
