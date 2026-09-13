import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import {
  saveTravellerSession,
  getTravellerSession,
  clearTravellerSession,
} from "./traveller-session";

const idb = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.store.get(k),
  set: async (k: string, v: unknown) => void idb.store.set(k, v),
  del: async (k: string) => void idb.store.delete(k),
}));

beforeAll(() => vi.stubGlobal("indexedDB", {}));
beforeEach(() => idb.store.clear());

/**
 * The traveller's session — yuvoy-app#34.
 *
 * It used to hold a booking-recovery status token. `/me/sign-in/*` returns a
 * different credential with a real horizon, and the two must never be
 * confused: a status token authenticates one booking, a session token
 * authenticates a number.
 */
describe("the session", () => {
  it("round-trips a session and its horizon", async () => {
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    await saveTravellerSession({ sessionToken: "sess_1", expiresAt });

    const session = await getTravellerSession();
    expect(session?.sessionToken).toBe("sess_1");
    expect(session?.expiresAt).toBe(expiresAt);
  });

  it("answers null for an expired session, and forgets it", async () => {
    /*
      The alternative is a screen that renders as signed in and then fails its
      first request — the state this whole change exists to remove, arrived at
      from the other side.
    */
    await saveTravellerSession({
      sessionToken: "sess_old",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    expect(await getTravellerSession()).toBeNull();
    // And it is gone, not merely hidden: the next read must not re-decide.
    expect([...idb.store.keys()]).not.toContain("yuvoy.traveller-session");
  });

  it("keeps a session with no stated horizon", async () => {
    // `expiresAt` is the server's to set. Absent is not expired.
    await saveTravellerSession({ sessionToken: "sess_2" });
    expect((await getTravellerSession())?.sessionToken).toBe("sess_2");
  });

  it("signs out anybody holding the pre-#34 record, rather than half-signing them in", async () => {
    /*
      The legacy record held a booking STATUS token, which `/me/*` does not
      accept. Keeping it would sign somebody in to a session that 401s on its
      first call. Deleting it signs out everybody who was signed in before this
      shipped — which is the honest one: they sign in again, and this time it
      works for a number that has never booked.
    */
    idb.store.set("yuvoy.traveller-token", { token: "tok_status" });

    expect(await getTravellerSession()).toBeNull();
    expect([...idb.store.keys()]).not.toContain("yuvoy.traveller-token");
  });

  it("clears both records on sign-out", async () => {
    idb.store.set("yuvoy.traveller-token", { token: "tok_status" });
    await saveTravellerSession({ sessionToken: "sess_3" });

    await clearTravellerSession();
    expect(idb.store.size).toBe(0);
  });
});
