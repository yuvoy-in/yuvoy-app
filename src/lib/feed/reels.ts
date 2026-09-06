import type { components } from "@/lib/api/schema.gen";

type Media = components["schemas"]["Media"];
type ExperienceSummary = components["schemas"]["ExperienceSummary"];

/**
 * The feed's shape and the pure things you can say about it.
 *
 * ## Why this is NOT in `use-reels.ts`
 *
 * That module is `"use client"`, and a `"use client"` boundary turns every one
 * of its exports into a client reference — **including a plain constant.** A
 * Server Component importing `REELS_LIMIT` from there does not get `60`; it
 * gets a stub that throws "Attempted to call REELS_LIMIT() from the server".
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

/** One reel, and the whole listing it sells. */
export interface Reel {
  media?: Media;
  experience?: ExperienceSummary;
}

export interface ReelsPage {
  items?: Reel[];
}

/**
 * The most reels the API will return in one answer.
 *
 * `GET /reels` takes `limit` (1–60, default 30) and returns **no cursor**, so
 * this is not a page size — it is the whole feed. Asking for the maximum is
 * therefore not greed: at the default of 30 a traveller would silently see 30
 * of 45 reels, and the end of the feed would claim to be the end of the
 * catalogue.
 *
 * Which is exactly why {@link isPossiblyTruncated} exists. When precisely this
 * many come back, we cannot tell a complete feed from a clipped one, and the
 * screen must not claim either.
 */
export const REELS_LIMIT = 60;

/**
 * The reels worth rendering, in the order the server gave them.
 *
 * An item with no `media` is dropped rather than drawn. Both halves are
 * optional in the contract, and this is the reels feed — a row with nothing to
 * play is a black rectangle that scrolls past, and there is a catalogue
 * endpoint for listings without footage. An item with no `experience` is
 * dropped for the harder reason: the card's whole job is to offer the booking,
 * and a clip nobody can act on is a dead stop in a scroll.
 *
 * **Never sorted.** See {@link useReels}.
 */
export function playableReels(page: ReelsPage | undefined): Reel[] {
  return (page?.items ?? []).filter((item) => item.media && item.experience);
}

/**
 * Might the server be holding reels this answer did not carry?
 *
 * True when the answer is exactly {@link REELS_LIMIT} long, because an unpaged
 * endpoint gives no other signal — a full answer and a coincidentally-full one
 * are identical on the wire.
 *
 * The feed uses it to withhold "that is everything", which is the only claim on
 * that screen that can be false without anybody noticing. Counted against the
 * RAW items rather than the playable ones: dropping an item with no media
 * makes the list shorter without making the feed any more complete.
 */
export function isPossiblyTruncated(page: ReelsPage | undefined): boolean {
  return (page?.items?.length ?? 0) >= REELS_LIMIT;
}
