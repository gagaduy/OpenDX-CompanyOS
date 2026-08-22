// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { HomepageCatalogState } from "../../hooks/use-homepage-catalog";
import { HomepageProductOverlay } from "./homepage-product-overlay";
import { HomepageSceneSection } from "./homepage-scene-section";

export function StaticHomepageExperience({
  catalog,
  apiBaseUrl,
}: {
  readonly catalog: HomepageCatalogState;
  readonly apiBaseUrl: string;
}) {
  return (
    <div className="homepage-semantic-journey">
      {catalog.loading ? (
        <p role="status" className="homepage-catalog-status">
          Đang tải sản phẩm nổi bật...
        </p>
      ) : null}
      {catalog.error === undefined ? null : (
        <div role="alert" className="homepage-catalog-status">
          <p>{catalog.error}</p>
          <button className="button secondary" onClick={() => void catalog.retry()}>
            Thử tải lại
          </button>
        </div>
      )}

      <HomepageSceneSection
        scene="intro"
        eyebrow="NovaCommerce"
        heading="Bước vào tương lai"
        copy="Khám phá đồ công nghệ cho học tập, làm việc, giải trí và nâng cấp không gian sống trong một cửa hàng đáng tin cậy."
      >
        <div className="intro-actions">
          <Link className="button primary" to="/products">
            Xem sản phẩm <ArrowRight aria-hidden="true" />
          </Link>
          <Link className="button secondary" to="/products#categories">
            Khám phá danh mục
          </Link>
        </div>
      </HomepageSceneSection>

      <HomepageSceneSection
        scene="smartphones"
        eyebrow="Kết nối"
        heading="Điện thoại cho mọi kết nối"
        copy="Thiết bị di động phục vụ liên lạc, sáng tạo và giải trí mỗi ngày."
      >
        <HomepageProductOverlay
          product={catalog.sceneProducts.smartphones}
          apiBaseUrl={apiBaseUrl}
          fallbackHref="/products?category=phones#catalog"
        />
      </HomepageSceneSection>

      <HomepageSceneSection
        scene="computing"
        eyebrow="Hiệu năng"
        heading="Hiệu năng cho công việc"
        copy="Laptop và máy tính được chọn cho học tập, công việc chuyên nghiệp và sáng tạo."
      >
        <HomepageProductOverlay
          product={catalog.sceneProducts.computing}
          apiBaseUrl={apiBaseUrl}
          fallbackHref="/products?category=laptops#catalog"
        />
      </HomepageSceneSection>

      <HomepageSceneSection
        scene="audio"
        eyebrow="Âm thanh"
        heading="Âm thanh trong từng khoảnh khắc"
        copy="Tai nghe và thiết bị đeo giúp trải nghiệm nội dung rõ ràng, liền mạch hơn."
      >
        <HomepageProductOverlay
          product={catalog.sceneProducts.audio}
          apiBaseUrl={apiBaseUrl}
          fallbackHref="/products?query=headphones#catalog"
        />
      </HomepageSceneSection>

      <HomepageSceneSection
        scene="gaming"
        eyebrow="Gaming"
        heading="Sẵn sàng cho cuộc chơi"
        copy="Phụ kiện gaming cân bằng giữa khả năng điều khiển, độ bền và cảm giác sử dụng."
      >
        <HomepageProductOverlay
          product={catalog.sceneProducts.gaming}
          apiBaseUrl={apiBaseUrl}
          fallbackHref="/products?query=controller#catalog"
        />
      </HomepageSceneSection>

      <HomepageSceneSection
        scene="featured"
        eyebrow="Tuyển chọn"
        heading="Sản phẩm nổi bật"
        copy="Các sản phẩm được lựa chọn từ dữ liệu bán hàng và Catalog hiện tại của NovaCommerce."
      >
        <div className="homepage-featured-products">
          {catalog.featuredProducts.length > 0 ? (
            catalog.featuredProducts.map((product) => (
              <HomepageProductOverlay
                key={product.id}
                product={product}
                apiBaseUrl={apiBaseUrl}
                fallbackHref="/products#catalog"
              />
            ))
          ) : (
            <HomepageProductOverlay
              apiBaseUrl={apiBaseUrl}
              fallbackHref="/products#catalog"
            />
          )}
        </div>
      </HomepageSceneSection>
    </div>
  );
}
