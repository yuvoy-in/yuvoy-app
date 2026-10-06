"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query/policy";
import { BROWSER_READ_STALL_MS } from "@/lib/api/client";
import { fetchWithin } from "@/lib/api/deadline";
import {
  storedSessionToken,
  forgetStoredSession,
} from "@/lib/auth/traveller-session";

/**
 * Carries a pre-cookie sign-in across, once (yuvoy-app#57 item 8).
 *
 * A traveller who was signed in before the session moved to an HttpOnly cookie
 * has a perfectly good token sitting in IndexedDB, somewhere the app has
 * stopped looking. Without this they would be signed out on the deploy, see no
 * reason for it, and have to ask for another code.
 *
 * Renders nothing. Runs once per page load, and only does any work at all for
 * the shrinking set of devices that still hold a record.
 *
 * ## The order matters
 *
 * The record is deleted AFTER the server has answered, not before. Deleting
 * first would lose the token if the request failed on a bad connection, which
 * on this product's islands is the common case rather than the edge one, and
 * the traveller would be signed out by a dropped packet. Deleting after means
 * the worst case is one retry on the next load.
 *
 * It is deleted whatever the answer says. A token the API refuses is not worth
 * keeping, and one it accepts is now in the cookie.
 */
export function AdoptStoredSession() {
  const qc = useQueryClient();
  /*
    The one adoption for this page, kept where React StrictMode's second run
    finds it. StrictMode runs an effect, cleans it up and runs it again in
    development, and the guard here used to be a "ran" flag: the first run
    was cancelled before it posted and the second found the flag set, so in
    development the adoption never happened at all and could not be
    exercised (stability audit, 6 Oct 2026). Now the work belongs to the
    page, not to one run of the effect: it starts once, and whichever run is
    still mounted when it answers hears the answer.

    A ref, not module state: a ref survives StrictMode's remount, and a
    module-level promise would also outlive the page in every test.
  */
  const adoption = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    let cancelled = false;
    adoption.current ??= adopt();
    void adoption.current.then((adopted) => {
      /*
        Only when something changed. `useTravellerSession` has almost
        certainly already answered "signed out" by now, and that answer is
        stale the moment a cookie is set.
      */
      if (adopted && !cancelled) {
        void qc.invalidateQueries({ queryKey: qk.session() });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [qc]);

  return null;
}

/** Hands a stored token over, once. True when the server set a cookie. */
async function adopt(): Promise<boolean> {
  const sessionToken = await storedSessionToken();
  if (!sessionToken) return false;

  let adopted = false;
  try {
    const response = await fetchWithin(
      "/api/session/adopt",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken }),
      },
      BROWSER_READ_STALL_MS,
    );
    if (response.ok) {
      const body = (await response.json()) as { adopted?: boolean };
      adopted = Boolean(body?.adopted);
    }
  } catch {
    /*
      The network, not the session. Leave the record in place so the next
      load tries again, and do not report anything: the traveller is looking
      at a feed, not at a migration.
    */
    return false;
  }

  await forgetStoredSession();
  return adopted;
}
