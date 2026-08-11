// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  ArrowRight,
  BadgeCheck,
  Headphones,
  Laptop,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

const highlights = [
  {
    icon: Laptop,
    title: "Đồ công nghệ tổng hợp",
    copy: "Laptop, điện thoại, phụ kiện, linh kiện và thiết bị thông minh trong một cửa hàng.",
  },
  {
    icon: ShieldCheck,
    title: "Giá và tồn kho rõ ràng",
    copy: "Sản phẩm, khuyến mãi và tình trạng còn hàng được lấy từ hệ thống vận hành.",
  },
  {
    icon: Headphones,
    title: "Hỗ trợ sau mua",
    copy: "Tài khoản khách hàng, đơn hàng và hỗ trợ được gom trong cùng trải nghiệm.",
  },
];

export function IntroHomePage() {
  return (
    <main id="main-content" className="intro-home-page">
      <section className="intro-hero" aria-labelledby="intro-home-title">
        <div className="intro-hero-copy">
          <span className="eyebrow">NovaCommerce</span>
          <h1 id="intro-home-title">
            NovaCommerce - website bán đồ công nghệ tổng hợp
          </h1>
          <p>
            Khám phá các sản phẩm công nghệ cho học tập, làm việc, giải trí và
            nâng cấp góc làm việc. Storefront này dành cho khách hàng xem hàng,
            thêm vào giỏ và mua hàng sau khi đăng nhập.
          </p>
          <div className="intro-actions">
            <Link className="button primary" to="/products">
              Xem sản phẩm <ArrowRight aria-hidden="true" />
            </Link>
            <Link className="button secondary" to="/products#categories">
              Khám phá danh mục
            </Link>
          </div>
        </div>
        <div className="intro-card-grid" aria-label="Điểm nổi bật NovaCommerce">
          <article className="intro-feature-card featured">
            <Sparkles aria-hidden="true" />
            <strong>Sản phẩm mới</strong>
            <span>Cập nhật theo hàng mới được cửa hàng thêm vào.</span>
          </article>
          <article className="intro-feature-card">
            <ShoppingBag aria-hidden="true" />
            <strong>Bán chạy</strong>
            <span>Dựa trên dữ liệu mua hàng đã ghi nhận.</span>
          </article>
          <article className="intro-feature-card">
            <BadgeCheck aria-hidden="true" />
            <strong>Ưu đãi</strong>
            <span>Lọc nhanh sản phẩm đang giảm và còn hàng.</span>
          </article>
        </div>
      </section>

      <section className="intro-highlights" aria-label="Giới thiệu cửa hàng">
        {highlights.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.title}>
              <Icon aria-hidden="true" />
              <h2>{item.title}</h2>
              <p>{item.copy}</p>
            </article>
          );
        })}
      </section>
    </main>
  );
}
