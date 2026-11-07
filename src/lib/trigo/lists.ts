import { YuvoyError } from "@/lib/api/errors";
import { civilFromDate, dayMonth, weekdayDayMonth } from "@/lib/format/date";
import {
  TRIGO_LISTS_API_WORDS,
  type DateAlert,
  type TripDraft,
  type TripDraftDay,
  type TrigoCard,
} from "./lists-words";

/**
 * The rules of the date alerts screen and the Trips Drafts view
 * (yuvoy-app#220), the phone's `packages/core/src/trigo/lists.ts`
 * (yuvoy-mobile#456) ported as it is.
 */

/** An alert that has not told the traveller yet. Only these can be stopped. */
export function dateAlertWaits(alert: DateAlert): boolean {
  return alert.notifiedAt === null;
}

/**
 * Whether a card is still shown. A found event the API kept but whose title
 * is gone is not: there is nothing to call it.
 */
export function trigoCardListed(card: TrigoCard): boolean {
  return card.available && card.title.trim() !== "";
}

/** The list once one alert has gone, by its id. */
export function withoutDateAlert(
  alerts: readonly DateAlert[],
  id: string,
): DateAlert[] {
  const gone = id.toLowerCase();
  return alerts.filter((a) => a.id.toLowerCase() !== gone);
}

/** The list once one draft has gone, by its id. */
export function withoutTripDraft(
  drafts: readonly TripDraft[],
  id: string,
): TripDraft[] {
  const gone = id.toLowerCase();
  return drafts.filter((d) => d.id.toLowerCase() !== gone);
}

/** The days of a draft that have something on them, in the API's order. */
export function draftDays(draft: TripDraft): TripDraftDay[] {
  return draft.days.filter((day) => day.cards.length > 0);
}

/** `Wed, 16 Sep` over a day, or nothing when the date does not parse. */
export function draftDayHeading(date: string): string {
  const civil = civilFromDate(date);
  return civil ? weekdayDayMonth(civil) : "";
}

/** `16 Sep to 19 Sep`, one date for a day trip, nothing when either is bad. */
export function draftDateRange(draft: TripDraft): string {
  const from = civilFromDate(draft.dateFrom);
  const to = civilFromDate(draft.dateTo);
  if (!from || !to) return "";
  if (draft.dateFrom === draft.dateTo) return dayMonth(from);
  return `${dayMonth(from)} to ${dayMonth(to)}`;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where a card opens, from its `cardId` and never its `href`: `exp:{slug}`
 * is a listing at `/e/{slug}`, `item:{uuid}` a found event at `/f/{uuid}`.
 * Anything else opens nothing.
 */
export function trigoListCardPath(
  card: Pick<TrigoCard, "cardId">,
): string | null {
  const id = card.cardId;
  if (id.startsWith("exp:")) {
    const slug = id.slice(4);
    return SLUG.test(slug) ? `/e/${slug}` : null;
  }
  if (id.startsWith("item:")) {
    const uuid = id.slice(5);
    return UUID.test(uuid) ? `/f/${uuid.toLowerCase()}` : null;
  }
  return null;
}

/** How a card's check line reads: a listing, checked by us, or found. */
export type TrigoCheckLook = "listing" | "checked" | "found";

export function trigoCheckLook(card: TrigoCard): TrigoCheckLook {
  if (card.kind !== "event") return "listing";
  return /^Found by Trigo/i.test(card.checkLabel) ? "found" : "checked";
}

/** What a failed read or change on the lists means for the screen. */
export type TrigoListFault = "sign-in" | "gone" | "down" | "other";

export function trigoListFault(error: unknown): TrigoListFault {
  if (!(error instanceof YuvoyError)) return "other";
  if (error.status === 401) return "sign-in";
  if (error.status === 404) return "gone";
  if (error.status === 503) return "down";
  return "other";
}

/**
 * The sentence a 404 or a 503 shows: the API's own, or ours for the same
 * thing when it sent none.
 */
export function trigoListSentence(error: unknown, fallback: string): string {
  if (error instanceof YuvoyError && error.message.trim() !== "") {
    return error.message;
  }
  return fallback;
}

/** The 503 sentence for a list that did not load. */
export function trigoListDownSentence(error: unknown): string {
  return trigoListSentence(error, TRIGO_LISTS_API_WORDS.unavailable);
}
