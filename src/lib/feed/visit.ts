import { YuvoyError } from "@/lib/api/errors";
import type { ReelsPage } from "./reels";

/**
 * One VISIT of the shuffled reel order (yuvoy-app#96, yuvoy-api#213).
 *
 * ## What a visit is
 *
 * Since 21 Sep 2026 `GET /reels` is shuffled per visit: "a request without
 * `cursor` starts a new visit and gets a new order; the cursor carries the
 * visit, so paging through one visit returns every reel exactly once, in one
 * order." A first page asked for again is a different order.
 *
 * So the feed and the search grid are each one visit for as long as they are
 * on screen: fetched once, paged forward with the server's cursor, and never
 * refetched in the background (see `CACHE.reelVisit`), because a refetch is a
 * new first page and a new first page reshuffles the reels under the
 * traveller's thumb.
 *
 * ## The cursor that stopped working
 *
 * "A cursor minted before 2026-09-21 cannot be resumed in the shuffled order
 * and is a `400`; start again from the first page." Every phone with the feed
 * open across that deploy holds one. The issue asks for a fresh first page
 * rather than an error, and three things make that safe rather than jarring:
 *
 *   - **It is appended, never swapped in.** The pages already on screen stay
 *     where they are, so the reel the traveller is looking at does not move
 *     and nothing they scrolled past comes back above them.
 *   - **Nothing repeats.** The new visit is the whole catalogue in a new
 *     order, so it holds the reels already shown too. Those are left out of
 *     it, by media id, on the restarted page and on every page after it.
 *   - **Once per visit.** If the NEW visit's cursor were refused as well,
 *     restarting again would be a loop that re-downloads the first page for
 *     ever. The second refusal is an ordinary failed page instead, which the
 *     strip already knows how to say.
 *
 * Any other failure (a network drop, a 5xx) is today's behaviour: a failed
 * page, retried when the traveller scrolls back.
 */

/**
 * The page param for a visit: the server's cursor, and what the queryFn needs
 * to know about the pages already in hand.
 *
 * Carried IN the param, computed by `getNextPageParam` from the pages it is
 * given, rather than read out of the cache inside the queryFn. The two agree
 * for `fetchNextPage`, but a refetch walks the pages again from a new first
 * page, and only the param is recomputed from THOSE pages; the cache still
 * holds the old ones until the refetch finishes.
 */
export interface VisitCursor {
  cursor: string;
  /** Media ids already shown in this visit, oldest first. */
  held: readonly string[];
  /** Whether this visit has already been restarted from a refused cursor. */
  restarted: boolean;
}

/**
 * A page of a visit. `restartedVisit` marks the page a refused cursor was
 * replaced with; it is this app's bookkeeping and never reaches the API.
 */
export type VisitPage = ReelsPage & { restartedVisit?: true };

/**
 * How many pages that turned out to be entirely reels already shown may be
 * skipped in one fetch, before an empty page is handed back.
 *
 * An empty page with a cursor is not an error, but the strip's sentinel only
 * re-arms when a page adds reels, so a run of them would leave the feed
 * waiting for a scroll. Bounded, because each skip is a request on island
 * signal.
 */
export const MAX_SKIPPED_PAGES = 4;

/** Every media id across these pages, in order. */
export function heldMediaIds(pages: readonly ReelsPage[]): string[] {
  const ids: string[] = [];
  for (const page of pages) {
    for (const item of page.items ?? []) {
      const id = item.media?.id;
      if (id !== undefined) ids.push(id);
    }
  }
  return ids;
}

/**
 * The next page param, or `undefined` when the visit is over.
 *
 * `complete` first and independently of the cursor, as before: a complete
 * page carrying a stale cursor must not fetch a page past the end.
 */
export function nextVisitCursor(
  lastPage: VisitPage,
  allPages: readonly VisitPage[],
): VisitCursor | undefined {
  if (lastPage.complete || !lastPage.nextCursor) return undefined;
  return {
    cursor: lastPage.nextCursor,
    held: heldMediaIds(allPages),
    restarted: allPages.some((page) => page.restartedVisit === true),
  };
}

/** A cursor the API will not resume: a 400 on a request that carried one. */
export function isRefusedCursor(error: unknown): boolean {
  return error instanceof YuvoyError && error.status === 400;
}

/**
 * A page with the reels already shown left out, skipping forward past pages
 * that held nothing new, up to `MAX_SKIPPED_PAGES`.
 *
 * The answer keeps the LAST fetched page's `complete` and `nextCursor`, so the
 * next page carries on from where the skipping stopped.
 */
async function withoutHeld(
  page: ReelsPage,
  held: ReadonlySet<string>,
  fetchPage: (cursor?: string) => Promise<ReelsPage>,
): Promise<ReelsPage> {
  const fresh = (p: ReelsPage): ReelsPage => ({
    ...p,
    items: (p.items ?? []).filter(
      (item) => item.media?.id === undefined || !held.has(item.media.id),
    ),
  });

  let current = fresh(page);
  for (
    let skipped = 0;
    current.items.length === 0 &&
    !current.complete &&
    current.nextCursor &&
    skipped < MAX_SKIPPED_PAGES;
    skipped++
  ) {
    current = fresh(await fetchPage(current.nextCursor));
  }
  return current;
}

/**
 * One page of a visit, recovering ONCE from a cursor the API refuses.
 *
 * `fetchPage` is the plain request for a page, with the caller's filters
 * already in it; `undefined` asks for a first page, which is a new visit.
 */
export async function fetchVisitPage(
  param: VisitCursor | undefined,
  fetchPage: (cursor?: string) => Promise<ReelsPage>,
): Promise<VisitPage> {
  // A first page is a new visit, whatever came before it.
  if (!param) return fetchPage(undefined);

  let page: ReelsPage;
  try {
    page = await fetchPage(param.cursor);
  } catch (error) {
    if (param.restarted || !isRefusedCursor(error)) throw error;
    const restarted = await withoutHeld(
      await fetchPage(undefined),
      new Set(param.held),
      fetchPage,
    );
    return { ...restarted, restartedVisit: true };
  }

  /*
    Past a restart, the rest of the NEW visit still holds the reels the old
    one showed. They are left out here as well, not only on the page that
    replaced the refused cursor.
  */
  return param.restarted
    ? withoutHeld(page, new Set(param.held), fetchPage)
    : page;
}
