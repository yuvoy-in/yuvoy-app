"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { components } from "@/lib/api/schema.gen";
import { cn } from "@/lib/cn";

type Media = components["schemas"]["Media"];

/**
 * Poster-first video.
 *
 * The architecture, not a fallback. `posterUrl` always resolves; `hlsUrl` is
 * not populated before M15 and may never be for a given clip. A card is
 * COMPLETE with only a poster — playback is progressive enhancement, and on a
 * 0.5-3 Mbps connection the poster is what most travellers see anyway.
 *
 * Three rules hold this together:
 *   - Scroll is never blocked on a network request.
 *   - hls.js (~150 KB) is imported only when the browser cannot play HLS
 *     natively. Safari and iOS can, and that is most of our traffic.
 *   - A failed clip degrades to its poster silently. A broken-video icon on
 *     the feed reads as a broken app.
 */
export function FeedPlayer({
  media,
  active,
  mounted,
  muted,
  autoplayAllowed,
  className,
}: {
  media: Media;
  /** This card fills the viewport. */
  active: boolean;
  /** Inside the preload budget — may hold a video element at all. */
  mounted: boolean;
  muted: boolean;
  autoplayAllowed: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playable, setPlayable] = useState(false);
  const [failed, setFailed] = useState(false);

  const src = media.hlsUrl;
  const canPlay = Boolean(src) && mounted && autoplayAllowed && !failed;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !canPlay) return;

    let hls: { destroy: () => void } | null = null;
    let cancelled = false;

    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";

    void (async () => {
      try {
        if (nativeHls) {
          video.src = src;
          setPlayable(true);
          return;
        }
        // Only reached off Safari/iOS. Dynamic so the bytes never load for
        // the browsers that do not need them.
        const { default: Hls } = await import("hls.js");
        if (cancelled) return;
        if (!Hls.isSupported()) {
          setFailed(true);
          return;
        }
        const instance = new Hls({
          // Island connection: keep the buffer small so a stall recovers fast
          // rather than sitting on 30 seconds of stale segments.
          maxBufferLength: 10,
          maxMaxBufferLength: 20,
          // Keeps the rendition matched to a phone-sized element rather than
          // fetching a 1080p ladder for a 480px column.
          capLevelToPlayerSize: true,
        });
        hls = instance;
        instance.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) setFailed(true);
        });
        instance.loadSource(src);
        instance.attachMedia(video);
        setPlayable(true);
      } catch {
        setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [src, canPlay]);

  // Play/pause follows the active card. Never autoplay off-screen.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playable) return;
    if (active && autoplayAllowed) {
      void video.play().catch(() => {
        // Autoplay refused by the browser is a normal outcome, not an error.
        // The poster stays and the traveller can tap.
      });
    } else {
      video.pause();
    }
  }, [active, playable, autoplayAllowed]);

  return (
    <div
      className={cn(
        "bg-abyss relative h-full w-full overflow-hidden",
        className,
      )}
    >
      {/*
        The poster is an <Image>, not a background: it is the LCP element on
        the feed and needs the optimiser's sizing and priority handling.
      */}
      <Image
        src={media.posterUrl}
        alt={media.alt ?? ""}
        fill
        sizes="(min-width: 1024px) 480px, 100vw"
        className="object-cover"
        // The first card is the LCP element; the rest are below the fold.
        priority={active}
        unoptimized={media.posterUrl.startsWith("data:")}
      />

      {canPlay ? (
        <video
          ref={videoRef}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
            playable && active ? "opacity-100" : "opacity-0",
          )}
          muted={muted}
          playsInline
          loop
          // Never `auto`. The poster is already showing; the bytes are only
          // fetched once this card is inside the preload budget.
          preload="none"
          aria-hidden="true"
          tabIndex={-1}
        />
      ) : null}
    </div>
  );
}
