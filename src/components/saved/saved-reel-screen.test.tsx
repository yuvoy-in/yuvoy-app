import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { renderWithQuery } from "@/test/render";
import { SavedReelScreen } from "./saved-reel-screen";
import { SavedScreen } from "./saved-screen";
import { EXPERIENCES } from "../../../mocks/fixtures";

/**
 * Saved, playing (the approved redesign: "Saved plays as a reel, with a grid
 * toggle", traveller A, 3 Oct 2026).
 */

const idb = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  /** Never answer a read: the phone still reading its saves. */
  hang: false,
}));
vi.mock("idb-keyval", () => ({
  get: (k: string) =>
    idb.hang ? new Promise(() => {}) : Promise.resolve(idb.store.get(k)),
  set: async (k: string, v: unknown) => void idb.store.set(k, v),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/saved/r/x",
}));

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const KEY = "yuvoy.saved.v2";
const TOKEN = "sess_919000000000";
const [first, second] = EXPERIENCES;

beforeEach(() => {
  idb.store.clear();
  idb.hang = false;
  vi.stubGlobal("indexedDB", {});
});
afterEach(cleanup);

function accountSaves(items: object[]) {
  server.use(
    http.get(`${BASE}/me/saved`, () =>
      HttpResponse.json({ items, nextCursor: null, complete: true }),
    ),
  );
}

describe("SavedReelScreen", () => {
  it("plays the account's saves, opened on the one tapped, with the way back to the grid", async () => {
    __signInAppRouteMock(TOKEN);
    accountSaves([
      { ...first, bookable: true },
      { ...second, bookable: true },
    ]);
    renderWithQuery(<SavedReelScreen experienceId={second.id} />);

    expect(
      await screen.findByRole("heading", { level: 1, name: second.title }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", {
        name: "Back to your saved experiences",
      })[0],
    ).toHaveAttribute("href", "/saved");
  });

  it("offers the way back while the saves are read", () => {
    /*
      The tab bar is hidden here, and the wait drew the well alone, with no
      way back to the grid until the saves arrived (stability audit,
      6 Oct 2026).
    */
    idb.hang = true;
    renderWithQuery(<SavedReelScreen experienceId={second.id} />);
    expect(
      screen.getByRole("status", { name: "Loading your saves" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to your saved experiences" }),
    ).toHaveAttribute("href", "/saved");
  });

  it("says so, with the way back, for a save that is not there any more", async () => {
    __signInAppRouteMock(TOKEN);
    accountSaves([{ ...first, bookable: true }]);
    renderWithQuery(<SavedReelScreen experienceId="exp_gone" />);
    expect(
      await screen.findByText("This one is not in your saves any more"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to your saved experiences" }),
    ).toHaveAttribute("href", "/saved");
  });

  it("plays this phone's saves when signed out", async () => {
    idb.store.set(KEY, [
      { id: first.id, slug: first.slug, savedAt: 1_700_000_000_000 },
    ]);
    renderWithQuery(<SavedReelScreen experienceId={first.id} />);
    expect(
      await screen.findByRole("heading", { level: 1, name: first.title }),
    ).toBeInTheDocument();
  });
});

describe("the grid's way in", () => {
  it("offers to play the saves, from the first one with a clip", async () => {
    __signInAppRouteMock(TOKEN);
    accountSaves([
      { ...first, heroMedia: undefined, bookable: true },
      { ...second, bookable: true },
    ]);
    renderWithQuery(<SavedScreen />);
    expect(
      await screen.findByRole("link", { name: "Play them" }),
    ).toHaveAttribute("href", `/saved/r/${second.id}`);
  });

  it("offers nothing to play when no save has a clip", async () => {
    __signInAppRouteMock(TOKEN);
    accountSaves([{ ...first, heroMedia: undefined, bookable: true }]);
    renderWithQuery(<SavedScreen />);
    await screen.findByText(first.title);
    expect(screen.queryByRole("link", { name: "Play them" })).toBeNull();
  });
});
