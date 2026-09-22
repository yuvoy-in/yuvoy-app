import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { __seedSavedMock } from "../../../mocks/saved-handlers";
import { renderWithQuery } from "@/test/render";
import { useSaved } from "./use-saved";
import { deviceSavedStore } from "./saved-store";
import { resetSavedSession } from "./account-saved";
import { qk } from "@/lib/query/policy";

/**
 * The bookmark on a feed card, wherever the save lands (yuvoy-api#192).
 *
 * Signed in, a tap is a write to the account; signed out, to this browser.
 * The card never knows which, and these pin that it does not have to.
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

/** The smallest card: one bookmark, reading and toggling the saved set. */
function Bookmark({ id, slug }: { id: string; slug: string }) {
  const { isSaved, toggleSaved } = useSaved();
  return (
    <button
      type="button"
      aria-pressed={isSaved(id)}
      onClick={() => toggleSaved(id, slug)}
    >
      Save
    </button>
  );
}

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
  calls = [];
  server.events.on("request:start", record);
});
afterEach(() => {
  server.events.removeListener("request:start", record);
});

/** Signed in, with the account's set read, so a tap goes to the account. */
async function signedInAndLoaded() {
  __signInAppRouteMock(TOKEN);
  renderWithQuery(<Bookmark id="exp_kayak" slug="mangrove-kayak-at-dawn" />);
  await waitFor(() => expect(calls).toContain("GET /me/saved/ids"));
  return screen.getByRole("button", { name: "Save" });
}

