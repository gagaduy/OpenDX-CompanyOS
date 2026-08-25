// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const modelLoaderMocks = vi.hoisted(() => ({
  preload: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("../lib/homepage-model-loader", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("../lib/homepage-model-loader")
  >();
  return {
    ...original,
    preloadHomepageModel: modelLoaderMocks.preload,
    clearHomepageModelCache: modelLoaderMocks.clear,
  };
});

vi.mock("@react-three/fiber", () => ({
  Canvas: ({
    children: _children,
    dpr,
    frameloop,
  }: {
    readonly children?: ReactNode;
    readonly dpr?: number;
    readonly frameloop?: string;
  }) => (
    <div
      data-testid="mock-canvas"
      data-dpr={String(dpr)}
      data-frameloop={frameloop}
    />
  ),
  useFrame: vi.fn(),
}));

describe("homepage scroll experience", () => {
  beforeEach(() => {
    localStorage.clear();
    modelLoaderMocks.preload.mockReset().mockResolvedValue({});
    modelLoaderMocks.clear.mockReset().mockResolvedValue(undefined);
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

  it("advances preload stages only at the approved scroll thresholds", () => {
    let scheduledFrame: FrameRequestCallback | undefined;
    let scrollY = 479;
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
      get: () => scrollY,
    });

    render(<ScrollHarness reducedMotion={false} />);
    const journey = screen.getByTestId("journey");
    Object.defineProperty(journey, "scrollHeight", {
      configurable: true,
      value: 7_000,
    });
    vi.spyOn(journey, "getBoundingClientRect").mockImplementation(() =>
      rectangle({ top: -scrollY, height: 7_000 }),
    );

    fireEvent.scroll(window);
    act(() => scheduledFrame?.(0));
    expect(screen.getByTestId("preload-stage")).toHaveTextContent("0");

    scrollY = 480;
    fireEvent.scroll(window);
    act(() => scheduledFrame?.(0));
    expect(screen.getByTestId("preload-stage")).toHaveTextContent("1");

    scrollY = 2_400;
    fireEvent.scroll(window);
    act(() => scheduledFrame?.(0));
    expect(screen.getByTestId("preload-stage")).toHaveTextContent("2");
  });
});

describe("homepage rendering preferences", () => {
  beforeEach(() => {
    localStorage.clear();
    modelLoaderMocks.preload.mockReset().mockResolvedValue({});
    modelLoaderMocks.clear.mockReset().mockResolvedValue(undefined);
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
        preloadStage={0}
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

  it("preloads model groups once as the journey advances and disposes the cache", async () => {
    const progress = { current: 0 };
    const preferences = {
      theme: "dark" as const,
      reducedMotion: false,
      tier: "high" as const,
      budget: { dpr: 1.75, shadows: true, idleMotion: true },
    };
    const { rerender, unmount } = render(
      <ExperienceCanvas
        progress={progress}
        preloadStage={0}
        preferences={preferences}
        onFatalError={vi.fn()}
      />,
    );

    await waitFor(() => expect(modelLoaderMocks.preload).toHaveBeenCalledTimes(1));
    expect(modelLoaderMocks.preload.mock.calls[0]?.[0]).toMatchObject({ id: "laptop" });

    rerender(
      <ExperienceCanvas
        progress={progress}
        preloadStage={1}
        preferences={preferences}
        onFatalError={vi.fn()}
      />,
    );
    await waitFor(() => expect(modelLoaderMocks.preload).toHaveBeenCalledTimes(2));
    expect(modelLoaderMocks.preload.mock.calls[1]?.[0]).toMatchObject({ id: "smartphone" });

    rerender(
      <ExperienceCanvas
        progress={progress}
        preloadStage={2}
        preferences={preferences}
        onFatalError={vi.fn()}
      />,
    );
    await waitFor(() => expect(modelLoaderMocks.preload).toHaveBeenCalledTimes(4));
    expect(modelLoaderMocks.preload.mock.calls.slice(2).map(([asset]) => asset.id)).toEqual([
      "headphones",
      "game-controller",
    ]);

    rerender(
      <ExperienceCanvas
        progress={progress}
        preloadStage={2}
        preferences={preferences}
        onFatalError={vi.fn()}
      />,
    );
    expect(modelLoaderMocks.preload).toHaveBeenCalledTimes(4);
    unmount();
    expect(modelLoaderMocks.clear).toHaveBeenCalledWith({ dispose: true });
  });

  it("stops rendering while hidden and avoids continuous idle motion when reduced", () => {
    const progress = { current: 0 };
    let hidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
    const { rerender } = render(
      <ExperienceCanvas
        progress={progress}
        preloadStage={0}
        preferences={{
          theme: "dark",
          reducedMotion: false,
          tier: "high",
          budget: { dpr: 1.75, shadows: true, idleMotion: true },
        }}
        onFatalError={vi.fn()}
      />,
    );
    expect(screen.getByTestId("mock-canvas")).toHaveAttribute("data-frameloop", "always");

    hidden = true;
    fireEvent(document, new Event("visibilitychange"));
    expect(screen.getByTestId("mock-canvas")).toHaveAttribute("data-frameloop", "never");

    hidden = false;
    fireEvent(document, new Event("visibilitychange"));
    rerender(
      <ExperienceCanvas
        progress={progress}
        preloadStage={0}
        preferences={{
          theme: "dark",
          reducedMotion: true,
          tier: "low",
          budget: { dpr: 1, shadows: false, idleMotion: false },
        }}
        onFatalError={vi.fn()}
      />,
    );
    expect(screen.getByTestId("mock-canvas")).toHaveAttribute("data-frameloop", "demand");
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
      <output data-testid="preload-stage">{director.preloadStage}</output>
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
