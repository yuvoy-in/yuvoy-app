import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import { StrictMode } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { qk } from "@/lib/query/policy";
import { AdoptStoredSession } from "./adopt-stored-session";
import { server } from "../../../mocks/server";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/*
  jsdom has no IndexedDB, and this component exists to read one. Same stub the
  token store's tests use.
*/
const idb = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.store.get(k),
  set: async (k: string, v: unknown) => void idb.store.set(k, v),
  del: async (k: string) => void idb.store.delete(k),
  keys: async () => [...idb.store.keys()],
}));

beforeAll(() => vi.stubGlobal("indexedDB", {}));
beforeEach(() => idb.store.clear());
afterEach(cleanup);

const KEY = "yuvoy.traveller-session";

/**
 * Carrying a pre-cookie sign-in across (yuvoy-app#57 item 8).
 *
 * This is the migration, and getting it wrong is expensive in a way the rest
 * of #57 is not: everybody signed in when the change ships is signed out on
 * the deploy, sees no reason for it, and has to ask for another code. The
 * owner's own number had twelve live sessions the day this was written.
 *
 * "Existing sign-ins: a traveller signed in before this ships is still signed
 * in after it ships, once the adopt step has run" is the issue's own wording
 * for done.
 */
describe("adopting a session stored before the cookie", () => {
  it("hands the stored token over and clears the record", async () => {
    idb.store.set(KEY, { sessionToken: "sess_919000000000" });

    let sentToken: string | null = null;
    server.use(
      http.post("*/api/session/adopt", async ({ request }) => {
        const body = (await request.json()) as { sessionToken?: string };
        sentToken = body?.sessionToken ?? null;
        return HttpResponse.json({ adopted: true });
      }),
    );

    renderWithQuery(<AdoptStoredSession />);

    await waitFor(() => expect(sentToken).toBe("sess_919000000000"));
    // Gone, so the next load does not send it again.
    await waitFor(() => expect(idb.store.has(KEY)).toBe(false));
  });

  it("adopts once under StrictMode, and tells the session it changed", async () => {
    /*
      StrictMode runs the effect, cleans it up and runs it again. The first
      run was cancelled before it posted and the second found a "ran" flag
      set, so in development nothing was ever adopted (stability audit,
      6 Oct 2026).
    */
    idb.store.set(KEY, { sessionToken: "sess_919000000000" });
    let posts = 0;
    server.use(
      http.post("*/api/session/adopt", () => {
        posts += 1;
        return HttpResponse.json({ adopted: true });
      }),
    );

    // At the root, as Next puts it in development: nested inside the test
    // helper's wrapper, React does not run the effects twice.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <AdoptStoredSession />
        </QueryClientProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(idb.store.has(KEY)).toBe(false));
    expect(posts).toBe(1);
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.session() }),
    );
  });

  it("clears the record even when the token is refused", async () => {
    /*
      A session that had already ended, sitting in storage. Keeping it would
      make every load re-post a token the API will keep refusing. The honest
      outcome is signed out, once.
    */
    idb.store.set(KEY, { sessionToken: "sess_dead" });
    server.use(
      http.post("*/api/session/adopt", () =>
        HttpResponse.json({ adopted: false }),
      ),
    );

    renderWithQuery(<AdoptStoredSession />);
    await waitFor(() => expect(idb.store.has(KEY)).toBe(false));
  });

  it("KEEPS the record when the request never arrived", async () => {
    /*
      The one that matters on this product's islands. Deleting before the
      server answers, or deleting on a network failure, signs a traveller out
      because of a dropped packet on a jetty. The worst case has to be one
      retry on the next load, not a lost session.
    */
    idb.store.set(KEY, { sessionToken: "sess_offline" });
    server.use(http.post("*/api/session/adopt", () => HttpResponse.error()));

    renderWithQuery(<AdoptStoredSession />);

    // Give the effect room to run and fail.
    await new Promise((r) => setTimeout(r, 50));
    expect(idb.store.has(KEY)).toBe(true);
  });

  it("posts nothing at all when there is no stored record", async () => {
    /*
      The common case, and it grows to every device over time. A migration
      that pings the server on every load forever is a cost with no payer.
    */
    let posts = 0;
    server.use(
      http.post("*/api/session/adopt", () => {
        posts += 1;
        return HttpResponse.json({ adopted: false });
      }),
    );

    renderWithQuery(<AdoptStoredSession />);
    await new Promise((r) => setTimeout(r, 50));
    expect(posts).toBe(0);
  });

  it("never asks the API directly, so the token stays server-side", async () => {
    /*
      The invariant the whole change rests on. Adopting by calling `GET /me`
      from the browser with the stored token would prove the session is live
      and leave the credential exactly where #57 took it from.
    */
    idb.store.set(KEY, { sessionToken: "sess_919000000000" });
    let direct = 0;
    server.use(
      http.get(`${BASE}/me`, () => {
        direct += 1;
        return HttpResponse.json({});
      }),
      http.post("*/api/session/adopt", () =>
        HttpResponse.json({ adopted: true }),
      ),
    );

    renderWithQuery(<AdoptStoredSession />);
    await waitFor(() => expect(idb.store.has(KEY)).toBe(false));
    expect(direct).toBe(0);
  });
});