describe("signed in", () => {
  it("saves to the account, and the bookmark fills at once", async () => {
    const user = userEvent.setup();
    const bookmark = await signedInAndLoaded();

    await user.click(bookmark);

    expect(bookmark).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(calls).toContain("POST /me/saved"));
    // And it is on the account, not only on the screen.
    await waitFor(() =>
      expect(calls.filter((c) => c === "GET /me/saved/ids").length).toBe(2),
    );
    expect(bookmark).toHaveAttribute("aria-pressed", "true");
    expect(await deviceSavedStore.listSavedIds()).toEqual([]);
  });

  it("sends a save and an unsave in the order they were tapped", async () => {
    /*
      Two requests, and nothing about HTTP makes the second arrive second. If
      the server applied the DELETE first, the account would hold something
      the bookmark says it does not. One queue for every saved write is what
      stops that, so the unsave may not even START until the save has ended.

      The save is held open for 150ms so both taps land while it is in
      flight, which is the case under test. Without that, a fast mock
      finishes the first write before the second tap and proves nothing.
    */
    const order: string[] = [];
    server.use(
      http.post(`${BASE}/me/saved`, async () => {
        order.push("save started");
        await delay(150);
        order.push("save ended");
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`${BASE}/me/saved/:experienceId`, () => {
        order.push("unsave started");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    const bookmark = await signedInAndLoaded();

    await user.click(bookmark);
    await user.click(bookmark);

    // Both taps showed at once, whatever the network was doing.
    expect(bookmark).toHaveAttribute("aria-pressed", "false");
    await waitFor(() =>
      expect(order).toEqual(["save started", "save ended", "unsave started"]),
    );
    /*
      Reconciled ONCE, after the queue drained. A re-read between the two
      writes would answer "saved" and the bookmark would flicker to it and
      back under the traveller's finger.
    */
    await waitFor(() =>
      expect(calls.filter((c) => c === "GET /me/saved/ids")).toHaveLength(2),
    );
    expect(bookmark).toHaveAttribute("aria-pressed", "false");
  });

  it("puts the bookmark back when the account refuses", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/me/saved`, () =>
        HttpResponse.json(
          { error: { code: "internal_error", message: "Down." } },
          { status: 500 },
        ),
      ),
    );
    const bookmark = await signedInAndLoaded();

    await user.click(bookmark);

    // A wishlist that quietly lost a row would be worse than one that says so
    // by flipping back.
    await waitFor(() =>
      expect(bookmark).toHaveAttribute("aria-pressed", "false"),
    );
  });

  it("an unsave also removes a copy still waiting on the device", async () => {
    /*
      A copy the account already holds is only waiting to be adopted. Left
      on the device after an unsave, the re-read that follows would adopt it
      again and the bookmark would fill back up under the traveller's finger.
    */
    __seedSavedMock(TOKEN, ["exp_kayak"]);
    const user = userEvent.setup();
    const bookmark = await signedInAndLoaded();
    await waitFor(() =>
      expect(bookmark).toHaveAttribute("aria-pressed", "true"),
    );
    await deviceSavedStore.addSaved("exp_kayak", "mangrove-kayak-at-dawn");

    await user.click(bookmark);

    await waitFor(() => expect(calls).toContain("DELETE /me/saved/exp_kayak"));
    await waitFor(() =>
      expect(calls.filter((c) => c === "GET /me/saved/ids")).toHaveLength(2),
    );
    expect(await deviceSavedStore.listSavedIds()).toEqual([]);
    expect(calls).not.toContain("POST /me/saved/adopt");
    expect(bookmark).toHaveAttribute("aria-pressed", "false");
  });

  it("drops a write queued under a session that has since ended", async () => {
    /*
      Sign out, and another number signs in, while an unsave waits behind a
      slow save. The proxy attaches whatever cookie is current when a request
      leaves, so sending it would unsave on somebody else's account.
    */
    const order: string[] = [];
    server.use(
      http.post(`${BASE}/me/saved`, async () => {
        order.push("save started");
        await delay(150);
        order.push("save ended");
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`${BASE}/me/saved/:experienceId`, () => {
        order.push("unsave started");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    const bookmark = await signedInAndLoaded();

    await user.click(bookmark);
    await user.click(bookmark);
    // Who is signed in changes while the unsave is still queued.
    resetSavedSession();

    await waitFor(() => expect(order).toContain("save ended"));
    await delay(100);
    expect(order).toEqual(["save started", "save ended"]);
  });

  it("shows what the account already holds", async () => {
    __seedSavedMock(TOKEN, ["exp_kayak"]);
    __signInAppRouteMock(TOKEN);

    renderWithQuery(<Bookmark id="exp_kayak" slug="mangrove-kayak-at-dawn" />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });
});

describe("signed out", () => {
  it("saves to this browser and calls no account route", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Bookmark id="exp_kayak" slug="mangrove-kayak-at-dawn" />);
    const bookmark = screen.getByRole("button", { name: "Save" });

    await user.click(bookmark);

    expect(bookmark).toHaveAttribute("aria-pressed", "true");
    await waitFor(async () =>
      expect(await deviceSavedStore.listSavedIds()).toEqual(["exp_kayak"]),
    );
    expect(calls).toEqual([]);
  });
});

describe("hydrating", () => {
  it("draws every bookmark empty first, as the server did, then fills it", async () => {
    /*
      The server knows no saves, so every bookmark it renders is empty. The
      feed hydrates in more than one pass and its first pass starts the saved
      set's own query, so a card hydrating later can find the set already in
      the cache. Filling its bookmark on that first client render disagrees
      with the server HTML: React #418 for anybody signed in with saves.
    */
    const tree = (client: QueryClient) => (
      <QueryClientProvider client={client}>
        <Bookmark id="exp_kayak" slug="mangrove-kayak-at-dawn" />
      </QueryClientProvider>
    );
    const html = renderToString(tree(new QueryClient()));
    expect(html).toContain('aria-pressed="false"');
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(qk.session(), { signedIn: true });
    client.setQueryData(qk.savedIds("account"), ["exp_kayak"]);

    const mismatches: unknown[] = [];
    const root = await act(async () =>
      hydrateRoot(container, tree(client), {
        onRecoverableError: (error) => mismatches.push(error),
      }),
    );

    expect(mismatches).toEqual([]);
    // One render later, the account's answer.
    expect(container.querySelector("button")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    act(() => root.unmount());
    container.remove();
  });
});
