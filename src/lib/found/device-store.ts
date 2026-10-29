/**
 * What this browser remembers about found cards (yuvoy-app#179, R2-T4), and
 * nothing else.
 *
 * Two things, both of them the person's own choices, both kept on this device
 * only and never sent anywhere:
 *
 *   - `yv.hiddenCards`: the cards reported from this browser. A report sends
 *     `reason` and `note` and never an id of the device, so for somebody
 *     signed out this list is the ONLY thing that keeps a card they reported
 *     out of their feed. Signed in, the API may hide it for them as well
 *     (`hidden: you`), and the list keeps it hidden here either way. The
 *     phone app keeps the same list under its own key
 *     (yuvoy-mobile `packages/core/src/explore/hidden.ts`), with the same
 *     limits: 200 cards at most, each forgotten after 30 days, by when staff
 *     have decided on the card.
 *   - `yv.leaveNoticeOff`: "Don't show this again on this device", ticked on
 *     the sheet See details opens first.
 *
 * ## IndexedDB, through idb-keyval, as the saved list does
 *
 * For the reasons `lib/feed/saved-store.ts` gives: `localStorage` is
 * synchronous, blocks a slow phone's main thread, and is banned outright by
 * the lint config. And for the same trap: Safari's private mode defines
 * `indexedDB` and then refuses to open it, and some embedded browsers throw on
 * first access. So every read and every write is wrapped, and a browser that
 * will not keep anything answers as if nothing were kept. The cost of that is
 * a reported card showing again, or the leaving notice asking again; the cost
 * of an unhandled rejection on the front door is the screen.
 */
import { get, set } from "idb-keyval";

const HIDDEN_KEY = "yv.hiddenCards";
const LEAVE_KEY = "yv.leaveNoticeOff";

/** How long a hidden card stays hidden, as the phone app keeps it. */
export const HIDDEN_KEEP_MS = 30 * 24 * 60 * 60_000;

/** At most this many hidden cards, the oldest going first. */
export const HIDDEN_MAX = 200;

/**
 * Said on `window` whenever a card is hidden, so a feed already on screen
 * drops it at once rather than at its next read. A plain event rather than a
 * shared query: the list changes only here, and only by a person's tap.
 */
export const HIDDEN_CARDS_CHANGED = "yv:hidden-cards-changed";

/** One hidden card: its id as the API writes it, lower case, and when. */
interface HiddenCard {
  id: string;
  /** Epoch milliseconds on this device's clock. */
  at: number;
}

/** No found id is anywhere near this long; a value that is was not written by us. */
const MAX_ID_LENGTH = 100;

/** Whether IndexedDB can be asked at all. See the module note. */
function available(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

/**
 * The entries still kept at `now`: none 30 days old or more, each id once at
 * its latest time, the newest 200.
 *
 * A time ahead of `now` (the clock was set back) counts as now, so it is still
 * forgotten 30 days from today rather than kept for however long the clock
 * was wrong by.
 */
function keep(entries: readonly HiddenCard[], now: number): HiddenCard[] {
  const newest = new Map<string, number>();
  for (const { id, at } of entries) {
    const when = Math.min(at, now);
    if (now - when >= HIDDEN_KEEP_MS) continue;
    const before = newest.get(id);
    if (before === undefined || when > before) newest.set(id, when);
  }
  return [...newest]
    .map(([id, at]) => ({ id, at }))
    .sort((a, b) => b.at - a.at)
    .slice(0, HIDDEN_MAX);
}

/** Unknown in, clean entries out. Anything unrecognisable is treated as absent. */
function parse(raw: unknown): HiddenCard[] {
  if (!Array.isArray(raw)) return [];
  const out: HiddenCard[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, at } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !id.trim() || id.length > MAX_ID_LENGTH) {
      continue;
    }
    if (typeof at !== "number" || !Number.isFinite(at)) continue;
    out.push({ id: id.trim().toLowerCase(), at });
  }
  return out;
}

async function readHidden(now: number): Promise<HiddenCard[]> {
  return keep(parse(await get(HIDDEN_KEY)), now);
}

/**
 * The ids of the cards this browser hides, lower case, as of now. Empty when
 * there are none or storage is refused.
 */
export async function hiddenCardIds(): Promise<Set<string>> {
  if (!available()) return new Set();
  try {
    return new Set((await readHidden(Date.now())).map((entry) => entry.id));
  } catch {
    return new Set();
  }
}

/**
 * Hide a card on this browser, and tell a feed on screen.
 *
 * The event goes out even when storage refused the write: the person just
 * reported the card, and it should leave the feed in front of them whether or
 * not this browser can remember that tomorrow. A feed that reads the list
 * again in answer gets the old list back, so it keeps its own note of the id
 * as well (`found-feed.tsx`).
 */
export async function hideCard(id: string): Promise<void> {
  const clean = typeof id === "string" ? id.trim().toLowerCase() : "";
  if (!clean || clean.length > MAX_ID_LENGTH) return;
  if (available()) {
    try {
      const now = Date.now();
      const entries = await readHidden(now);
      await set(HIDDEN_KEY, keep([...entries, { id: clean, at: now }], now));
    } catch {
      /* Storage refused. The card still leaves the screen; see above. */
    }
  }
  try {
    window.dispatchEvent(
      new CustomEvent(HIDDEN_CARDS_CHANGED, { detail: { id: clean } }),
    );
  } catch {
    // No window (a test without one): nothing on screen to tell.
  }
}

/**
 * Whether "Don't show this again on this device" was ticked. False when it
 * was not, or when storage cannot say: asking once too often is the safe way
 * to be wrong about a notice that says a link leaves Yuvoy.
 */
export async function leaveNoticeOff(): Promise<boolean> {
  if (!available()) return false;
  try {
    return (await get(LEAVE_KEY)) === true;
  } catch {
    return false;
  }
}

export async function setLeaveNoticeOff(off: boolean): Promise<void> {
  if (!available()) return;
  try {
    await set(LEAVE_KEY, off === true);
  } catch {
    /* Refused: the notice asks again next time, which is the safe side. */
  }
}
