// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Navigate, useSearchParams } from "react-router-dom";
export function SearchPage() {
  const [parameters] = useSearchParams();
  const queryString = parameters.toString();
  return (
    <Navigate
      replace
      to={`/products${queryString ? `?${queryString}` : ""}`}
    />
  );
}
