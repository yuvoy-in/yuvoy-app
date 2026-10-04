"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  abandonLanding,
  disarmPeek,
  finishLanding,
  getPeek,
  getServerPeek,
  registerPeek,
  subscribePeek,
} from "@/lib/feed/listing-peek";
import { pathOf } from "@/lib/motion/route-motion";
import { isMediaGroundRoute } from "@/lib/site/nav";

/*
  Loaded the first time a reel arms it, never on the first paint: the
  listing's whole component tree has no business in the feed's first download.
*/
const ListingPreview = dynamic(
  () =>
    import("@/components/experience/listing-preview").then(
      (m) => m.ListingPreview,
    ),
  { ssr: false },
);

/** How long the page's picture may take before the preview goes anyway. */
const PICTURE_WAIT_MS = 400;

const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Resolves once the listing that rendered under the preview has its own
 * picture on screen, or after {@link PICTURE_WAIT_MS}: the preview fades away
 * over the page, so the page must not be missing the one thing at its top.
 */
async function pagePictureReady(): Promise<void> {
  const img = document.querySelector<HTMLImageElement>("main [data-frame] img");
  if (img && !img.complete) {
    await Promise.race([
      img.decode().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, PICTURE_WAIT_MS)),
    ]);
  }
  // Two frames: one for the page to paint, one for it to be on the glass.
  await frame();
  await frame();
}

/**
 * The listing that slides in from the right of a reel (T02 C): two layers the
 * swipe moves directly, a forest dim over the reel and the listing preview
 * over that, mounted only while a reel has armed it. See
 * `lib/feed/listing-peek.ts` for the whole gesture.
 *
 * Both layers are drawings until the route lands: `aria-hidden`, and the
 * preview `inert`, so nothing in it is reachable or announced twice. While the
 * listing completes and the route follows, the dim takes the taps that would
 * otherwise reach the reel beneath it.
 */
export function ListingPeek() {
  const peek = useSyncExternalStore(subscribePeek, getPeek, getServerPeek);
  const pathname = usePathname();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dimRef = useRef<HTMLDivElement | null>(null);
  const active = peek.phase !== "idle";

  useEffect(() => {
    const sheet = sheetRef.current;
    const dim = dimRef.current;
    if (!active || !sheet || !dim) return;
    return registerPeek({ sheet, dim });
  }, [active]);

  useEffect(() => {
    const listing = peek.href ? pathOf(peek.href) : null;

    if (peek.phase === "landing") {
      if (pathname === listing) {
        let cancelled = false;
        void pagePictureReady().then(() => {
          if (!cancelled) void finishLanding();
        });
        return () => {
          cancelled = true;
        };
      }
      // Still on the reel while the route is on its way; anywhere else, the
      // traveller went somewhere this preview does not lead.
      if (!isMediaGroundRoute(pathname)) abandonLanding();
      return;
    }

    // A preview armed on a reel screen means nothing once the screen is gone.
    if (peek.phase === "armed" && !isMediaGroundRoute(pathname)) disarmPeek();
  }, [peek.phase, peek.href, pathname]);

  if (!active) return null;

  return (
    <>
      <div
        ref={dimRef}
        aria-hidden="true"
        className="bg-forest pointer-events-none fixed inset-0 z-41 opacity-0"
        style={{ visibility: "hidden" }}
      />
      <div
        ref={sheetRef}
        aria-hidden="true"
        inert
        data-listing-peek=""
        className="fixed inset-0 z-42 overflow-hidden"
        style={{
          visibility: "hidden",
          contentVisibility: "hidden",
          transform: "translate3d(100%, 0, 0)",
        }}
      >
        {peek.slug ? (
          <ListingPreview slug={peek.slug} shown={peek.shown} />
        ) : null}
      </div>
    </>
  );
}
