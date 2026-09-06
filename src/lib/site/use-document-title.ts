"use client";

import { useEffect } from "react";

/**
 * Set the tab title from data only the browser has.
 *
 * ## Why this exists at all, when Next owns titles
 *
 * It is for exactly one shape of page: `/booking`, which is keyed by a token
 * in the URL **fragment**. A fragment is never sent to the server, so
 * `generateMetadata` cannot know which booking it is looking at and the tab
 * reads `Your booking · Yuvoy` for every one of them (yuvoy-app#16). Every
 * other route in this app can and does set its title on the server, which is
 * where a title belongs — a client-set title is absent in the HTML, absent for
 * a crawler, and absent until hydration.
 *
 * That is acceptable here and nowhere else: the page is `noindex` by design,
 * there is nothing for a crawler to miss, and the value it adds only matters
 * to somebody with two tabs open.
 *
 * ## What it deliberately does not do
 *
 * **No cleanup.** Restoring the previous title on unmount would fight Next,
 * which sets the new route's title on navigation anyway — and a cleanup racing
 * that write is how a tab ends up showing the page it just left.
 *
 * **Nothing secret.** The caller decides what goes in, and on `/booking` that
 * is the booking reference, which the contract calls "human-quotable and not a
 * credential" — it goes on the operator's manifest and is read aloud on a
 * jetty. The token in the fragment must never be passed here; it is already in
 * browser history, and a title is one more place it would not belong.
 *
 * @param title The full title, or `null` to leave whatever Next set.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return;
    document.title = title;
  }, [title]);
}
