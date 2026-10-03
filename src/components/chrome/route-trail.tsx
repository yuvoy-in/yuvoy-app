"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { markStepBack, recordVisit } from "@/lib/site/route-trail";

/**
 * Records the screens a traveller walks through, for `TrailBackButton`. Renders
 * nothing. See `route-trail` for what the trail is and why it is not history.
 *
 * The query is part of a visit, so a step back to search keeps the search: the
 * search screen writes its query with `router.replace`, which changes no
 * pathname, so the pathname alone would remember a search that has since been
 * edited.
 */
function Recorder() {
  const pathname = usePathname();
  const query = useSearchParams().toString();

  /*
    The browser's own back and forward are a step back, and are seen two ways,
    because which one sees it first depends on React rather than on us.

    React renders a navigation that starts in a `popstate` event synchronously,
    INSIDE that event (so the browser can restore the scroll position), and
    Next's router listens for it before this component does: it is mounted
    with the app, while this one mounts a commit later, behind its boundary.
    So by the time a `popstate` listener of ours runs, the screen it led to
    has already rendered and this effect has already recorded it, as a step
    forward. The e2e that walks listing, business page, browser back caught
    exactly that: Back on the listing offered the business's page again.

    So the effect asks the event it is running inside (`window.event`, the
    same signal React itself reads for this), and the listener covers the
    other order: a screen that was not ready to render inside the event and
    arrives after it. Forward lands on a screen that is not the one before, so
    the trail still treats it as a step forward.
  */
  useEffect(() => {
    const traversed =
      typeof window !== "undefined" && window.event?.type === "popstate";
    recordVisit(query ? `${pathname}?${query}` : pathname, traversed);
  }, [pathname, query]);

  useEffect(() => {
    const onPop = () => markStepBack(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return null;
}

/**
 * In its own boundary because `useSearchParams` makes the nearest one render
 * on the client only; the boundary keeps that to this component, which has
 * nothing to render anyway, rather than the page around it.
 */
export function RouteTrail() {
  return (
    <Suspense fallback={null}>
      <Recorder />
    </Suspense>
  );
}
