import { api, createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema.gen";
import { deviceSavedStore, type SavedEntry } from "./saved-store";

/**
 * Saves on the ACCOUNT, and the one-time move of a device's saves onto it
 * (yuvoy-api#192).
 *
 * ## Where a save lives
 *
 * Signed in, on the account: `GET /me/saved/ids` answers the feed's twelve
 * "is this held" questions per page in one flat array, and `GET /me/saved`
 * pages the bodies for the list screen. Signed out, on the device, in
 * `saved-store.ts`, exactly as before. `use-saved.ts` picks one of the two.
 *
 * Every call here goes through this app's own proxy (`/api/v1`), because all
 * five are session-only in the contract: a booking's status token can neither
 * read nor write a traveller's saves, and the session lives in an HttpOnly
 * cookie the browser cannot read (yuvoy-app#57).
 *
 * ## Adoption
 *
 * A traveller lands on a shared reel, saves three things, and signs in later.
 * Those three are on the device and the account has never heard of them, so on
 * the first account read they are sent to `POST /me/saved/adopt`.
 *
 * The owner chose the semantics on 16 Sep: a UNION, never a replace. The body
 * means "also these", not "exactly these", so a laptop that signs in with two
 * device saves cannot wipe the three the phone put on the account. The answer
 * is the resulting full set, so the feed learns what it now holds without a
 * second round trip, and two devices converge on one answer rather than on
 * whichever wrote last.
 */

type SavedPage = components["schemas"]["SavedPage"];
export type SavedExperience = components["schemas"]["SavedExperience"];

/** The contract's ceiling on one adoption. More than this goes in batches. */
export const ADOPT_BATCH = 200;

/**
 * The page size for the list screen: the contract's maximum.
 *
 * A wishlist is small and is a destination somebody chose, so fewer round
 * trips on an island connection beats a smaller first paint. Fifty tiles is
 * already several screens.
 */
export const SAVED_PAGE_SIZE = 50;

/** Every id the account holds, including listings that are no longer public. */
export async function fetchAccountSavedIds(
  signal?: AbortSignal,
): Promise<string[]> {
  const { data, error } = await createProxyClient().GET("/me/saved/ids", {
    signal,
  });
  if (error) throw error;
  return data.ids;
}

/** One page of the list screen, newest save first. */
export async function fetchAccountSavedPage(
  cursor: string | undefined,
  signal?: AbortSignal,
): Promise<SavedPage> {
  const { data, error } = await createProxyClient().GET("/me/saved", {
    params: {
      query: {
        limit: SAVED_PAGE_SIZE,
        // Omitted on the first page: `cursor=` empty is a different request
        // from sending none.
        ...(cursor ? { cursor } : {}),
      },
    },
    signal,
  });
  if (error) throw error;
  return data;
}

/** Idempotent: saving something already saved answers 204 and moves nothing. */
export async function saveToAccount(experienceId: string): Promise<void> {
  const { error } = await createProxyClient().POST("/me/saved", {
    body: { experienceId },
  });
  if (error) throw error;
}

/** Idempotent: removing something absent answers 204 too. */
export async function removeFromAccount(experienceId: string): Promise<void> {
  const { error } = await createProxyClient().DELETE(
    "/me/saved/{experienceId}",
    { params: { path: { experienceId } } },
  );
  if (error) throw error;
}

/** Whether a failure means the session is over rather than the network. */
export function isSignedOutError(error: unknown): boolean {
  return error instanceof YuvoyError && error.status === 401;
}

/**
 * Who is signed in, as a number that changes whenever that does.
 *
 * Sign in, sign out, and a session that ended all bump it (`forgetSaved` in
 * `use-traveller.ts`). Work started for one number checks it before it
 * touches the account again, because the proxy attaches whatever cookie is
 * current when a request LEAVES: an adoption or a queued write started for
 * one traveller on a shared phone would otherwise land in the next
 * traveller's account.
 */
let epoch = 0;

/**
 * Saves the API refused this visit although their listing still answers.
 * Kept on the device and not offered again until the page reloads, so one
 * refusal that will not change cannot cost a round trip on every read.
 */
const skippedThisVisit = new Set<string>();

/** The current session's number. Stamped on account writes when queued. */
export function savedSessionEpoch(): number {
  return epoch;
}

/** Who is signed in changed: nothing started before this may continue. */
export function resetSavedSession(): void {
  epoch += 1;
  inFlight = null;
  skippedThisVisit.clear();
}

/**
 * A refusal from the API itself, of an id it will never accept.
 *
 * `400` is an id the API cannot read. `404` is "not available to save": a
 * listing that was never public or no longer exists. Both only count when the
 * API said them, which its envelope's request id proves. This app's own proxy
 * answers `404 not_found` too, for a path its allowlist lacks, with no request
 * id: an older deployment serving a newer page would say exactly that for
 * every save, and reading it as "these listings are gone" would delete every
 * save on the device.
 */
function isApiRefusal(error: unknown): error is YuvoyError {
  return (
    error instanceof YuvoyError &&
    (error.status === 400 || error.status === 404) &&
    Boolean(error.requestId)
  );
}

/**
 * Whether a save the API refused can be let go from the device.
 *
 * A malformed id, yes. A 404, only once the public listing confirms it is
 * gone: if `GET /experiences/{slug}` still answers, the refusal was about
 * something else and the save is kept to try again. A save from before
 * entries carried a slug cannot be checked and cannot be shown either, so the
 * API's word is taken for it.
 */
async function isGoneForGood(
  error: unknown,
  entry: SavedEntry,
): Promise<boolean> {
  if (!isApiRefusal(error)) return false;
  if (error.status === 400 || !entry.slug) return true;
  try {
    await api.GET("/experiences/{slug}", {
      params: { path: { slug: entry.slug } },
    });
    return false;
  } catch (readError) {
    return (
      readError instanceof YuvoyError &&
      readError.status === 404 &&
      Boolean(readError.requestId)
    );
  }
}

async function adoptBatch(ids: string[]): Promise<string[]> {
  const { data, error } = await createProxyClient().POST("/me/saved/adopt", {
    body: { experienceIds: ids },
  });
  if (error) throw error;
  return data.ids;
}

/**
 * One batch the API refused as a whole, sent one save at a time.
 *
 * The API refuses the ENTIRE batch when any id in it is unknown or malformed,
 * and says which in neither case. So the only way to keep the good ones is to
 * send each on its own, through the same idempotent single save the feed uses.
 * It costs a round trip per save, which is why it only ever happens after a
 * refusal and never as the first attempt.
 */
async function adoptOneByOne(
  entries: SavedEntry[],
  startedIn: number,
): Promise<void> {
  const settled: string[] = [];
  try {
    for (const entry of entries) {
      if (epoch !== startedIn) return;
      try {
        await saveToAccount(entry.id);
      } catch (error) {
        if (!(await isGoneForGood(error, entry))) {
          /*
            Refused by the API although its listing still answers: kept on
            the device, skipped for the rest of this visit, and the rest of
            the batch carries on. Throwing here would stop every save after it
            from moving, on every read, and retrying it on every read would
            be a request each time for an answer that will not change.
          */
          if (isApiRefusal(error)) {
            skippedThisVisit.add(entry.id);
            continue;
          }
          // The network, a 5xx, a finished session: stop, keep the rest.
          throw error;
        }
      }
      // Adopted, or gone for good: either way it has left the device.
      settled.push(entry.id);
    }
  } finally {
    /*
      In a `finally` so a connection that drops halfway still clears what it
      already moved. Leaving those behind would send them again next time,
      which is harmless (the single save is idempotent) but not free.
    */
    await deviceSavedStore.removeSavedIds(settled);
  }
}

/**
 * Moves every save on this device onto the account, and answers the account's
 * full set afterwards. `null` when the device held nothing, so the caller
 * reads the set itself.
 *
 * ## What leaves the device, and when
 *
 * An id is removed from the device only once the account has it, or once the
 * API has refused it and the listing is confirmed gone. Removal is by id
 * rather than "clear the store", so a save the traveller made on this device
 * while adoption was in flight is not lost with it: it stays for the next run.
 *
 * It stops, keeping the rest on the device, the moment who is signed in
 * changes. Throws on anything else that is not a confirmed refusal. A 401 in
 * particular must reach the caller: the session ended, and the screen should
 * stop treating the traveller as signed in.
 */
async function adoptDeviceSaves(startedIn: number): Promise<string[] | null> {
  const unique = new Map<string, SavedEntry>();
  for (const entry of await deviceSavedStore.listSaved()) {
    if (skippedThisVisit.has(entry.id)) continue;
    if (!unique.has(entry.id)) unique.set(entry.id, entry);
  }
  const entries = [...unique.values()];
  if (entries.length === 0) return null;

  let result: string[] | null = null;
  for (let i = 0; i < entries.length; i += ADOPT_BATCH) {
    if (epoch !== startedIn) return null;
    const batch = entries.slice(i, i + ADOPT_BATCH);
    const ids = batch.map((entry) => entry.id);
    try {
      result = await adoptBatch(ids);
      await deviceSavedStore.removeSavedIds(ids);
    } catch (error) {
      if (!isApiRefusal(error)) throw error;
      await adoptOneByOne(batch, startedIn);
      // The last batch answer no longer describes the account after single
      // saves, so the caller reads the set fresh.
      result = null;
    }
  }
  return result;
}

/**
 * One adoption at a time for the whole page, per signed-in session.
 *
 * The feed's id query and the list screen's first page both need the device's
 * saves on the account before they read it, and they can start in the same
 * tick. Two concurrent adoptions would both succeed (the API serialises them
 * and the union is idempotent), but they would read and rewrite the same
 * device store twice for no gain. So the second caller waits for the first,
 * unless the first belongs to a session that has since ended.
 *
 * Cleared when it settles, so the next read looks at the device again: a save
 * made while signed out in another tab is picked up then.
 */
let inFlight: { epoch: number; promise: Promise<string[] | null> } | null =
  null;

export function adoptDeviceSavesOnce(): Promise<string[] | null> {
  if (!inFlight || inFlight.epoch !== epoch) {
    const startedIn = epoch;
    const mine: { epoch: number; promise: Promise<string[] | null> } = {
      epoch: startedIn,
      promise: adoptDeviceSaves(startedIn).finally(() => {
        if (inFlight === mine) inFlight = null;
      }),
    };
    inFlight = mine;
  }
  return inFlight.promise;
}

/**
 * The account's saved ids, with the device's adopted first.
 *
 * Adoption failing for any reason but a finished session does not fail the
 * read: the device keeps its saves and the next read tries again, and the
 * traveller still sees everything the account already holds. Their few device
 * saves appearing a minute late is the better failure than a feed whose every
 * bookmark is broken because one adoption could not reach the server.
 */
export async function readAccountSavedIds(
  signal?: AbortSignal,
): Promise<string[]> {
  const startedIn = epoch;
  let ids: string[] | null = null;
  try {
    ids = await adoptDeviceSavesOnce();
  } catch (error) {
    if (isSignedOutError(error)) throw error;
  }
  ids ??= await fetchAccountSavedIds(signal);

  /*
    A device copy of anything the account now holds goes. The case it exists
    for: an adoption the server committed whose answer never arrived. Those
    saves are on the account and still on the device, and left there they
    would be adopted again after the traveller removed one, putting it back.
  */
  if (epoch === startedIn) await deviceSavedStore.removeSavedIds(ids);
  return ids;
}
