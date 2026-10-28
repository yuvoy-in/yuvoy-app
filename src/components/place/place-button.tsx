"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SheetPresence } from "@/components/ui/sheet";
import { ChevronRightIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { EVENTS } from "@/lib/analytics/events";
import { captureEvent } from "@/lib/observability/report";
import type { PlaceList } from "@/lib/site/places";
import type { NearYou } from "@/lib/site/near-you";
import {
  clearPlaceCookie,
  isPlaceKey,
  keyOf,
  placeIn,
  writePlaceCookie,
} from "@/lib/site/place-choice";
import { usePlaceList } from "@/lib/site/use-place";
import { PlacePicker, type PickedVia } from "./place-picker";

/**
 * The place on `/`, and the way to change it (yuvoy-app#179, R2-T4).
 *
 * `{place name}` and a chevron; the name a screen reader hears says what it
 * does and what is on screen now: "Change place. Now showing Bengaluru."
 * (the web's own words; mobile's chip reads "Place: {name}. Change place").
 *
 * Rendered only when the caller's list holds a discover place (`/` decides,
 * with `hasDiscoverPlace`), so with `explore` off nobody sees it and `/` is
 * what it was. On the reels it sits in the masthead; on a found feed under
 * the place line.
 *
 * A pick is remembered in the browser (`writePlaceCookie`, which checks the
 * key against the list first) and then `/?place={key}` is opened, so the
 * server renders the place and the address can be shared. The address and
 * the cookie then agree, so the page does not count the same pick again as
 * a link (`RememberPlace`).
 */
export function PlaceButton({
  list,
  current,
  signedIn = false,
  nearYou = null,
  tone = "paper",
}: {
  /** The caller's places, as the server render read them. */
  list: PlaceList;
  /** The place `/` shows now. */
  current: { key: string; name: string };
  /** Whose list it is, so a refresh reads the same one (`qk.places`). */
  signedIn?: boolean;
  /** The visitor's state's local place, from Vercel's headers (`nearYou`). */
  nearYou?: NearYou | null;
  /** Over a reel (`dark`), or on paper (`paper`, the found feed). */
  tone?: "dark" | "paper";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const places = usePlaceList({ initial: list, signedIn, enabled: open });
  const shownList = places.data ?? null;

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);
  /*
    The dialog gives the focus back to the trigger itself when it closes
    (the browser restores it to what had it before `showModal`). This is the
    same thing said once more for wherever that does not happen: a test's
    jsdom, or a sheet closed while the focus was on something removed.
  */
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const pick = (key: string, via: PickedVia) => {
    const shown = placeIn(shownList, key);
    const next = shown ? keyOf(shown) : null;
    setOpen(false);
    if (!next || next === current.key) return;
    writePlaceCookie(next, shownList);
    // To PostHog, after consent only (the reporter is installed by it), and
    // only how it was picked: not the place, which near_you would turn into
    // where somebody is.
    captureEvent(EVENTS.placePicked, { via });
    router.push(placeHref(next));
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Change place. Now showing ${current.name}.`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn(
          "motion-control inline-flex min-h-11 max-w-full min-w-0 items-center gap-1 rounded-full px-3 font-bold",
          tone === "dark"
            ? // The tab bar's pill over a moving picture: the reel shows through.
              "tabbar-on-media ring-paper/12 ring-1"
            : "text-forest border-forest/25 hover:border-forest hover:bg-forest/5 border",
        )}
      >
        <span className="truncate">{current.name}</span>
        <ChevronRightIcon className="size-4 rotate-90" />
      </button>
      <SheetPresence open={open}>
        <PlacePicker
          onClose={() => setOpen(false)}
          list={shownList}
          loading={places.isPending}
          failed={places.isLoadingError}
          retrying={places.isFetching}
          onRetry={() => void places.refetch()}
          currentKey={current.key}
          nearYou={nearYou}
          onPick={pick}
        />
      </SheetPresence>
    </>
  );
}

/**
 * `/?place={key}`, keeping a mocked build's `?__scenario=` so the server
 * render of the next place is asked under the same switch. The key is one
 * `isPlaceKey` passed (lower-case letters, digits, `_` and one `/`), so it
 * goes in as it reads.
 */
function placeHref(key: string): string {
  const href = `/?place=${key}`;
  if (process.env.NEXT_PUBLIC_API_MOCKING !== "enabled") return href;
  const scenario = new URLSearchParams(window.location.search).get(
    "__scenario",
  );
  return scenario ? `${href}&__scenario=${encodeURIComponent(scenario)}` : href;
}

/**
 * What the browser does with `yv_place` once `/` is up, as the server decided
 * it (`choiceFrom`): remember the place a `?place=` link opened, or forget
 * one that has gone, so the gone line is said once. A link that changed the
 * remembered place is `place_picked` with `via: link`.
 *
 * In the browser because the cookie is the browser's preference, written
 * where the choice is made, never by a render that could be cached.
 */
export function RememberPlace({
  write,
  clear,
  list,
}: {
  /** The key to keep, already read against `list` on the server. */
  write: string | null;
  clear: boolean;
  list: PlaceList | null;
}) {
  useEffect(() => {
    if (clear) {
      clearPlaceCookie();
      return;
    }
    if (isPlaceKey(write) && writePlaceCookie(write, list)) {
      captureEvent(EVENTS.placePicked, { via: "link" });
    }
  }, [write, clear, list]);
  return null;
}
