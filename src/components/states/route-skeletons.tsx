import { LoadingState, Skeleton } from "@/components/states";
import { Screen } from "@/components/chrome/screen";

/**
 * The route-level fallbacks — what a `loading.tsx` renders.
 *
 * ## Why these exist at all
 *
 * Every dynamic route in this app used to have no loading boundary, and that
 * is one fact with two expensive consequences. Next skips prefetching a
 * dynamic route entirely unless it can find a `loading.tsx` to prefetch, so
 * tapping Feed paid a cold server round trip every single time. And with no
 * Suspense boundary to fall back to, the router holds the OLD screen on the
 * glass until the new one has fully rendered on the server — no spinner, no
 * skeleton, nothing. The tap looks ignored. That is the whole of the "clicking
 * a nav link lags and opens after some time" report.
 *
 * With a boundary, both change: the route becomes partially prefetchable, and
 * the fallback paints in the first frame after the tap.
 *
 * ## They are chassis-first, not content-first
 *
 * Each fallback draws the REAL chassis — the same `Screen`, the same
 * `ReelFrame` — and puts skeletons only where the content goes. The frame is
 * therefore already in its final position when the content arrives, so the
 * swap moves nothing. A generic centred spinner would paint, then be replaced
 * by a completely different layout, which reads as two loads rather than one.
 *
 * ## One boundary per chassis, not one per route
 *
 * There are two chassis in this app and so two fallbacks here. A route picks
 * the one it wears in a three-line `loading.tsx`. `loading.test.ts` pins that
 * every dynamic route has one, so a new dynamic route cannot go back to
 * having none.
 */

/**
 * The stage-and-sheet chassis: everything that is not a reel.
 *
 * `back` and `stageLabel` are passed through so a FOCUSED route's fallback can
 * wear the chassis that route actually wears. By default neither is drawn: a
 * fallback usually cannot know where back leads, and a disc that flashes the
 * wrong destination is worse than one that arrives with the screen.
 *
 * `/booking` is the exception that made this necessary. Its screen renders
 * `<Screen back={{href:"/trips"}} stageLabel="Your booking">`, so a fallback
 * without them swapped a wordmark for a back disc, grew a centred label and
 * changed the foot from tab clearance to `pb-8` — the "two loads" flash this
 * file exists to prevent, on the one screen a traveller opens from a link
 * somebody sent them. Where the target IS knowable, pass it.
 */
export function SheetSkeleton({
  width = "md",
  back,
  stageLabel,
}: {
  width?: "md" | "lg";
  back?: { href: string; label: string };
  stageLabel?: string;
}) {
  return (
    <Screen width={width} back={back} stageLabel={stageLabel}>
      <LoadingState label="Loading">
        <div className="space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-3 w-24 rounded-full" />
            <Skeleton className="h-9 w-3/4 rounded-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </LoadingState>
    </Screen>
  );
}

/**
 * ## There is deliberately NO fallback for the feed or the reel screens
 *
 * One was written, measured, and removed. A boundary makes the segment stream,
 * and React streams a suspended segment by rendering it into a `hidden`
 * container at the end of `<body>` and swapping it into `<main>` with an
 * inline script. On the feed that reliably produced **React error #418** — the
 * server HTML and the client's first render disagreeing — in WebKit, which is
 * the engine most of this app's traffic runs on. `e2e/hydration.spec.ts`
 * catches it; it was reproduced with the real skeleton and again with a
 * fallback containing no client components at all, so it is the streaming and
 * not the markup.
 *
 * A mismatch there costs more than the boundary buys. The feed's whole design
 * is that page one is server-rendered into the HTML — `app/page.tsx` records
 * the measurement: client-rendering it put LCP at 5.1s. A hydration mismatch
 * throws that server HTML away and re-renders on the client, which is the same
 * loss by a different route. So the feed keeps its blocking navigation, and
 * the return trip is covered by the router cache instead (`staleTimes` in
 * `next.config.ts`).
 *
 * If this is revisited, start from that measurement rather than from scratch,
 * and re-run `e2e/hydration.spec.ts --project=iphone` before believing it.
 */
