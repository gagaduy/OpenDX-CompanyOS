// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";
import type { StaffRole } from "../api/oidc-manager";
import { useAuth } from "../hooks/auth-context";

export function StaffRoleRoute({
  allowed,
  children,
}: {
  readonly allowed: readonly StaffRole[];
  readonly children: ReactNode;
}) {
  const { session } = useAuth();
  if (session?.roles.some((role) => allowed.includes(role)) === true) return children;
  return (
    <section className="permissionState">
      <div>
        <p className="sectionKicker">Access control</p>
        <h1>Permission denied</h1>
        <p>Your staff role cannot access this operational workspace.</p>
      </div>
    </section>
  );
}
