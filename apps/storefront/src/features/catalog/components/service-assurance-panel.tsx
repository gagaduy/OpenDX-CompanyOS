// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { BadgePercent, Headphones, ShieldCheck, Truck } from "lucide-react";

const assurances = [
  { icon: Truck, title: "Miễn phí vận chuyển", copy: "Cho đơn hàng đủ điều kiện" },
  { icon: ShieldCheck, title: "Bảo hành chính hãng", copy: "Cam kết sản phẩm xác thực" },
  { icon: BadgePercent, title: "Trả góp 0%", copy: "Theo điều kiện thanh toán" },
  { icon: Headphones, title: "Hỗ trợ 24/7", copy: "Đồng hành khi bạn cần" },
] as const;

export function ServiceAssurancePanel() {
  return (
    <aside className="service-assurance-panel" aria-label="Cam kết dịch vụ">
      {assurances.map(({ icon: Icon, title, copy }) => (
        <div className="service-assurance-item" key={title}>
          <Icon aria-hidden="true" />
          <span><strong>{title}</strong><small>{copy}</small></span>
        </div>
      ))}
    </aside>
  );
}

export function ServiceMetricStrip() {
  return (
    <section className="service-metric-strip" aria-label="Năng lực NovaCommerce">
      <div><strong>100%</strong><span>Sản phẩm chính hãng</span></div>
      <div><strong>30+</strong><span>Thương hiệu uy tín</span></div>
      <div><strong>1.000+</strong><span>Sản phẩm đa dạng</span></div>
      <div><strong>50.000+</strong><span>Khách hàng tin tưởng</span></div>
    </section>
  );
}
