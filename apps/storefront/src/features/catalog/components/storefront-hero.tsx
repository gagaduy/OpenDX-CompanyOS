// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  ArrowDown,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
} from "react";
import { Link } from "react-router-dom";
import { formatVnd } from "../../../shared/format/currency";
import { useDocumentVisibility } from "../hooks/use-document-visibility";
import { useHeroVideoEligibility } from "../hooks/use-hero-video-eligibility";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import type {
  StorefrontHeroPresentation,
  StorefrontProduct,
} from "../types/catalog.types";

export interface StorefrontHeroProps {
  readonly presentation: StorefrontHeroPresentation;
  readonly fallbackProduct?: StorefrontProduct;
  readonly apiBaseUrl: string;
  readonly videoEnabled?: boolean;
}

const playbackRequestToken = Symbol("storefrontHeroPlaybackRequest");

type HeroVideoElement = HTMLVideoElement & {
  [playbackRequestToken]?: object;
};

export function StorefrontHero({
  presentation,
  fallbackProduct,
  apiBaseUrl,
  videoEnabled = true,
}: StorefrontHeroProps) {
  const { slides } = presentation;
  const [activeIndex, setActiveIndex] = useState(0);
  const [manualEpoch, setManualEpoch] = useState(0);
  const [failedProductIds, setFailedProductIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [playbackRequest, setPlaybackRequest] = useState<
    "automatic" | "explicit" | undefined
  >("automatic");
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const videoRef = useRef<HeroVideoElement>(null);
  const documentVisible = useDocumentVisibility();
  const [lastDocumentVisible, setLastDocumentVisible] = useState(documentVisible);
  const reducedMotion = useReducedMotion();
  const videoEligible = useHeroVideoEligibility();
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
  const videoMedia = presentation.media;
  const videoMode =
    videoEnabled && videoEligible && videoMedia !== undefined && !videoFailed;
  const interactionPaused = hovered || focusWithin || !documentVisible;

  const attemptPlayback = useCallback(
    (
      video: HeroVideoElement,
      failureMode: "recoverable" | "fallback",
    ) => {
      const requestToken = {};
      video[playbackRequestToken] = requestToken;
      const handleFailure = () => {
        if (
          videoRef.current !== video ||
          video[playbackRequestToken] !== requestToken
        ) {
          return;
        }
        if (failureMode === "fallback") {
          setVideoFailed(true);
        } else {
          setManuallyPaused(true);
        }
      };
      try {
        const playback = video.play();
        if (playback !== undefined) void playback.catch(handleFailure);
      } catch {
        handleFailure();
      }
    },
    [],
  );

  useEffect(() => {
    setVideoFailed(false);
    setManuallyPaused(false);
    setPlaybackRequest("automatic");
  }, [presentation.media?.id]);

  useEffect(() => {
    if (lastDocumentVisible === documentVisible) return;
    setLastDocumentVisible(documentVisible);
    if (
      documentVisible &&
      !hovered &&
      !focusWithin &&
      !manuallyPaused
    ) {
      setPlaybackRequest("automatic");
    }
  }, [
    documentVisible,
    focusWithin,
    hovered,
    lastDocumentVisible,
    manuallyPaused,
  ]);

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
      reducedMotion ||
      videoMode
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
    videoMode,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!videoMode || video === null) return;

    if (interactionPaused || manuallyPaused) {
      pauseVideo(video);
      return;
    }
    if (playbackRequest === undefined) return;
    setPlaybackRequest(undefined);
    attemptPlayback(
      video,
      playbackRequest === "explicit" ? "fallback" : "recoverable",
    );
  }, [
    attemptPlayback,
    interactionPaused,
    manuallyPaused,
    playbackRequest,
    videoMode,
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
    if (videoMode) {
      const selected = availableSlides[index];
      const video = videoRef.current;
      if (selected?.chapter !== undefined && video !== null) {
        video.currentTime = selected.chapter.startMs / 1_000;
        if (!manuallyPaused) {
          attemptPlayback(video, "recoverable");
          if (interactionPaused) pauseVideo(video);
        }
      }
    }
  }

  function selectRelativeSlide(offset: number) {
    const next =
      (normalizedIndex + offset + availableSlides.length) % availableSlides.length;
    selectSlide(next);
  }

  function handleBlur(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setFocusWithin(false);
      if (!hovered && !manuallyPaused && documentVisible) {
        setPlaybackRequest("automatic");
      }
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

  function handleTimeUpdate() {
    const video = videoRef.current;
    const durationMs = videoMedia?.durationMs;
    if (video === null || durationMs === undefined || durationMs <= 0) return;
    const elapsedMs = Math.max(0, video.currentTime * 1_000) % durationMs;
    const timedSlide = presentation.slides.find(
      ({ chapter }) =>
        chapter !== undefined &&
        elapsedMs >= chapter.startMs &&
        elapsedMs < chapter.endMs,
    );
    if (timedSlide === undefined || failedProductIds.has(timedSlide.product.id)) {
      return;
    }
    const nextIndex = availableSlides.findIndex(
      ({ product: candidate }) => candidate.id === timedSlide.product.id,
    );
    if (nextIndex >= 0) setActiveIndex(nextIndex);
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (video === null) return;
    if (manuallyPaused) {
      setManuallyPaused(false);
      setPlaybackRequest("explicit");
      return;
    }
    setManuallyPaused(true);
    pauseVideo(video);
  }

  return (
    <section
      className={`storefront-hero${videoMode ? " has-hero-video" : ""}`}
      aria-label="Danh mục sản phẩm nổi bật"
      onMouseEnter={(event) => {
        if (!isPlaybackControlTarget(event.target)) setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
        if (!focusWithin && !manuallyPaused && documentVisible) {
          setPlaybackRequest("automatic");
        }
      }}
      onFocus={(event) => {
        if (!isPlaybackControlTarget(event.target)) setFocusWithin(true);
      }}
      onBlur={handleBlur}
    >
      {videoMode && videoMedia !== undefined ? (
        <video
          key={videoMedia.id}
          ref={videoRef}
          className="hero-video-background"
          data-testid="hero-video"
          src={new URL(videoMedia.contentUrl, apiBaseUrl).toString()}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          onTimeUpdate={handleTimeUpdate}
          onError={() => setVideoFailed(true)}
        />
      ) : null}
      <div className="hero-scrim" />
      <img
        className="hero-slide-image hero-product-stage"
        key={product.id}
        src={new URL(product.primaryMedia.contentUrl, apiBaseUrl).toString()}
        alt={product.primaryMedia.altText}
        loading="eager"
        width="960"
        height="540"
        onError={handleImageError}
      />
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
      {videoMode ? (
        <button
          className="hero-playback-control"
          type="button"
          aria-label={manuallyPaused ? "Phát video" : "Tạm dừng video"}
          onClick={togglePlayback}
          onMouseEnter={() => {
            setHovered(false);
            if (!focusWithin && !manuallyPaused && documentVisible) {
              setPlaybackRequest("automatic");
            }
          }}
          onMouseLeave={() => setHovered(true)}
          onFocus={() => {
            setFocusWithin(false);
            if (!hovered && !manuallyPaused && documentVisible) {
              setPlaybackRequest("automatic");
            }
          }}
        >
          {manuallyPaused ? (
            <Play aria-hidden="true" />
          ) : (
            <Pause aria-hidden="true" />
          )}
        </button>
      ) : null}
      <a className="hero-scroll" href="#categories" aria-label="Xem danh mục">
        <ArrowDown />
      </a>
    </section>
  );
}

function isPlaybackControlTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(".hero-playback-control") !== null
  );
}

function pauseVideo(video: HeroVideoElement) {
  delete video[playbackRequestToken];
  video.pause();
}
