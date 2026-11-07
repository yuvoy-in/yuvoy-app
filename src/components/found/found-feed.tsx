"use client";

import type { ReactNode } from "react";
import {
  NO_FOUND_FILTERS,
  type FoundFilters,
  type FoundSearch,
} from "@/lib/found/found-filters";
import type {
  Category,
  ExplorePlace,
  FoundItemList,
} from "@/lib/found/found-words";
import { FoundFeedView } from "./found-feed-view";

/**
 * What was found in a discover place (yuvoy-app#179, R2-T4): the heading,
 * the place's line, the place button, the department chips, and the cards,
 * with an honest foot.
 *
 * `/` renders this for a discover destination and today's reels `Feed` for a
 * bookable market, untouched. It is a list of article cards in a
 * `role="feed"`, not a reel strip: a found card has no film, and its job is
 * to be read and compared.
 *
 * ## The states, every one of them
 *
 * Branched on `isLoadingError` and `isFetchNextPageError` by name, never on
 * `isError` (banned in the lint config): a page that failed after the list was
 * on screen keeps the list and says so at the foot.
 *
 *   - **The server's first page failed** (`firstPage` null): the error with a
 *     retry, and nothing is asked until the retry. A 404 never reaches here:
 *     `/` shows the bookable feed with the gone line instead.
 *   - **Loading**: three skeleton cards, labelled for a screen reader.
 *   - **Empty place** and **empty department**, each with its way out.
 *   - **The foot**: more is loading, a later page failed (the list stays),
 *     the server stopped without a cursor (not the end, and never said as
 *     one), or the end the server declared.
 *   - **Offline**: the cached list under `OfflineNotice`.
 *   - **Stale**: half an hour after the list was read, `StaleNotice` says when
 *     by the place's clock, with Refresh.
 *
 * ## R3's chips, Filters and search (yuvoy-app#180)
 *
 * Only while `checkedCities` is open to the caller, which the server decided
 * (`checkedCities`): the search field, the day chips and Free with the
 * Filters button beside them, the understood row under a search, the
 * heading from the answer's `window` over a chosen day, R3's empty lines, and
 * Coming up on a thin weekend. Closed, none of it is drawn, nothing from the
 * address narrows, and the feed is exactly R2's. The sheet's How hard row
 * (yuvoy-app#195) is a local place's only (`local`).
 *
 * Every change is written into the address in place, like a department chip,
 * and starts the list again from page one (`useFoundFeed`'s key).
 *
 * ## The trigger is the place button
 *
 * The page hands in P1's place button and this draws it under the place line.
 * "Pick another place" (the empty place and the end) presses that same
 * button, so there is one picker and one way into it, and focus comes back to
 * the button the picker opened from.
 */
export function FoundFeed(props: {
  /** From the first page, or from the place list when the first page failed. */
  place: ExplorePlace;
  placeName: string;
  /** Null when the server's first page failed: the error, with a retry. */
  firstPage: FoundItemList | null;
  /** From `?category=`, already checked against the `Category` enum. */
  category: Category | null;
  /** Whether `checkedCities` is open to this caller, as the server decided. Closed when left out. */
  checkedCities?: boolean;
  /** The day, Free and Filters the server read from the address; only while `checkedCities` is open. */
  filters?: FoundFilters;
  /** The search the server read from the address; only while `checkedCities` is open. */
  search?: FoundSearch | null;
  /** The places a search's place chip may go to (`foundPlaceKeys`). */
  searchPlaces?: readonly string[];
  signedIn: boolean;
  /** The place button, drawn under the place line. */
  trigger: ReactNode;
}) {
  /*
    One view per place, department, filters and search the SERVER rendered.
    A new place, or a department or filter arriving in the address from
    outside (a link, Back), is a new server render with its own first page,
    and starts afresh rather than carrying the last place's chips, seed and
    hidden notes into it.
  */
  const narrowed = props.checkedCities
    ? JSON.stringify([props.filters ?? NO_FOUND_FILTERS, props.search ?? null])
    : "";
  return (
    <FoundFeedView
      key={`${props.place.key}|${props.category ?? ""}|${narrowed}`}
      {...props}
    />
  );
}
