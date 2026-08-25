// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { AlertTriangle, LoaderCircle, LockKeyhole, SearchX } from "lucide-react";
import type { ReactNode } from "react";

export interface SystemStateProps {
  readonly kind: "loading" | "empty" | "error" | "denied" | "session-expired";
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

export function SystemState({ action, description, kind, title }: SystemStateProps) {
  const role = kind === "loading" || kind === "empty" ? "status" : "alert";
  const Icon = kind === "loading"
    ? LoaderCircle
    : kind === "empty"
      ? SearchX
      : kind === "denied" || kind === "session-expired"
        ? LockKeyhole
        : AlertTriangle;

  return (
    <section className={`systemState systemState-${kind}`} role={role}>
      <span className="systemStateIcon"><Icon size={24} aria-hidden="true" /></span>
      <p className="sectionKicker">System / {kind.replace("-", " ")}</p>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {action && <div className="systemStateAction">{action}</div>}
    </section>
  );
}
