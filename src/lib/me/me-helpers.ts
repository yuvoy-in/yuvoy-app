import type { Badge, LifeEntry, MeLanguage, MySettings } from "./types";
import { LANGUAGES, proofLine } from "./words";

/**
 * The pure half of Me's hooks (yuvoy-mobile#444), kept apart so it is tested
 * without React or a network. Ported from yuvoy-mobile packages/core/src/me.
 */

const KINDS: ReadonlySet<string> = new Set(["trip", "went", "plan", "table"]);

/**
 * Whether the page can name an entry: a kind it knows and a proof it has a
 * line for. One it cannot name is left off rather than drawn without saying
 * where it came from.
 */
export function isNamed(entry: { kind: string; proof: string }): boolean {
  return KINDS.has(entry.kind) && proofLine(entry) !== null;
}

/**
 * Which route changes who sees an entry: a trip or a table its own
 * (`PATCH /me/life-list/{entryId}`), a went entry only the went route
 * (`PATCH /me/went/{eventId}`, the one writer of it; the life-list route
 * answers 409 for one), and a plan none.
 */
export function visibilityRoute(
  entry: Pick<LifeEntry, "kind" | "eventId">,
): "life-list" | "went" | null {
  if (entry.kind === "trip" || entry.kind === "table") return "life-list";
  if (entry.kind === "went") return entry.eventId ? "went" : null;
  return null;
}

/**
 * Entries over every page read so far, each once and only those the page can
 * name: a page read again after a change can hand back an entry the page
 * before it already held.
 */
export function namedEntriesOf<
  T extends { entryId: string; kind: string; proof: string },
>(pages: readonly { entries: readonly T[] }[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages) {
    for (const entry of page.entries) {
      if (seen.has(entry.entryId)) continue;
      seen.add(entry.entryId);
      if (isNamed(entry)) out.push(entry);
    }
  }
  return out;
}

/** The pages with `change` applied to one entry, wherever it sits. */
export function withEntry<
  P extends { entries: readonly E[] },
  E extends { entryId: string },
>(pages: readonly P[], entryId: string, change: (entry: E) => E): P[] {
  return pages.map((page) =>
    page.entries.some((e) => e.entryId === entryId)
      ? {
          ...page,
          entries: page.entries.map((e) =>
            e.entryId === entryId ? change(e) : e,
          ),
        }
      : page,
  );
}

/** The first page without one Did you go question, by event id in any case. */
export function withoutQuestion<
  P extends { didYouGo: readonly { eventId: string }[] },
>(pages: readonly P[], eventId: string): P[] {
  const key = eventId.toLowerCase();
  return pages.map((page, i) =>
    i === 0
      ? {
          ...page,
          didYouGo: page.didYouGo.filter(
            (q) => q.eventId.toLowerCase() !== key,
          ),
        }
      : page,
  );
}

/**
 * The first page with one question put back at `at`, after an answer that
 * did not go through. Never twice: a read since may already hold it again.
 */
export function withQuestion<
  P extends { didYouGo: readonly Q[] },
  Q extends { eventId: string },
>(pages: readonly P[], item: Q, at: number): P[] {
  const key = item.eventId.toLowerCase();
  return pages.map((page, i) => {
    if (i !== 0) return page;
    if (page.didYouGo.some((q) => q.eventId.toLowerCase() === key)) return page;
    const list = [...page.didYouGo];
    list.splice(Math.max(0, Math.min(at, list.length)), 0, item);
    return { ...page, didYouGo: list };
  });
}

/** The earned badges with `keys` marked seen, as `markBadgesSeen` leaves them. */
export function markedSeen<B extends Pick<Badge, "key" | "seen">>(
  earned: readonly B[],
  keys: readonly string[],
): B[] {
  const marked = new Set(keys);
  return earned.map((badge) =>
    marked.has(badge.key) && !badge.seen ? { ...badge, seen: true } : badge,
  );
}

/** The first earned badge not yet seen, for the "New badge" panel. */
export function nextNewBadge<B extends Pick<Badge, "key" | "seen">>(
  earned: readonly B[],
  asked: ReadonlySet<string> = new Set(),
): B | null {
  return earned.find((b) => !b.seen && !asked.has(b.key)) ?? null;
}

/** At most this many languages, the API's rule. */
export const LANGUAGES_MOST = 4;

const ORDER: readonly MeLanguage[] = LANGUAGES.map((l) => l.key);

function inOrder(codes: readonly MeLanguage[]): MeLanguage[] {
  const set = new Set(codes);
  return ORDER.filter((code) => set.has(code));
}

/**
 * The list after a tap on one chip: out when it was in, in when it was not
 * and there is room, in the chips' order. The API replaces the whole list
 * with what is sent.
 */
export function toggledLanguages(
  list: readonly MeLanguage[],
  code: MeLanguage,
): MeLanguage[] {
  if (list.includes(code)) return inOrder(list.filter((c) => c !== code));
  if (list.length >= LANGUAGES_MOST) return inOrder(list);
  return inOrder([...list, code]);
}

export type MeSettingChange =
  { languages: MeLanguage[] } | { showWomenOnlyTables: boolean };

/**
 * `PATCH /me/settings` for one Me setting: only its own field, so the usage
 * choice and the email switches on the same route are never sent from Me.
 */
export function meSettingsPatch(change: MeSettingChange): MeSettingChange {
  return "languages" in change
    ? { languages: [...change.languages] }
    : { showWomenOnlyTables: change.showWomenOnlyTables };
}

/** The settings with one Me change applied, for the optimistic draw. */
export function withSetting(
  settings: MySettings,
  change: MeSettingChange,
): MySettings {
  return "languages" in change
    ? { ...settings, languages: [...change.languages] }
    : { ...settings, showWomenOnlyTables: change.showWomenOnlyTables };
}
