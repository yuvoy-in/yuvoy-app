import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { OperatorListingsScreen } from "./operator-listings-screen";
import { server } from "../../../mocks/server";
import { operatorProfileFor } from "../../../mocks/fixtures";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const SLUG = "sample-boat-operator";

vi.mock("next/navigation", () => ({
  /*
    `LoginButton` sits in every logo header and in the feed masthead
    (yuvoy-app#56), and it reads both of these. A mock missing either
    fails the whole file with "No export is defined", which reads as a
    broken screen rather than an incomplete mock.
  */
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/o/${SLUG}/listings`,
}));

/**
 * What a business runs — `/o/{slug}/listings`, yuvoy-app#33.
 *
 * The three rules below are not new. They were asserted on `Feed` while the
 * reel card printed a price and a next date, then on the profile while it
 * carried the listing rows. Both moved; the rules did not, so the tests
 * followed the component rather than being deleted with the screen that used
 * to host it. Deleting them at either step would have left `ListingCard` free
 * to print ₹0 with nothing failing.
 */
describe("OperatorListingsScreen", () => {
  it("lists everything the business runs, under their name", async () => {
    renderWithQuery(<OperatorListingsScreen slug={SLUG} />);
    await screen.findByRole("heading", { level: 1, name: "What they run" });
    expect(screen.getByText("Sample Boat Operator")).toBeInTheDocument();

    const profile = operatorProfileFor(SLUG);
    for (const { experience } of profile.listings) {
      expect(screen.getByText(experience.title)).toBeInTheDocument();
    }
  });

  it("carries a way back to the business, not the tab bar", async () => {
    // A focused screen: it is a place a traveller goes INTO from the profile.
    renderWithQuery(<OperatorListingsScreen slug={SLUG} />);
    await screen.findByRole("heading", { level: 1, name: "What they run" });
    expect(screen.getByRole("link", { name: /^Back to/ })).toHaveAttribute(
      "href",
      `/o/${SLUG}`,
    );
  });

  it("shows a listing that cannot be booked, and says so", async () => {
    /*
      "`bookable: false` on a listing card means show it and say it cannot be
      booked, not hide it. Somebody followed a link looking for a specific
      thing they saw; an emptier page with no explanation is worse than a card
      marked 'Not available right now'."
    */
    renderWithQuery(<OperatorListingsScreen slug={SLUG} />);
    await screen.findByRole("heading", { level: 1, name: "What they run" });
    expect(screen.getByText("Not available right now")).toBeInTheDocument();
  });

  it("never renders a placeholder price when none is contracted", async () => {
    /*
      `fromPrice` is absent until a real contracted price exists. ₹0 would be a
      fabricated claim — the exact class of thing this project removed an
      entire site for publishing (rulebook §10).
    */
    const profile = operatorProfileFor(SLUG);
    server.use(
      http.get(`${BASE}/operators/${SLUG}`, () =>
        HttpResponse.json({
          ...profile,
          listings: profile.listings.map((l) => ({
            ...l,
            experience: { ...l.experience, fromPrice: undefined },
          })),
        }),
      ),
    );

    renderWithQuery(<OperatorListingsScreen slug={SLUG} />);
    expect(
      (await screen.findAllByText("Price on request")).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("₹0")).not.toBeInTheDocument();
  });

  it("says so when nothing is bookable in 90 days, rather than staying silent", async () => {
    /*
      `nextAvailable` absent means "we checked and there is nothing", not "we
      did not check". Saying so is what stops the tap that ends in an empty
      date picker, which is the tap that loses the traveller.
    */
    const profile = operatorProfileFor(SLUG);
    server.use(
      http.get(`${BASE}/operators/${SLUG}`, () =>
        HttpResponse.json({
          ...profile,
          listings: profile.listings.map((l) => ({
            ...l,
            bookable: true,
            experience: { ...l.experience, nextAvailable: undefined },
          })),
        }),
      ),
    );

    renderWithQuery(<OperatorListingsScreen slug={SLUG} />);
    expect(
      (await screen.findAllByText("No dates in the next 90 days")).length,
    ).toBeGreaterThan(0);
  });

  it("says a business with nothing on sale has nothing on sale", async () => {
    /*
      Reachable even though the profile only shows the door when there is
      something behind it: this address can be typed, shared, or opened from a
      page drawn before the last listing was paused.
    */
    const profile = operatorProfileFor(SLUG);
    server.use(
      http.get(`${BASE}/operators/${SLUG}`, () =>
        HttpResponse.json({ ...profile, listings: [] }),
      ),
    );

    renderWithQuery(<OperatorListingsScreen slug={SLUG} />);
    expect(
      await screen.findByText(/Nothing on sale right now/),
    ).toBeInTheDocument();
  });
});
