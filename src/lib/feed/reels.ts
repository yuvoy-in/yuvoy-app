import type { operations } from "@/lib/api/schema.gen";

/**
 * The feed's shape and the pure things you can say about it.
 *
 * ## Why this is NOT in `use-reels.ts`
 *
 * That module is `"use client"`, and a `"use client"` boundary turns every one
 * of its exports into a client reference — **including a plain constant.** A
 * Server Component importing `REELS_PAGE_SIZE` from there does not get `12`;
 * it gets a stub that throws "Attempted to call REELS_PAGE_SIZE() from the
 * server".
 *
 * Interpolated into a query string, that stub stringifies to its own error
 * text, so the homepage asked the API for `?limit=function(){throw Error(…)}`,
 * got a `400`, swallowed it, and served a loading skeleton to every traveller
 * while the browser refetched. It typechecked, it built, every unit test
 * passed, and the only symptom was LCP.
 *
 * So the rule is structural rather than remembered: anything a server
 * component needs lives HERE, and `use-reels.ts` holds the hook and nothing
 * else. `pnpm qa` fails a server file importing a value from a client module.
 */

/**
 * One page of the feed, exactly as the contract declares it.
 *
 * Derived from the generated operation rather than retyped. The hand-written
 * version of this interface said `items?: Reel[]` and nothing else, which was
 * true of the unpaged endpoint and silently stayed compilable when `complete`
 * and `nextCursor` landed — a shape that typechecks against a response it no
 * longer describes is the failure `contracts/PINNED` exists to prevent, and it
 * should not be reintroduced one file below the generated types.
 */
export type ReelsPage =
  operations["listReels"]["responses"][200]["content"]["application/json"];

/** One reel, and the whole listing it sells. */
export type Reel = ReelsPage["items"][number];

/**
 * How many reels one request asks for.
 *
 * **This is a page size, and it did not used to be.** `GET /reels` took only
 * `limit` (1–60) and answered once, so the constant was the whole feed and
 * asking for the maximum was the only honest thing to do — at the default of
 * 30 a traveller would have silently seen 30 of 45 reels. yuvoy-api#114 added
 * a cursor, so 60 stopped being a ceiling and started being a page.
 *
 * Twelve rather than sixty, for a measured reason. A reel item is ~1 KB of
 * JSON on the wire, so a page of 60 is ~59 KB — and the FIRST page is fetched
 * on the server and embedded in the homepage's HTML, which is the LCP path on
 * a 0.5–3 Mbps island link. Nothing downstream wants a big page either: the
 * preload budget mounts the active card plus one, so the 58 cards a traveller
 * has not reached hold no video element and buy nothing.
 *
 * Twelve is roughly nine cards of runway past the point the sentinel starts
 * fetching, which is far more than a snap scroller can consume before a ~12 KB
 * request lands.
 */
export const REELS_PAGE_SIZE = 12;

/**
 * The reels worth rendering, across every page loaded so far, in the order the
 * server gave them.
 *
 * An item with no `media` is dropped rather than drawn. Both halves are
 * optional in the contract, and this is the reels feed — a row with nothing to
 * play is a black rectangle that scrolls past, and there is a catalogue
 * endpoint for listings without footage. An item with no `experience` is
 * dropped for the harder reason: the card's whole job is to offer the booking,
 * and a clip nobody can act on is a dead stop in a scroll.
 *
 * **Never sorted.** See {@link useReels}.
 *
 * ## Why a reel seen twice is dropped
 *
 * The feed keys cards by media id, and React given two children with one key
 * unmounts the wrong card on the next render and hands one clip's player state
 * to another. That was already true within a page; paging makes it reachable
 * across one, where a cursor that resumed a row early would repeat it.
 *
 * The API is explicit that this does not happen — the whole feed was walked a
 * card at a time and no id appeared on two pages — so this guard should never
 * fire. It is here because the two outcomes are not symmetrical: dropping a
 * duplicate costs one row nobody was going to see twice anyway, and keeping it
 * corrupts the player. It warns in development rather than swallowing it, so a
 * cursor that started repeating rows is a message in a console rather than a
 * feed that plays the wrong clip.
 */
export function playableReels(pages: readonly ReelsPage[] | undefined): Reel[] {
  const seen = new Set<string>();
  const out: Reel[] = [];

  for (const page of pages ?? []) {
    for (const item of page.items ?? []) {
      if (!item.media || !item.experience) continue;

      const id = item.media.id;
      if (id !== undefined) {
        if (seen.has(id)) {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              `[feed] GET /reels returned media ${id} on more than one page. ` +
                "Dropping the repeat — the cursor is not resuming where it " +
                "left off, and the interleave may be wrong too.",
            );
          }
          continue;
        }
        seen.add(id);
      }

      out.push(item);
    }
  }

  return out;
}

/**
 * What the bottom of the feed is allowed to say.
 *
 * Three outcomes, not two, and the third is the reason this is a function
 * rather than a boolean. The contract distinguishes them explicitly:
 *
 *   - `more` — there is a cursor to follow. Say nothing about the end.
 *   - `complete` — the server said `complete`. This is the ONLY state in which
 *     "that is everything" is a fact rather than a guess.
 *   - `server_stopped` — `complete: false` with no `nextCursor`, which the
 *     contract calls out as "a different thing from the feed having ended".
 *     There is nothing to page to and the feed has not ended, so the screen
 *     must neither claim the end nor pretend more is coming.
 *
 * **Never inferred from a short page.** A page that happens to come back
 * exactly full would stop the scroll early, and an infinite scroll that has
 * silently stopped looks identical to one with nothing more to show — so
 * nobody reports it as a bug. That reasoning is the app's own, made about
 * `/experiences`, and quoted back to us on yuvoy-api#114.
 *
 * Decided by the LAST page, because that is the only one whose answer is still
 * current: every earlier page was `complete: false` by construction.
 */
export type FeedTail = "more" | "complete" | "server_stopped";

export function feedTail(pages: readonly ReelsPage[] | undefined): FeedTail {
  const last = pages?.at(-1);
  // No page at all is not an ending. The caller is in a loading or error state
  // and has nothing to say about the bottom of a feed it does not have.
  if (!last) return "more";
  if (last.complete) return "complete";
  return last.nextCursor ? "more" : "server_stopped";
}
