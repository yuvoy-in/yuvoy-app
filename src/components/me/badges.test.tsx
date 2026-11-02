import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { MeSection } from "./me-section";
import { badge, meRoutes, openMe, page, progress, trip } from "./me-test-kit";

/**
 * Badges on Me (yuvoy-mobile#444 cases 16 to 18): earned with what earned
 * them, those on their way, and a new one once, with Nice.
 */

const idb = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.store.get(k),
  set: async (k: string, v: unknown) => {
    idb.store.set(k, v);
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  idb.store.clear();
  vi.stubGlobal("indexedDB", {});
  __signInAppRouteMock();
  openMe();
});

const section = () => screen.findByRole("region", { name: "Badges" });

describe("earned badges (case 16)", () => {
  it("shows the name, the date and what earned it at a tap", async () => {
    const user = userEvent.setup();
    meRoutes({ list: page([trip()]), badges: { earned: [badge()], inProgress: [] } });
    renderWithQuery(<MeSection />);
    const badges = await section();
    const row = within(badges).getByRole("button", { name: /First trip/ });
    expect(row).toHaveTextContent("16 Sep 2026");
    expect(within(badges).getByText("Your first trip with Yuvoy.")).toBeInTheDocument();
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(within(badges).getByText("Earned from")).not.toBeVisible();
    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(within(badges).getByText("Earned from")).toBeVisible();
    expect(within(badges).getByText("Try-dive at Nemo Reef · 16 Sep 2026")).toBeVisible();
  });

  it("says only the owner sees one earned without a check-in", async () => {
    meRoutes({ badges: { earned: [badge({ checked: false })], inProgress: [] } });
    renderWithQuery(<MeSection />);
    expect(
      await within(await section()).findByText(
        "Only you can see this one. It counts for friends once a check-in confirms it.",
      ),
    ).toBeInTheDocument();
  });

  it("is not a button when nothing is named as earning it", async () => {
    meRoutes({ badges: { earned: [badge({ evidence: [] })], inProgress: [] } });
    renderWithQuery(<MeSection />);
    const badges = await section();
    expect(within(badges).getByText("First trip")).toBeInTheDocument();
    expect(within(badges).queryByRole("button", { name: /First trip/ })).toBeNull();
    expect(within(badges).queryByText("Earned from")).toBeNull();
  });

  it("says where the first one comes from when there are none", async () => {
    meRoutes({ badges: { earned: [], inProgress: [progress()] } });
    renderWithQuery(<MeSection />);
    expect(
      await within(await section()).findByText(
        "Badges come from things you do. Your first one comes with your first trip or event.",
      ),
    ).toBeInTheDocument();
  });
});

describe("badges on their way (case 17)", () => {
  it("shows how far, and a season's last day", async () => {
    meRoutes({
      badges: {
        earned: [],
        inProgress: [progress(), progress({ key: "two_trips", name: "Two trips", endsOn: undefined, need: 2 })],
      },
    });
    renderWithQuery(<MeSection />);
    const badges = await section();
    expect(within(badges).getByText("1 of 3 · Ends 30 Sep 2026")).toBeInTheDocument();
    expect(within(badges).getByText("1 of 2")).toBeInTheDocument();
  });
});

describe("a new badge (case 18)", () => {
  const fresh = () => badge({ key: "first_went", name: "First night out", seen: false });

  it("shows once, and Nice marks it seen", async () => {
    const user = userEvent.setup();
    const at = meRoutes({ badges: { earned: [fresh(), badge()], inProgress: [] } });
    renderWithQuery(<MeSection />);
    const panel = await screen.findByRole("status", { name: "New badge: First night out" });
    await user.click(within(panel).getByRole("button", { name: "Nice" }));
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "New badge: First night out" })).toBeNull(),
    );
    await waitFor(() => expect(at.seen.bodies).toEqual([{ keys: ["first_went"] }]));
    // A seen badge never asks.
    expect(screen.queryByRole("status", { name: "New badge: First trip" })).toBeNull();
  });

  it("does not show again when Account is opened again after Nice", async () => {
    const user = userEvent.setup();
    const at = meRoutes({ badges: { earned: [fresh()], inProgress: [] } });
    const first = renderWithQuery(<MeSection />);
    const panel = await screen.findByRole("status", { name: "New badge: First night out" });
    await user.click(within(panel).getByRole("button", { name: "Nice" }));
    await waitFor(() => expect(at.seen.count).toBe(1));
    first.unmount();
    // A new client, as after a reload: only the server's answer is left.
    renderWithQuery(<MeSection />);
    expect(await screen.findByText("First night out")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "New badge: First night out" })).toBeNull();
    expect(at.badges.count).toBe(2);
  });

  it("comes back with a line when Nice did not save", async () => {
    const user = userEvent.setup();
    meRoutes({ badges: { earned: [fresh()], inProgress: [] }, seen: 503 });
    renderWithQuery(<MeSection />);
    const panel = await screen.findByRole("status", { name: "New badge: First night out" });
    await user.click(within(panel).getByRole("button", { name: "Nice" }));
    expect(
      await screen.findByText("We could not save that just now. Try again."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "New badge: First night out" }),
    ).toBeInTheDocument();
  });
});
