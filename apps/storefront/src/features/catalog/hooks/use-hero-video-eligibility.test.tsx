// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHeroVideoEligibility } from "./use-hero-video-eligibility";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useHeroVideoEligibility", () => {
  it.each([
    { desktop: true, reducedMotion: false, expected: true },
    { desktop: false, reducedMotion: false, expected: false },
    { desktop: true, reducedMotion: true, expected: false },
    { desktop: false, reducedMotion: true, expected: false },
  ])(
    "returns $expected for desktop=$desktop and reducedMotion=$reducedMotion",
    ({ desktop, reducedMotion, expected }) => {
      installMatchMedia({ desktop, reducedMotion });

      const { result } = renderHook(() => useHeroVideoEligibility());

      expect(result.current).toBe(expected);
    },
  );

  it("updates for either query and removes both listeners on unmount", () => {
    const queries = installMatchMedia({ desktop: false, reducedMotion: false });
    const { result, unmount } = renderHook(() => useHeroVideoEligibility());

    expect(result.current).toBe(false);
    act(() => queries.desktop.change(true));
    expect(result.current).toBe(true);
    act(() => queries.reducedMotion.change(true));
    expect(result.current).toBe(false);
    act(() => queries.reducedMotion.change(false));
    expect(result.current).toBe(true);

    unmount();
    expect(queries.desktop.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
    expect(queries.reducedMotion.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });

  it("fails safe when matchMedia is unavailable", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: undefined,
    });

    const { result } = renderHook(() => useHeroVideoEligibility());

    expect(result.current).toBe(false);
  });
});

function installMatchMedia(initial: {
  readonly desktop: boolean;
  readonly reducedMotion: boolean;
}) {
  const desktop = mediaQuery("(min-width: 768px)", initial.desktop);
  const reducedMotion = mediaQuery(
    "(prefers-reduced-motion: reduce)",
    initial.reducedMotion,
  );
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => {
      if (query === desktop.media) return desktop;
      if (query === reducedMotion.media) return reducedMotion;
      throw new Error(`Unexpected media query: ${query}`);
    }),
  });
  return { desktop, reducedMotion };
}

function mediaQuery(query: string, initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const addEventListener = vi.fn(
    (_type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === "function") {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    },
  );
  const removeEventListener = vi.fn(
    (_type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === "function") {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    },
  );
  const media = {
    get matches() {
      return matches;
    },
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener,
    removeEventListener,
    dispatchEvent: vi.fn(() => false),
    change(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches, media: query } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
  return media as unknown as MediaQueryList & {
    change(nextMatches: boolean): void;
    addEventListener: typeof addEventListener;
    removeEventListener: typeof removeEventListener;
  };
}
