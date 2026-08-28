// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StorefrontHero } from "../components/storefront-hero";
import type {
  StorefrontHeroSlide,
  StorefrontProduct,
} from "../types/catalog.types";

const laptop = product("laptop", "Nova Laptop", "Laptops");
const phone = product("phone", "Nova Phone", "Phones");
const slides: readonly StorefrontHeroSlide[] = [
  {
    category: { id: "category-laptops", name: "Laptops", slug: "laptops" },
    product: laptop,
  },
  {
    category: {
      id: "category-phones",
      name: "Phones",
      slug: "phones & wearables",
    },
    product: phone,
  },
];

beforeEach(() => {
  mockReducedMotion(false);
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
});

describe("StorefrontHero category carousel", () => {
  it("loops every five seconds and resets the interval after manual selection", () => {
    vi.useFakeTimers();
    renderHero({ slides, fallbackProduct: laptop });

    expect(screen.getByRole("heading", { name: "Nova Laptop" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Laptops" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("link", { name: "Khám phá ngay" })).toHaveAttribute(
      "href",
      "/products?category=laptops#catalog",
    );
    expect(screen.getByRole("button", { name: "Slide tiếp theo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Slide trước" })).toBeVisible();

    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByRole("heading", { name: "Nova Phone" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Khám phá ngay" })).toHaveAttribute(
      "href",
      "/products?category=phones%20%26%20wearables#catalog",
    );

    fireEvent.click(screen.getByRole("button", { name: "Laptops" }));
    act(() => vi.advanceTimersByTime(4_999));
    expect(screen.getByRole("heading", { name: "Nova Laptop" })).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("heading", { name: "Nova Phone" })).toBeVisible();
  });

  it("pauses for hover and focus then resumes with a full interval", () => {
    vi.useFakeTimers();
    renderHero({ slides, fallbackProduct: laptop });
    const hero = screen.getByRole("region", {
      name: "Danh mục sản phẩm nổi bật",
    });

    fireEvent.mouseEnter(hero);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("heading", { name: "Nova Laptop" })).toBeVisible();
    fireEvent.mouseLeave(hero);
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByRole("heading", { name: "Nova Phone" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Laptops" }));
    const phoneButton = screen.getByRole("button", { name: "Phones" });
    fireEvent.focus(phoneButton);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("heading", { name: "Nova Laptop" })).toBeVisible();
    fireEvent.blur(phoneButton, { relatedTarget: null });
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByRole("heading", { name: "Nova Phone" })).toBeVisible();
  });

  it("pauses for hidden documents and disables autoplay for reduced motion", () => {
    vi.useFakeTimers();
    const { unmount } = renderHero({ slides, fallbackProduct: laptop });

    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("heading", { name: "Nova Laptop" })).toBeVisible();
    unmount();

    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    mockReducedMotion(true);
    renderHero({ slides, fallbackProduct: laptop });
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("heading", { name: "Nova Laptop" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Phones" }));
    expect(screen.getByRole("heading", { name: "Nova Phone" })).toBeVisible();
  });

  it("skips failed slide images and stops rotating with one valid slide", () => {
    vi.useFakeTimers();
    renderHero({ slides, fallbackProduct: laptop });

    fireEvent.error(screen.getByRole("img", { name: "Nova Laptop image" }));
    expect(screen.getByRole("heading", { name: "Nova Phone" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Laptops" })).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.getByRole("heading", { name: "Nova Phone" })).toBeVisible();
  });

  it("uses the existing product hero as fallback and omits an unusable empty hero", () => {
    const { rerender } = renderHero({ slides: [], fallbackProduct: laptop });

    expect(screen.getByRole("heading", { name: "Nova Laptop" })).toBeVisible();
    expect(
      screen.queryByRole("group", { name: "Chọn danh mục nổi bật" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Khám phá ngay" })).toHaveAttribute(
      "href",
      "/products/laptop",
    );

    fireEvent.error(screen.getByRole("img", { name: "Nova Laptop image" }));
    expect(
      screen.queryByRole("region", { name: "Danh mục sản phẩm nổi bật" }),
    ).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <StorefrontHero
          presentation={{ slides: [] }}
          apiBaseUrl="http://localhost:4000"
        />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("region", { name: "Danh mục sản phẩm nổi bật" }),
    ).not.toBeInTheDocument();
  });
});

function renderHero(props: {
  readonly slides: readonly StorefrontHeroSlide[];
  readonly fallbackProduct?: StorefrontProduct;
}) {
  return render(
    <MemoryRouter>
      <StorefrontHero
        presentation={{ slides: [...props.slides] }}
        fallbackProduct={props.fallbackProduct}
        apiBaseUrl="http://localhost:4000"
      />
    </MemoryRouter>,
  );
}

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  });
}

function product(
  slug: string,
  name: string,
  categoryName: string,
): StorefrontProduct {
  return {
    id: `${slug}-id`,
    categoryId: `${categoryName}-id`,
    categoryName,
    name,
    slug,
    description: `${name} description`,
    attributes: {},
    primaryMedia: {
      id: `${slug}-media`,
      altText: `${name} image`,
      contentUrl: `/media/${slug}`,
    },
    variants: [
      {
        id: `${slug}-variant`,
        sku: `${slug.toUpperCase()}-SKU`,
        title: "Default",
        optionValues: {},
        price: { amountMinor: 10_000_000, currency: "VND" },
        availableQuantity: 2,
        purchasable: true,
      },
    ],
  };
}
