// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ArrowDown, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type FocusEvent,
} from "react";
import { Link } from "react-router-dom";
import { formatVnd } from "../../../shared/format/currency";
import { useDocumentVisibility } from "../hooks/use-document-visibility";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import type {
  StorefrontHeroPresentation,
  StorefrontProduct,
} from "../types/catalog.types";

export interface StorefrontHeroProps {
  readonly presentation: StorefrontHeroPresentation;
  readonly fallbackProduct?: StorefrontProduct;
  readonly apiBaseUrl: string;
}

export function StorefrontHero({
  presentation,
  fallbackProduct,
  apiBaseUrl,
}: StorefrontHeroProps) {
  const { slides } = presentation;
  const [activeIndex, setActiveIndex] = useState(0);
  const [manualEpoch, setManualEpoch] = useState(0);
  const [failedProductIds, setFailedProductIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const documentVisible = useDocumentVisibility();
  const reducedMotion = useReducedMotion();
  const availableSlides = useMemo(
    () => slides.filter(({ product }) => !failedProductIds.has(product.id)),
    [failedProductIds, slides],
  );
  const normalizedIndex =
    availableSlides.length === 0 ? 0 : activeIndex % availableSlides.length;
  const activeSlide = availableSlides[normalizedIndex];
  const fallbackUsable =
    fallbackProduct !== undefined &&
    !fallbackFailed &&
    !failedProductIds.has(fallbackProduct.id);
  const product =
    activeSlide?.product ?? (fallbackUsable ? fallbackProduct : undefined);

  useEffect(() => {
    if (availableSlides.length === 0 || activeIndex < availableSlides.length) {
      return;
    }
    setActiveIndex(0);
  }, [activeIndex, availableSlides.length]);

  useEffect(() => {
    if (
      availableSlides.length < 2 ||
      hovered ||
      focusWithin ||
      !documentVisible ||
      reducedMotion
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % availableSlides.length);
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [
    activeIndex,
    availableSlides.length,
    documentVisible,
    focusWithin,
    hovered,
    manualEpoch,
    reducedMotion,
  ]);

  if (product === undefined) return null;

  const prices = product.variants.map(({ price }) => price.amountMinor);
  const price = prices.length === 0 ? undefined : Math.min(...prices);
  const destination =
    activeSlide === undefined
      ? `/products/${product.slug}`
      : `/products?category=${encodeURIComponent(activeSlide.category.slug)}#catalog`;

  function selectSlide(index: number) {
    setActiveIndex(index);
    setManualEpoch((current) => current + 1);
  }

  function selectRelativeSlide(offset: number) {
    const next =
      (normalizedIndex + offset + availableSlides.length) % availableSlides.length;
    selectSlide(next);
  }

  function handleBlur(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setFocusWithin(false);
    }
  }

  function handleImageError() {
    if (activeSlide === undefined) {
      setFallbackFailed(true);
      return;
    }
    setFailedProductIds((current) => {
      const next = new Set(current);
      next.add(activeSlide.product.id);
      return next;
    });
  }

  return (
    <section
      className="storefront-hero"
      aria-label="Danh mục sản phẩm nổi bật"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={handleBlur}
    >
      <img
        className="hero-slide-image"
        key={product.id}
        src={new URL(product.primaryMedia.contentUrl, apiBaseUrl).toString()}
        alt={product.primaryMedia.altText}
        loading="eager"
        width="960"
        height="540"
        onError={handleImageError}
      />
      <div className="hero-scrim" />
      <div className="hero-content">
        <div className="hero-slide-copy" key={`copy-${product.id}`}>
          <span className="hero-eyebrow">Sản phẩm nổi bật</span>
          <h1>{product.name}</h1>
          <p>{product.description}</p>
          <div className="hero-actions">
            <Link className="button primary" to={destination}>
              Khám phá ngay <ArrowRight />
            </Link>
            {price === undefined ? null : <span>Từ {formatVnd(price)}</span>}
          </div>
        </div>
        {availableSlides.length === 0 ? null : (
          <div
            className="hero-category-selector"
            role="group"
            aria-label="Chọn danh mục nổi bật"
          >
            {availableSlides.map((slide, index) => (
              <button
                key={slide.category.id}
                type="button"
                aria-pressed={index === normalizedIndex}
                onClick={() => selectSlide(index)}
              >
                {slide.category.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {availableSlides.length > 1 ? (
        <div className="hero-carousel-controls">
          <button
            type="button"
            aria-label="Slide trước"
            onClick={() => selectRelativeSlide(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Slide tiếp theo"
            onClick={() => selectRelativeSlide(1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <a className="hero-scroll" href="#categories" aria-label="Xem danh mục">
        <ArrowDown />
      </a>
    </section>
  );
}
