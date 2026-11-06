import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { __seedSavedMock } from "../../../mocks/saved-handlers";
import { renderWithQuery } from "@/test/render";
import { SavedScreen } from "./saved-screen";
import { EXPERIENCES } from "../../../mocks/fixtures";

/**
 * The wishlist, which is the first screen saving has ever had.
 *
 * The bookmark on the feed wrote to storage that nothing read back, so every
 * save was a tap into a void. These cover the four states a held experience
 * can actually be in, because a wishlist is kept for weeks and a listing can
 * be withdrawn underneath it.
 */
const idb = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  /** When set, every read waits for it: storage that is slow to answer. */
  hold: null as Promise<void> | null,
}));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => {
    if (idb.hold) await idb.hold;
    return idb.store.get(k);
  },
  set: async (k: string, v: unknown) => {
    idb.store.set(k, v);
  },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/saved",
}));

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const KEY = "yuvoy.saved.v2";
const first = EXPERIENCES[0];
const second = EXPERIENCES[1];
const TOKEN = "sess_919000000000";

/** One entry, shaped as the store holds it. */
const entry = (id: string, slug: string | null) => ({
  id,
  slug,
  savedAt: 1_700_000_000_000,
});

beforeEach(() => {
  idb.store.clear();
  idb.hold = null;
  vi.stubGlobal("indexedDB", {});
});
afterEach(cleanup);

