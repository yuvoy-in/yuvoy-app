import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { __seedSavedMock } from "../../../mocks/saved-handlers";
import { YuvoyError } from "@/lib/api/errors";
import { deviceSavedStore } from "./saved-store";
import {
  adoptDeviceSavesOnce,
  readAccountSavedIds,
  resetSavedSession,
} from "./account-saved";

/**
 * Moving a device's saves onto the account (yuvoy-api#192).
 *
 * The owner chose the semantics on 16 Sep: a union, never a replace, so a
 * laptop signing in with two device saves cannot wipe the three the phone put
 * on the account. What these pin is the client's half: what leaves the
 * device, when, and what happens when the API refuses a batch or the
 * connection drops halfway.
 *
 * jsdom has no IndexedDB, so `idb-keyval` is the Map below, as in
 * `saved-store.test.ts`.
 */
const idb = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.store.get(k),
  set: async (k: string, v: unknown) => {
    idb.store.set(k, v);
  },
}));

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const TOKEN = "sess_919000000000";
/** An id shaped like the API's, that no fixture has: the API's 404. */
const UNKNOWN_UUID = "00000000-0000-4000-8000-000000000000";

/** Puts saves on the device, as the feed would have while signed out. */
async function onDevice(...ids: string[]) {
  for (const id of ids) await deviceSavedStore.addSaved(id, `slug-${id}`);
}

/** Every request to the API's saved routes, in order. */
let calls: string[] = [];
function record({ request }: { request: Request }) {
  const url = new URL(request.url);
  if (url.href.startsWith(BASE) && url.pathname.includes("/me/saved")) {
    calls.push(`${request.method} ${url.pathname.replace(/^\/v1/, "")}`);
  }
}

beforeEach(() => {
  idb.store.clear();
  vi.stubGlobal("indexedDB", {});
  __signInAppRouteMock(TOKEN);
  calls = [];
  server.events.on("request:start", record);
});
afterEach(() => {
  server.events.removeListener("request:start", record);
});

describe("adopting the device's saves", () => {
  it("adds them to the account, never replacing what it held", async () => {
    __seedSavedMock(TOKEN, ["exp_kayak"]);
    await onDevice("exp_try_dive", "exp_snorkel");

    const ids = await readAccountSavedIds();

    // The union, answered by the adoption itself: no second read.
    expect([...ids].sort()).toEqual([
      "exp_kayak",
      "exp_snorkel",
      "exp_try_dive",
    ]);
    expect(calls).toEqual(["POST /me/saved/adopt"]);
  });

  it("takes them off the device once the account has them", async () => {
    await onDevice("exp_try_dive");

    await readAccountSavedIds();

    expect(await deviceSavedStore.listSavedIds()).toEqual([]);
  });

  it("does not adopt anything when the device holds nothing", async () => {
    __seedSavedMock(TOKEN, ["exp_kayak"]);

    expect(await readAccountSavedIds()).toEqual(["exp_kayak"]);
    expect(calls).toEqual(["GET /me/saved/ids"]);
  });

  it("sends more than 200 in batches, the contract's ceiling", async () => {
    const batches: number[] = [];
    server.use(
      http.post(`${BASE}/me/saved/adopt`, async ({ request }) => {
        const { experienceIds } = (await request.json()) as {
          experienceIds: string[];
        };
        batches.push(experienceIds.length);
        return HttpResponse.json({ ids: experienceIds });
      }),
    );
    await onDevice(...Array.from({ length: 201 }, (_, i) => `exp_${i}`));

    await readAccountSavedIds();

    expect(batches).toEqual([200, 1]);
    expect(await deviceSavedStore.listSavedIds()).toEqual([]);
  });

  it("runs once for readers that start together", async () => {
    await onDevice("exp_try_dive");

    // The feed's id query and the list screen's first page, in one tick.
    await Promise.all([adoptDeviceSavesOnce(), adoptDeviceSavesOnce()]);

    expect(calls.filter((c) => c === "POST /me/saved/adopt")).toHaveLength(1);
  });
});

describe("when the API refuses a batch", () => {
  it("keeps the good saves when one id no longer exists", async () => {
    /*
      The API refuses the WHOLE batch over one unknown id, with a 404 that
      names none. Giving up would lose the good saves; retrying the same batch
      would fail forever. So each is sent on its own.
    */
    await onDevice("exp_try_dive", UNKNOWN_UUID);

    const ids = await readAccountSavedIds();

    expect(ids).toEqual(["exp_try_dive"]);
    expect(calls).toEqual([
      "POST /me/saved/adopt",
      "POST /me/saved",
      "POST /me/saved",
      "GET /me/saved/ids",
    ]);
    // Both have left the device: one is on the account, the other can never
    // be, and retrying it on every sign in would cost a round trip for nothing.
    expect(await deviceSavedStore.listSavedIds()).toEqual([]);
  });

  it("lets go of an id the API cannot read", async () => {
    await onDevice("exp_kayak", "not-an-experience-id");

    expect(await readAccountSavedIds()).toEqual(["exp_kayak"]);
    expect(await deviceSavedStore.listSavedIds()).toEqual([]);
  });
});

