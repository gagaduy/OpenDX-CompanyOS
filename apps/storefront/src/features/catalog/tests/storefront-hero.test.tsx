// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StorefrontHero } from "../components/storefront-hero";
import type {
  StorefrontHeroPresentation,
  StorefrontHeroSlide,
  StorefrontProduct,
} from "../types/catalog.types";

const eligibility = vi.hoisted(() => ({ value: false }));

vi.mock("../hooks/use-hero-video-eligibility", () => ({
  useHeroVideoEligibility: () => eligibility.value,
}));

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
  eligibility.value = false;
  mockReducedMotion(false);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
});

describe("StorefrontHero synchronized video", () => {
  it("renders eligible video media from the API origin with native playback attributes", () => {
    eligibility.value = true;
    renderHero({ presentation: videoPresentation(), fallbackProduct: laptop });

    expect(
      screen.getByRole("region", { name: "Danh mục sản phẩm nổi bật" }),
    ).toHaveClass("has-hero-video");
    const video = screen.getByTestId("hero-video") as HTMLVideoElement;
    expect(video).toHaveAttribute(
      "src",
      "http://localhost:4000/v1/storefront/hero-media/83000000-0000-4000-8000-000000000001/content",
    );
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("preload", "metadata");
  });

  it("does not render video when the client is ineligible or media is absent", () => {
    const presentation = videoPresentation();
    const { rerender } = renderHero({ presentation, fallbackProduct: laptop });
    expect(
      screen.getByRole("region", { name: "Danh mục sản phẩm nổi bật" }),
    ).not.toHaveClass("has-hero-video");
    expect(screen.queryByTestId("hero-video")).not.toBeInTheDocument();

    eligibility.value = true;
    rerender(
      <MemoryRouter>
        <StorefrontHero
          presentation={{ slides: [...slides] }}
          fallbackProduct={laptop}
          apiBaseUrl="http://localhost:4000"
        />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("hero-video")).not.toBeInTheDocument();
  });

  it("selects chapters from video time with deterministic boundaries and loop-to-zero", () => {
    eligibility.value = true;
    renderHero({ presentation: videoPresentation(), fallbackProduct: laptop });
    const video = prepareVideo();

    setVideoTime(video, 3.999);
    fireEvent.timeUpdate(video);
    expect(screen.getByRole("heading", { name: "Nova Laptop" })).toBeVisible();

    setVideoTime(video, 4);
    fireEvent.timeUpdate(video);
    expect(screen.getByRole("heading", { name: "Nova Phone" })).toBeVisible();

    setVideoTime(video, 8);
    fireEvent.timeUpdate(video);
    expect(screen.getByRole("heading", { name: "Nova Laptop" })).toBeVisible();
  });

  it("seeks on category and carousel selection and resumes unless manually paused", () => {
    eligibility.value = true;
    renderHero({ presentation: videoPresentation(), fallbackProduct: laptop });
    const video = prepareVideo();
    const play = vi.spyOn(video, "play").mockResolvedValue();

    fireEvent.click(screen.getByRole("button", { name: "Phones" }));
    expect(video.currentTime).toBe(4);
    expect(play).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Slide trước" }));
    expect(video.currentTime).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Slide tiếp theo" }));
    expect(video.currentTime).toBe(4);

    fireEvent.click(screen.getByRole("button", { name: "Tạm dừng video" }));
    play.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Laptops" }));
    expect(video.currentTime).toBe(0);
    expect(play).not.toHaveBeenCalled();
  });

  it("attempts playback after navigation then remains paused during transient interaction", () => {
    eligibility.value = true;
    renderHero({ presentation: videoPresentation(), fallbackProduct: laptop });
    const hero = screen.getByRole("region", {
      name: "Danh mục sản phẩm nổi bật",
    });
    const video = prepareVideo();
    const play = vi.spyOn(video, "play").mockResolvedValue();
    const pause = vi.spyOn(video, "pause").mockImplementation(() => undefined);

    fireEvent.mouseEnter(hero);
    play.mockClear();
    pause.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Phones" }));

    expect(video.currentTime).toBe(4);
    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(play.mock.invocationCallOrder[0]).toBeLessThan(
      pause.mock.invocationCallOrder[0]!,
    );

    play.mockClear();
    fireEvent.mouseLeave(hero);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("manual play resumes when the playback control retains focus", () => {
    eligibility.value = true;
    renderHero({ presentation: videoPresentation(), fallbackProduct: laptop });
    const video = prepareVideo();
    const play = vi.spyOn(video, "play").mockResolvedValue();
    const control = screen.getByRole("button", { name: "Tạm dừng video" });

    fireEvent.focus(control);
    fireEvent.click(control);
    expect(screen.getByRole("button", { name: "Phát video" })).toBeVisible();
    play.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Phát video" }));

    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Tạm dừng video" })).toBeVisible();
  });

  it("turns an automatic async playback rejection into an actionable retry", async () => {
    eligibility.value = true;
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
      new DOMException("Autoplay blocked", "NotAllowedError"),
    );

    renderHero({ presentation: videoPresentation(), fallbackProduct: laptop });
    await flushPlayback();

    expect(screen.getByTestId("hero-video")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Phát video" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Nova Laptop" })).toBeVisible();
  });

  it("settles a navigation playback rejection into a coherent paused state", async () => {
    eligibility.value = true;
    renderHero({ presentation: videoPresentation(), fallbackProduct: laptop });
    const video = prepareVideo();
    vi.spyOn(video, "play").mockRejectedValueOnce(
      new DOMException("Playback blocked", "NotAllowedError"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Phones" }));
    await flushPlayback();

    expect(screen.getByRole("heading", { name: "Nova Phone" })).toBeVisible();
    expect(screen.getByTestId("hero-video")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Phát video" })).toBeVisible();
  });

  it("ignores a delayed AbortError from navigation intentionally paused by hover", async () => {
    eligibility.value = true;
    renderHero({ presentation: videoPresentation(), fallbackProduct: laptop });
    const hero = screen.getByRole("region", {
      name: "Danh mục sản phẩm nổi bật",
    });
    const video = prepareVideo();
    const pendingNavigation = deferredPlayback();
    const play = vi
      .spyOn(video, "play")
      .mockReturnValueOnce(pendingNavigation.promise)
      .mockResolvedValueOnce();

    fireEvent.mouseEnter(hero);
    fireEvent.click(screen.getByRole("button", { name: "Phones" }));
    pendingNavigation.reject(new DOMException("Paused", "AbortError"));
    await flushPlayback();

    expect(screen.getByRole("button", { name: "Tạm dừng video" })).toBeVisible();
    fireEvent.mouseLeave(hero);
    await flushPlayback();
    expect(play).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Tạm dừng video" })).toBeVisible();
  });

  it("ignores an old automatic rejection after a newer explicit retry succeeds", async () => {
    eligibility.value = true;
    const oldAutomatic = deferredPlayback();
    vi.mocked(HTMLMediaElement.prototype.play)
      .mockReturnValueOnce(oldAutomatic.promise)
      .mockResolvedValueOnce();
    renderHero({ presentation: videoPresentation(), fallbackProduct: laptop });

    fireEvent.click(screen.getByRole("button", { name: "Tạm dừng video" }));
    fireEvent.click(screen.getByRole("button", { name: "Phát video" }));
    await flushPlayback();
    expect(screen.getByRole("button", { name: "Tạm dừng video" })).toBeVisible();

    oldAutomatic.reject(new DOMException("Old request failed", "NotAllowedError"));
    await flushPlayback();

    expect(screen.getByTestId("hero-video")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạm dừng video" })).toBeVisible();
  });

  it("activates image fallback when an explicit playback retry throws", async () => {
    eligibility.value = true;
    renderHero({ presentation: videoPresentation(), fallbackProduct: laptop });
    const video = prepareVideo();
    fireEvent.click(screen.getByRole("button", { name: "Tạm dừng video" }));
    vi.spyOn(video, "play").mockImplementation(() => {
      throw new DOMException("Playback unavailable", "NotSupportedError");
    });

    fireEvent.click(screen.getByRole("button", { name: "Phát video" }));
    await flushPlayback();

    expect(screen.queryByTestId("hero-video")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Nova Laptop image" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Nova Laptop" })).toBeVisible();
    expect(screen.getByText("Từ 10.000.000 ₫")).toBeVisible();
    expect(screen.getByRole("link", { name: "Khám phá ngay" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Phones" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Slide tiếp theo" })).toBeVisible();
  });

  it("pauses for interaction and visibility while preserving copy, then resumes appropriately", () => {
    eligibility.value = true;
    renderHero({ presentation: videoPresentation(), fallbackProduct: laptop });
    const hero = screen.getByRole("region", {
      name: "Danh mục sản phẩm nổi bật",
    });
    const video = prepareVideo();
    const play = vi.spyOn(video, "play").mockResolvedValue();
    const pause = vi.spyOn(video, "pause").mockImplementation(() => undefined);
    play.mockClear();

    fireEvent.mouseEnter(hero);
    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Nova Laptop" })).toBeVisible();
    fireEvent.mouseLeave(hero);
    expect(play).toHaveBeenCalled();

    play.mockClear();
    fireEvent.focus(screen.getByRole("button", { name: "Phones" }));
    expect(pause).toHaveBeenCalled();
    fireEvent.blur(screen.getByRole("button", { name: "Phones" }), {
      relatedTarget: null,
    });
    expect(play).toHaveBeenCalled();

    play.mockClear();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    fireEvent(document, new Event("visibilitychange"));
    expect(pause).toHaveBeenCalled();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    fireEvent(document, new Event("visibilitychange"));
    expect(play).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Tạm dừng video" }));
    expect(screen.getByRole("button", { name: "Phát video" })).toBeVisible();
    play.mockClear();
    fireEvent.mouseEnter(hero);
    fireEvent.mouseLeave(hero);
    expect(play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Phát video" }));
    expect(screen.getByRole("button", { name: "Tạm dừng video" })).toBeVisible();
    expect(play).toHaveBeenCalled();
  });

  it("falls back to the product image and keeps all commerce controls after video error", () => {
    eligibility.value = true;
    renderHero({ presentation: videoPresentation(), fallbackProduct: laptop });

    fireEvent.error(screen.getByTestId("hero-video"));

    expect(screen.queryByTestId("hero-video")).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Danh mục sản phẩm nổi bật" }),
    ).not.toHaveClass("has-hero-video");
    expect(screen.getByRole("img", { name: "Nova Laptop image" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Nova Laptop" })).toBeVisible();
    expect(screen.getByText("Từ 10.000.000 ₫")).toBeVisible();
    expect(screen.getByRole("link", { name: "Khám phá ngay" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Phones" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Slide tiếp theo" })).toBeVisible();
  });

  it("skips only a failed product image while video time continues selecting valid chapters", () => {
    eligibility.value = true;
    renderHero({ presentation: videoPresentation(), fallbackProduct: laptop });
    const video = prepareVideo();

    fireEvent.error(screen.getByRole("img", { name: "Nova Laptop image" }));
    expect(screen.getByRole("heading", { name: "Nova Phone" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Laptops" })).not.toBeInTheDocument();

    setVideoTime(video, 1);
    fireEvent.timeUpdate(video);
    expect(screen.getByRole("heading", { name: "Nova Phone" })).toBeVisible();
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
  readonly slides?: readonly StorefrontHeroSlide[];
  readonly presentation?: StorefrontHeroPresentation;
  readonly fallbackProduct?: StorefrontProduct;
}) {
  return render(
    <MemoryRouter>
      <StorefrontHero
        presentation={props.presentation ?? { slides: [...(props.slides ?? [])] }}
        fallbackProduct={props.fallbackProduct}
        apiBaseUrl="http://localhost:4000"
      />
    </MemoryRouter>,
  );
}

function videoPresentation(): StorefrontHeroPresentation {
  return {
    media: {
      id: "83000000-0000-4000-8000-000000000001",
      contentUrl:
        "/v1/storefront/hero-media/83000000-0000-4000-8000-000000000001/content",
      contentType: "video/mp4",
      byteSize: 25_000_000,
      durationMs: 8_000,
    },
    slides: [
      { ...slides[0]!, chapter: { startMs: 0, endMs: 4_000, label: "Laptop" } },
      { ...slides[1]!, chapter: { startMs: 4_000, endMs: 8_000, label: "Phone" } },
    ],
  };
}

function prepareVideo(): HTMLVideoElement {
  const video = screen.getByTestId("hero-video") as HTMLVideoElement;
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    writable: true,
    value: 0,
  });
  Object.defineProperty(video, "play", {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
  Object.defineProperty(video, "pause", {
    configurable: true,
    value: vi.fn(),
  });
  return video;
}

function setVideoTime(video: HTMLVideoElement, seconds: number) {
  video.currentTime = seconds;
}

async function flushPlayback() {
  await act(async () => {
    await Promise.resolve();
  });
}

function deferredPlayback() {
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<void>((_resolve, reject) => {
    rejectPromise = reject;
  });
  return { promise, reject: rejectPromise };
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
