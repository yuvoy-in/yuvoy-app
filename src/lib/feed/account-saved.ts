import { createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema.gen";
import { deviceSavedStore } from "./saved-store";

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
 * A refusal that will never become a yes for this id.
 *
 * `404 not_found` is "not available to save" (a listing that was never public
 * or no longer exists) and `400` is an id the API cannot read. Retrying either
 * answers the same way forever, so the id is let go rather than retried on
 * every sign-in. A 401, a 5xx or a dropped connection is none of these: the
 * save is kept on the device and tried again next time.
 */
function isPermanentRefusal(error: unknown): boolean {
  return (
    error instanceof YuvoyError &&
    (error.status === 400 || error.status === 404)
  );
}

async function adoptBatch(ids: string[]): Promise<string[]> {
  const { data, error } = await createProxyClient().POST("/me/saved/adopt", {
    body: { experienceIds: ids },
  });
  if (error) throw error;
  return data.ids;
}

/**
 * One batch the API refused as a whole, sent one id at a time.
 *
 * The API refuses the ENTIRE batch when any id in it is unknown or malformed,
 * and says which in neither case. So the only way to keep the good ones is to
 * send each on its own, through the same idempotent single save the feed uses.
 * It costs a round trip per id, which is why it only ever happens after a
 * refusal and never as the first attempt.
 */
async function adoptOneByOne(ids: string[]): Promise<void> {
  const settled: string[] = [];
  try {
    for (const id of ids) {
      try {
        await saveToAccount(id);
      } catch (error) {
        if (!isPermanentRefusal(error)) throw error;
      }
      // Adopted, or refused for good: either way it has left the device.
      settled.push(id);
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
 * API has refused it for good. Removal is by id rather than "clear the store",
 * so a save the traveller made on this device while adoption was in flight is
 * not lost with it: it stays for the next run.
 *
 * Throws on anything that is not a permanent refusal, leaving whatever did not
 * move on the device. A 401 in particular must reach the caller: it means the
 * session ended and the screen should stop treating the traveller as signed in.
 */
async function adoptDeviceSaves(): Promise<string[] | null> {
  const entries = await deviceSavedStore.listSaved();
  const ids = [...new Set(entries.map((entry) => entry.id))];
  if (ids.length === 0) return null;

  let result: string[] | null = null;
  for (let i = 0; i < ids.length; i += ADOPT_BATCH) {
    const batch = ids.slice(i, i + ADOPT_BATCH);
    try {
      result = await adoptBatch(batch);
      await deviceSavedStore.removeSavedIds(batch);
    } catch (error) {
      if (!isPermanentRefusal(error)) throw error;
      await adoptOneByOne(batch);
      // The last batch answer no longer describes the account after single
      // saves, so the caller reads the set fresh.
      result = null;
    }
  }
  return result ?? (await fetchAccountSavedIds());
}

/**
 * One adoption at a time for the whole page.
 *
 * The feed's id query and the list screen's first page both need the device's
 * saves on the account before they read it, and they can start in the same
 * tick. Two concurrent adoptions would both succeed (the API serialises them
 * and the union is idempotent), but they would read and rewrite the same
 * device store twice for no gain. So the second caller waits for the first.
 *
 * Cleared when it settles, so the next read looks at the device again: a save
 * made while signed out in another tab is picked up then.
 */
let inFlight: Promise<string[] | null> | null = null;

export function adoptDeviceSavesOnce(): Promise<string[] | null> {
  if (!inFlight) {
    inFlight = adoptDeviceSaves().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
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
  try {
    const adopted = await adoptDeviceSavesOnce();
    if (adopted) return adopted;
  } catch (error) {
    if (isSignedOutError(error)) throw error;
  }
  return fetchAccountSavedIds(signal);
}
