// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

export interface PageHeaderProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description?: string;
  readonly breadcrumb?: readonly {
    readonly label: string;
    readonly to?: string;
  }[];
  readonly metadata?: ReactNode;
  readonly actions?: ReactNode;
}

export function PageHeader({
  actions,
  breadcrumb,
  description,
  eyebrow,
  metadata,
  title,
}: PageHeaderProps) {
  return (
    <header className="pageHeader">
      <div className="pageHeaderCopy">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="breadcrumb" aria-label="Breadcrumb">
            {breadcrumb.map((item, index) => (
              <span key={`${item.label}-${index}`}>
                {item.to ? <a href={item.to}>{item.label}</a> : item.label}
              </span>
            ))}
          </nav>
        )}
        <p className="sectionKicker">{eyebrow}</p>
        <div className="pageTitleLine">
          <h1>{title}</h1>
          {metadata}
        </div>
        {description && <p className="pageDescription">{description}</p>}
      </div>
      {actions && <div className="pageHeaderActions">{actions}</div>}
    </header>
  );
}
