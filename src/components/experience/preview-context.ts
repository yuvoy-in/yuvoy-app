"use client";

import { createContext, useContext } from "react";

/**
 * Whether a listing is being drawn as the PREVIEW that follows a traveller's
 * finger in from the right of a reel (T02 C, approved 4 Oct 2026), rather
 * than as the page itself.
 *
 * The preview is the real `ExperienceDetail`, so the page that lands is the
 * page that slid in, but its live parts stay quiet: it is built while the
 * traveller is still watching the reel, and it may never be shown at all.
 *
 *   - Nothing plays. A clip is its poster, and no player is mounted.
 *   - Nothing is fetched, and no picture is downloaded, until it is SHOWN (the
 *     finger has begun to bring it in). Then the hero loads and availability
 *     is read, both of which the page asks for anyway the moment it lands.
 *   - Nothing claims the picture a saved card handed over (T03 B).
 *
 * Null everywhere but inside the preview, which is every real listing.
 */
export const ListingPreviewContext = createContext<{ shown: boolean } | null>(
  null,
);

/** True inside a listing preview, shown or not. */
export function useIsListingPreview(): boolean {
  return useContext(ListingPreviewContext) !== null;
}

/**
 * Whether the listing's live parts may run: always on the page, and inside a
 * preview only once it is shown.
 */
export function useListingLive(): boolean {
  const preview = useContext(ListingPreviewContext);
  return preview ? preview.shown : true;
}
