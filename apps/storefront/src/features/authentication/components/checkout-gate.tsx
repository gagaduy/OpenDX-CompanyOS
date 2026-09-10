// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Navigate, useLocation } from "react-router-dom";
import { useCustomerSession } from "../hooks/customer-session-context";
export function CheckoutGate({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const { session, loading } = useCustomerSession();
  const location = useLocation();
  if (loading) return <p role="status">Đang kiểm tra phiên...</p>;
  return session.kind === "customer" ? (
    children
  ) : (
    <Navigate
      replace
      to={`/sign-in?returnTo=${encodeURIComponent(
        safePath(location.pathname, location.search, location.hash),
      )}`}
    />
  );
}

function safePath(pathname: string, search: string, hash: string) {
  return `${pathname}${search}${hash}`;
}
