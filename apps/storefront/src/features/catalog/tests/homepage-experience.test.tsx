// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../app/theme-provider";
import { ExperienceCanvas } from "../components/homepage-experience/experience-canvas";
import { ExperienceErrorBoundary } from "../components/homepage-experience/experience-error-boundary";
import { ExperienceLoadingStatus } from "../components/homepage-experience/experience-loading-status";
import { ExperienceSceneNavigation } from "../components/homepage-experience/experience-scene-navigation";
import { useHomepagePreferences } from "../hooks/use-homepage-preferences";
import { useHomepageScroll } from "../hooks/use-homepage-scroll";
import { HOMEPAGE_SCENE_IDS } from "../types/homepage-experience.types";

vi.mock("@react-three/fiber", () => ({
  Canvas: ({
    children: _children,
    dpr,
  }: {
    readonly children?: ReactNode;
    readonly dpr?: number;
  }) => (
    <div data-testid="mock-canvas" data-dpr={String(dpr)} />
  ),
  useFrame: vi.fn(),
}));

describe("homepage scroll experience", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => mediaQuery(false)),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("coalesces scroll progress and marks the active scene", () => {
    let scheduledFrame: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 1_000,
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 4_000,
    });

    render(<ScrollHarness reducedMotion={false} />);
    const journey = screen.getByTestId("journey");
    Object.defineProperty(journey, "scrollHeight", {
      configurable: true,
      value: 7_000,
    });
    vi.spyOn(journey, "getBoundingClientRect").mockReturnValue(
      rectangle({ top: -4_000, height: 7_000 }),
    );

    fireEvent.scroll(window);
    act(() => scheduledFrame?.(0));

    expect(screen.getByTestId("active-scene")).toHaveTextContent("gaming");
    expect(screen.getByRole("button", { name: "Gaming" })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("scrolls to a selected scene and disables smooth motion when requested", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const scrollIntoView = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    const { rerender } = render(<ScrollHarness reducedMotion={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Gaming" }));
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "smooth",
      block: "start",
    });

    rerender(<ScrollHarness reducedMotion />);
    await userEvent.click(screen.getByRole("button", { name: "Điện thoại" }));
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "auto",
      block: "start",
    });
  });
});

describe("homepage rendering preferences", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => mediaQuery(false)),
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1_440,
    });
    Object.defineProperty(navigator, "hardwareConcurrency", {
      configurable: true,
      value: 8,
    });
  });

  it("selects the static experience when WebGL is unavailable", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(
      <ThemeProvider>
        <PreferencesProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("preferences")).toHaveTextContent("dark|static|false");
  });

  it("propagates light showroom theme and renderer budget", () => {
    const progress = { current: 0 };
    render(
      <ExperienceCanvas
        progress={progress}
        preferences={{
          theme: "light",
          reducedMotion: false,
          tier: "high",
          budget: { dpr: 1.75, shadows: true, idleMotion: true },
        }}
        onFatalError={vi.fn()}
      />,
    );
    expect(screen.getByTestId("homepage-canvas-layer")).toHaveAttribute(
      "data-showroom-theme",
      "light",
    );
    expect(screen.getByTestId("mock-canvas")).toHaveAttribute("data-dpr", "1.75");
  });

  it("isolates a fatal canvas child error", () => {
    const onFatalError = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <ExperienceErrorBoundary onFatalError={onFatalError}>
        <BrokenExperience />
      </ExperienceErrorBoundary>,
    );
    expect(onFatalError).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("unreachable")).not.toBeInTheDocument();
  });

  it("clamps and exposes critical model loading progress", () => {
    const { rerender } = render(<ExperienceLoadingStatus progress={42.8} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
    expect(screen.getByText("42%")).toBeVisible();
    rerender(<ExperienceLoadingStatus progress={120} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
});

function ScrollHarness({ reducedMotion }: { readonly reducedMotion: boolean }) {
  const journeyRef = useRef<HTMLDivElement>(null);
  const director = useHomepageScroll(journeyRef, { reducedMotion });
  return (
    <div>
      <ExperienceSceneNavigation
        activeScene={director.activeScene}
        onSelect={director.selectScene}
      />
      <output data-testid="active-scene">{director.activeScene}</output>
      <div ref={journeyRef} data-testid="journey">
        {HOMEPAGE_SCENE_IDS.map((scene) => (
          <section id={`homepage-${scene}`} key={scene} />
        ))}
      </div>
    </div>
  );
}

function rectangle({
  top,
  height,
}: {
  readonly top: number;
  readonly height: number;
}): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    right: 1_000,
    bottom: top + height,
    left: 0,
    width: 1_000,
    height,
    toJSON: () => ({}),
  };
}

function PreferencesProbe() {
  const preferences = useHomepagePreferences();
  return (
    <output data-testid="preferences">
      {preferences.theme}|{preferences.tier}|{String(preferences.reducedMotion)}
    </output>
  );
}

function BrokenExperience(): never {
  throw new Error("canvas failed");
}

function mediaQuery(matches: boolean): MediaQueryList {
  return {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}
