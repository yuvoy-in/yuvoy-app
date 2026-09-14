import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { storedSessionToken, forgetStoredSession } from "./traveller-session";

const idb = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  throwOnGet: false,
}));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => {
    if (idb.throwOnGet) throw new Error("storage is blocked");
    return idb.store.get(k);
  },
  set: async (k: string, v: unknown) => void idb.store.set(k, v),
  del: async (k: string) => void idb.store.delete(k),
}));

beforeAll(() => vi.stubGlobal("indexedDB", {}));
beforeEach(() => {
  idb.store.clear();
  idb.throwOnGet = false;
});

/**
 * What is left of the IndexedDB session: the way out of it (yuvoy-app#57).
 *
 * The session moved to an HttpOnly cookie because Safari on iPhone deletes
 * script-written storage after seven days without a visit. This module now
 * exists only to hand an already-signed-in traveller across, once, so the
 * deploy does not sign out everybody who was signed in when it shipped.
 *
 * Nothing writes here any more, which is why there is no save to test.
 */
describe("the leftover IndexedDB session", () => {
  it("hands over a stored token so a signed-in traveller survives the move", async () => {
    idb.store.set("yuvoy.traveller-session", {
      sessionToken: "sess_1",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      savedAt: new Date().toISOString(),
    });

    expect(await storedSessionToken()).toBe("sess_1");
  });

  it("hands over a token whose stored horizon has passed, rather than judging it", async () => {
    /*
      The old store decided this locally and answered null. It must not now:
      the API extends a session on every use, so a horizon written down at
      sign-in is stale by design, and a device clock wrong by a day would
      throw away a working session. The server is the only authority, and
      `POST /api/session/adopt` is what asks it.
    */
    idb.store.set("yuvoy.traveller-session", {
      sessionToken: "sess_old",
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
      savedAt: new Date().toISOString(),
    });

    expect(await storedSessionToken()).toBe("sess_old");
  });

  it("answers null when there is nothing stored", async () => {
    expect(await storedSessionToken()).toBeNull();
  });

  it("answers null rather than throwing when storage is blocked", async () => {
    /*
      A private window, or a browser set to block site data. There is nothing
      to migrate and nothing to report: the traveller signs in again, which is
      what would have happened anyway. An unhandled rejection here would land
      in an effect on every page load.
    */
    idb.throwOnGet = true;
    expect(await storedSessionToken()).toBeNull();
  });

  it("forgets both records, including the pre-#34 one", async () => {
    /*
      The legacy record held a booking STATUS token, which `/me/*` never
      accepted. It is dropped with the rest rather than left behind to be
      re-read by something later.
    */
    idb.store.set("yuvoy.traveller-token", { token: "tok_status" });
    idb.store.set("yuvoy.traveller-session", { sessionToken: "sess_3" });

    await forgetStoredSession();
    expect(idb.store.size).toBe(0);
  });
});
