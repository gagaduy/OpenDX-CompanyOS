// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  BadgePercent,
  Headphones,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { useStorefrontContent } from "../context/storefront-content-provider";
import type { StorefrontAssuranceIconKey } from "../types/catalog.types";

const assuranceIcons = {
  truck: Truck,
  "shield-check": ShieldCheck,
  "badge-percent": BadgePercent,
  headphones: Headphones,
} satisfies Record<StorefrontAssuranceIconKey, LucideIcon>;

export function ServiceAssurancePanel() {
  const state = useStorefrontContent();
  if (state.status === "loading") {
    return (
      <aside
        className="service-assurance-panel service-content-loading"
        role="status"
        aria-label="Đang tải cam kết dịch vụ"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <span className="service-content-skeleton" aria-hidden="true" key={index} />
        ))}
      </aside>
    );
  }
  if (state.status === "empty") return null;
  if (state.status === "error") {
    return (
      <aside className="service-assurance-panel service-content-error" aria-label="Cam kết dịch vụ">
        <div role="alert">
          <span>Không thể tải cam kết dịch vụ.</span>
          <button type="button" onClick={state.retry}>Thử lại</button>
        </div>
      </aside>
    );
  }
  if (state.content.assurances.length === 0) return null;
  return (
    <aside className="service-assurance-panel" aria-label="Cam kết dịch vụ">
      {state.content.assurances.map(({ code, iconKey, title, description }) => {
        const Icon = assuranceIcons[iconKey];
        return (
          <div className="service-assurance-item" key={code}>
            <Icon aria-hidden="true" />
            <span><strong>{title}</strong><small>{description}</small></span>
          </div>
        );
      })}
    </aside>
  );
}

export function ServiceMetricStrip() {
  const state = useStorefrontContent();
  if (state.status === "loading") {
    return (
      <section
        className="service-metric-strip service-content-loading"
        role="status"
        aria-label="Đang tải chỉ số cửa hàng"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <span className="service-content-skeleton" aria-hidden="true" key={index} />
        ))}
      </section>
    );
  }
  if (state.status !== "ready" || state.content.metrics.length === 0) return null;
  return (
    <section className="service-metric-strip" aria-label="Năng lực NovaCommerce">
      {state.content.metrics.map(({ code, displayValue, label }) => (
        <div key={code}><strong>{displayValue}</strong><span>{label}</span></div>
      ))}
    </section>
  );
}
