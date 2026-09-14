"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query/policy";
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
    React StrictMode double-invokes effects in development, and this one posts
    a credential, so it is worth not doing twice. A ref flips in the same tick
    where a state flag would not.

    Belt and braces rather than load-bearing, and said plainly because a test
    was written for it and then deleted: adopting twice is harmless. Both posts
    carry the same token, the server verifies it and sets the same cookie, and
    the `cancelled` flag below already discards the first run's result. No test
    here could be made to fail with this guard removed, and a test that cannot
    fail is worse than none.
  */
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let cancelled = false;

    void (async () => {
      const sessionToken = await storedSessionToken();
      if (!sessionToken || cancelled) return;

      let adopted = false;
      try {
        const response = await fetch("/api/session/adopt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken }),
        });
        if (response.ok) {
          const body = (await response.json()) as { adopted?: boolean };
          adopted = Boolean(body?.adopted);
        }
      } catch {
        /*
          The network, not the session. Leave the record in place so the next
          load tries again, and do not report anything: the traveller is
          looking at a feed, not at a migration.
        */
        return;
      }

      await forgetStoredSession();
      if (cancelled) return;

      /*
        Only when something changed. `useTravellerSession` has almost certainly
        already answered "signed out" by now, and that answer is stale the
        moment a cookie is set.
      */
      if (adopted) await qc.invalidateQueries({ queryKey: qk.session() });
    })();

    return () => {
      cancelled = true;
    };
  }, [qc]);

  return null;
}