/*
  Signed in, the list is the ACCOUNT's (yuvoy-api#192): the same on every
  phone, with bodies in pages rather than a request per tile.
*/
describe("signed in: saves on the account", () => {
  /** Every request to the API's saved routes, in order. */
  let calls: string[] = [];
  function record({ request }: { request: Request }) {
    const url = new URL(request.url);
    if (url.href.startsWith(BASE) && url.pathname.includes("/me/saved")) {
      calls.push(`${request.method} ${url.pathname.replace(/^\/v1/, "")}`);
    }
  }

  beforeEach(() => {
    __signInAppRouteMock(TOKEN);
    calls = [];
    server.events.on("request:start", record);
  });
  afterEach(() => {
    server.events.removeListener("request:start", record);
  });

  it("shows the account's saves, and no one-device note", async () => {
    __seedSavedMock(TOKEN, [first.id]);

    renderWithQuery(<SavedScreen />);

    const link = await screen.findByRole("link", {
      name: new RegExp(first.title, "i"),
    });
    expect(link).toHaveAttribute("href", `/e/${first.slug}`);
    expect(
      await screen.findByText(/^1 experience you are holding on to\.$/i),
    ).toBeInTheDocument();
    // True signed out, false here: saying it would tell somebody their list
    // is stuck on one phone when it is on their account.
    expect(screen.queryByText(/saved in this browser only/i)).toBeNull();
  });

  it("brings this browser's saves onto the account on the first read", async () => {
    __seedSavedMock(TOKEN, [second.id]);
    idb.store.set(KEY, [entry(first.id, first.slug)]);

    renderWithQuery(<SavedScreen />);

    expect(
      await screen.findByRole("link", { name: new RegExp(first.title, "i") }),
    ).toBeInTheDocument();
    // A union: what the account already held is still there.
    expect(
      screen.getByRole("link", { name: new RegExp(second.title, "i") }),
    ).toBeInTheDocument();
    // And the device no longer holds what the account now does.
    await waitFor(() => expect(idb.store.get(KEY)).toEqual([]));
  });

  it("says a listing that stopped selling is not taking bookings", async () => {
    /*
      The account keeps a save when its listing is unpublished, with the
      summary it had and `bookable: false`, and no picture (rights may have
      been withdrawn). The tile stays and the price line changes.
    */
    server.use(
      http.get(`${BASE}/me/saved`, () =>
        HttpResponse.json({
          items: [{ ...first, heroMedia: undefined, bookable: false }],
          nextCursor: null,
          complete: true,
        }),
      ),
    );

    renderWithQuery(<SavedScreen />);

    expect(await screen.findByText(/not taking bookings/i)).toBeInTheDocument();
  });

  it("removes on the account, and undo saves it again, in that order", async () => {
    const user = userEvent.setup();
    __seedSavedMock(TOKEN, [first.id]);

    renderWithQuery(<SavedScreen />);
    await user.click(
      await screen.findByRole("button", { name: /remove .* from saved/i }),
    );
    // Gone at once, with the way back offered.
    expect(await screen.findByText("Nothing saved yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /undo/i }));

    expect(
      await screen.findByRole("link", { name: new RegExp(first.title, "i") }),
    ).toBeInTheDocument();
    /*
      THE ORDER IS THE POINT. An undo tapped while the removal is still in
      flight is a save racing a delete, and if the server applied them the
      other way round the tile would say "saved" over a list that is not.
      Every saved write goes through one queue for exactly this.
    */
    await waitFor(() =>
      expect(calls.filter((c) => !c.startsWith("GET"))).toEqual([
        `DELETE /me/saved/${first.id}`,
        "POST /me/saved",
      ]),
    );
  });

  it("pages, rather than stopping at the first fifty", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${BASE}/me/saved`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        return HttpResponse.json(
          cursor
            ? {
                items: [{ ...second, bookable: true }],
                nextCursor: null,
                complete: true,
              }
            : {
                items: [{ ...first, bookable: true }],
                nextCursor: "c1",
                complete: false,
              },
        );
      }),
    );

    renderWithQuery(<SavedScreen />);
    await screen.findByRole("link", { name: new RegExp(first.title, "i") });
    await user.click(screen.getByRole("button", { name: "Show more" }));

    expect(
      await screen.findByRole("link", { name: new RegExp(second.title, "i") }),
    ).toBeInTheDocument();
    // The second page said it was the last.
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("offers a retry when the list will not load", async () => {
    const user = userEvent.setup();
    /*
      Three, because the API client already retries a failed GET twice with
      backoff before a screen ever sees it. One failure is invisible by design;
      this is the case where the transport has given up.
    */
    let failures = 3;
    server.use(
      http.get(`${BASE}/me/saved`, () => {
        if (failures-- > 0) {
          return HttpResponse.json(
            { error: { code: "internal_error", message: "Down." } },
            { status: 500 },
          );
        }
        return HttpResponse.json({
          items: [{ ...first, bookable: true }],
          nextCursor: null,
          complete: true,
        });
      }),
    );

    renderWithQuery(<SavedScreen />);
    await user.click(
      await screen.findByRole(
        "button",
        { name: "Try again" },
        // The transport's own backoff runs first.
        { timeout: 5_000 },
      ),
    );

    expect(
      await screen.findByRole("link", { name: new RegExp(first.title, "i") }),
    ).toBeInTheDocument();
  });

  it("keeps the list, and says so quietly, when a refresh fails", async () => {
    __seedSavedMock(TOKEN, [first.id]);
    const { client } = renderWithQuery(<SavedScreen />);
    await screen.findByRole("link", { name: new RegExp(first.title, "i") });

    // Every attempt fails, including the transport's own two retries.
    server.use(
      http.get(`${BASE}/me/saved`, () =>
        HttpResponse.json(
          { error: { code: "internal_error", message: "Down." } },
          { status: 500 },
        ),
      ),
    );
    await client.invalidateQueries({ queryKey: ["listSavedExperiences"] });

    expect(
      await screen.findByText(/this list may be behind/i, undefined, {
        timeout: 5_000,
      }),
    ).toBeInTheDocument();
    // Still true a minute ago, and still useful: the list stays.
    expect(
      screen.getByRole("link", { name: new RegExp(first.title, "i") }),
    ).toBeInTheDocument();
  });

  it("keeps an emptied list and its Undo when a refresh fails", async () => {
    /*
      TanStack keeps the last pages when a refetch fails and still reports
      `isError`. The screen tested the error first, so removing the last save
      and then missing one refresh replaced "Nothing saved yet" AND the only
      way back with a full-screen "Try again".
    */
    const user = userEvent.setup();
    __seedSavedMock(TOKEN, [first.id]);
    const { client } = renderWithQuery(<SavedScreen />);
    await user.click(
      await screen.findByRole("button", { name: /remove .* from saved/i }),
    );
    expect(await screen.findByText("Nothing saved yet")).toBeInTheDocument();
    await waitFor(() =>
      expect(calls).toContain(`DELETE /me/saved/${first.id}`),
    );

    server.use(
      http.get(`${BASE}/me/saved`, () =>
        HttpResponse.json(
          { error: { code: "internal_error", message: "Down." } },
          { status: 500 },
        ),
      ),
    );
    await client.invalidateQueries({ queryKey: ["listSavedExperiences"] });

    expect(
      await screen.findByText(/this list may be behind/i, undefined, {
        timeout: 5_000,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Nothing saved yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("does not call a session that ended on Show more a wrong code", async () => {
    const user = userEvent.setup();
    /*
      The session answer is held at "signed in", so the screen stays put with
      the failed page under it. Otherwise the 401 flips it to this browser's
      list first and the panel is never on screen to be wrong.
    */
    server.use(
      http.get("*/api/session", () => HttpResponse.json({ signedIn: true })),
    );
    server.use(
      http.get(`${BASE}/me/saved`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        return cursor
          ? HttpResponse.json(
              { error: { code: "unauthorized", message: "Sign in." } },
              { status: 401 },
            )
          : HttpResponse.json({
              items: [{ ...first, bookable: true }],
              nextCursor: "c1",
              complete: false,
            });
      }),
    );

    renderWithQuery(<SavedScreen />);
    await user.click(await screen.findByRole("button", { name: "Show more" }));
    await waitFor(() => expect(screen.queryByText("Loading more…")).toBeNull());

    // describeError reads a bare 401 as the sign-in form's wrong code.
    expect(screen.queryByText(/that code did not work/i)).toBeNull();
  });

  it("falls back to this browser when the session has ended", async () => {
    /*
      The proxy drops the cookie on a 401, and the session answer is asked
      again, so the screen should end on the device's list. What it must never
      say is "That code did not work": that is describeError's reading of a
      401 on the sign-in form, and nobody here typed a code.
    */
    const ended = () =>
      HttpResponse.json(
        { error: { code: "unauthorized", message: "Sign in." } },
        { status: 401 },
      );
    server.use(
      http.get(`${BASE}/me/saved`, ended),
      http.get(`${BASE}/me/saved/ids`, ended),
    );

    renderWithQuery(<SavedScreen />);

    expect(await screen.findByText("Nothing saved yet")).toBeInTheDocument();
    expect(screen.queryByText(/that code did not work/i)).toBeNull();
  });
});