describe("when adoption cannot finish", () => {
  it("keeps every save on the device when the connection drops", async () => {
    __seedSavedMock(TOKEN, ["exp_kayak"]);
    server.use(http.post(`${BASE}/me/saved/adopt`, () => HttpResponse.error()));
    await onDevice("exp_try_dive");

    // The account's own saves still show; the device's move next time.
    expect(await readAccountSavedIds()).toEqual(["exp_kayak"]);
    expect(await deviceSavedStore.listSavedIds()).toEqual(["exp_try_dive"]);
  });

  it("clears what it already moved when the connection drops halfway", async () => {
    let singles = 0;
    server.use(
      // The API's own refusal, request id and all, as its envelope always is.
      http.post(`${BASE}/me/saved/adopt`, () =>
        HttpResponse.json(
          {
            error: {
              code: "not_found",
              message: "Not available.",
              requestId: "01JAPI404",
            },
          },
          { status: 404 },
        ),
      ),
      http.post(`${BASE}/me/saved`, () => {
        singles += 1;
        return singles === 1
          ? new HttpResponse(null, { status: 204 })
          : HttpResponse.error();
      }),
    );
    await onDevice("exp_try_dive", "exp_snorkel", "exp_kayak");
    // The order adoption walks them in: the device's own list order.
    const order = (await deviceSavedStore.listSaved()).map((e) => e.id);

    await readAccountSavedIds();

    // The first single save landed, so it leaves the device; the second
    // failed on the wire and the third was never tried, so both stay.
    expect([...(await deviceSavedStore.listSavedIds())].sort()).toEqual(
      order.slice(1).sort(),
    );
  });

  it("hands a finished session to the caller, and keeps the saves", async () => {
    server.use(
      http.post(`${BASE}/me/saved/adopt`, () =>
        HttpResponse.json(
          { error: { code: "unauthorized", message: "Sign in." } },
          { status: 401 },
        ),
      ),
    );
    await onDevice("exp_try_dive");

    const failure = await readAccountSavedIds().catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(YuvoyError);
    expect((failure as YuvoyError).status).toBe(401);
    expect(await deviceSavedStore.listSavedIds()).toEqual(["exp_try_dive"]);
  });
});

describe("what may leave the device", () => {
  it("cleans off the device what an unanswered adoption already moved", async () => {
    /*
      The server committed the adoption and the answer never arrived. Those
      saves are on the account AND still on the device, and left there they
      would be adopted again after the traveller removed one, putting it back.
    */
    server.use(
      http.post(`${BASE}/me/saved/adopt`, () => {
        __seedSavedMock(TOKEN, ["exp_try_dive"]);
        return HttpResponse.error();
      }),
    );
    await onDevice("exp_try_dive");

    expect(await readAccountSavedIds()).toEqual(["exp_try_dive"]);
    expect(await deviceSavedStore.listSavedIds()).toEqual([]);
  });

  it("keeps every save when the refusal is this app's own proxy, not the API", async () => {
    /*
      The proxy answers 404 for a path its allowlist lacks, with no request
      id: what an older deployment would say to a newer page, for every save.
      Reading that as "these listings are gone" would delete them all.
    */
    server.use(
      http.post(`${BASE}/me/saved/adopt`, () =>
        HttpResponse.json(
          { error: { code: "not_found", message: "No such route." } },
          { status: 404 },
        ),
      ),
    );
    await onDevice("exp_try_dive", UNKNOWN_UUID);

    await readAccountSavedIds();

    expect([...(await deviceSavedStore.listSavedIds())].sort()).toEqual(
      [UNKNOWN_UUID, "exp_try_dive"].sort(),
    );
    // And no save was tried one at a time on the strength of it.
    expect(calls.filter((c) => c === "POST /me/saved")).toEqual([]);
  });

  it("keeps a save the API refused while its listing still answers", async () => {
    // An id the account will not take, on a listing that is plainly there.
    await deviceSavedStore.addSaved(UNKNOWN_UUID, "mangrove-kayak-at-dawn");
    await onDevice("exp_try_dive");

    const ids = await readAccountSavedIds();

    // The good one still moved: one refusal does not hold up the rest.
    expect(ids).toEqual(["exp_try_dive"]);
    expect(await deviceSavedStore.listSavedIds()).toEqual([UNKNOWN_UUID]);
  });

  it("does not ask again, this visit, about a save it had to keep", async () => {
    await deviceSavedStore.addSaved(UNKNOWN_UUID, "mangrove-kayak-at-dawn");
    await readAccountSavedIds();
    calls = [];

    await readAccountSavedIds();

    // A plain read: no batch, no single save, for an answer that will not change.
    expect(calls).toEqual(["GET /me/saved/ids"]);
  });
});

describe("when who is signed in changes mid-way", () => {
  it("does not hand one session's adoption to the next", async () => {
    server.use(
      http.post(`${BASE}/me/saved/adopt`, async ({ request }) => {
        await delay(100);
        const { experienceIds } = (await request.json()) as {
          experienceIds: string[];
        };
        return HttpResponse.json({ ids: experienceIds });
      }),
    );
    await onDevice("exp_try_dive");

    const first = adoptDeviceSavesOnce();
    resetSavedSession();
    const second = adoptDeviceSavesOnce();

    // A new session starts its own, rather than joining the old one's answer.
    expect(second).not.toBe(first);
    await Promise.all([first, second]);
  });
});
