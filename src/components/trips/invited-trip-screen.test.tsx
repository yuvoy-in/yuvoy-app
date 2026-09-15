import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { InvitedTripScreen } from "./invited-trip-screen";
import { server } from "../../../mocks/server";
import {
  __signInAppRouteMock,
  __resetAppRouteMocks,
} from "../../../mocks/app-route-handlers";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const nav = vi.hoisted(() => ({ pushed: [] as string[] }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => nav.pushed.push(href),
    replace: vi.fn(),
  }),
  usePathname: () => "/trips/invited/inv_1",
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * A trip somebody else booked (yuvoy-app#38 item 7).
 *
 * Half of this file asserts ABSENCE, and that half is the point. The issue
 * forbids a price, a payment, a booking reference and anything about the
 * person who paid, and repeats the last one under "Do not build". None of it
 * is on the response, so the tests are really guarding against somebody
 * plumbing it in later from somewhere else.
 */

const trip = (over: Record<string, unknown> = {}) =>
  http.get(`${BASE}/me/invited-trips/:id`, () =>
    HttpResponse.json({
      id: "inv_1",
      role: "guest",
      guestState: "invited",
      experience: "Try-dive at Nemo Reef",
      experienceSlug: "try-dive-nemo-reef",
      operator: "Sample Dive Operator",
      localDate: "2026-09-22",
      localTime: "07:00",
      meetingPoint: "Jetty 2, Havelock",
      landmark: "Beside the blue ticket hut",
      durationMinutes: 120,
      partySize: 3,
      status: "confirmed",
      going: [{ name: "Ravi" }, { name: "Guest", you: true }],
      ...over,
    }),
  );

afterEach(() => {
  cleanup();
  __resetAppRouteMocks();
  nav.pushed = [];
});

describe("what a guest sees", () => {
  it("shows the trip, the day, the meeting point and who is going", async () => {
    server.use(trip());
    __signInAppRouteMock();

    renderWithQuery(<InvitedTripScreen id="inv_1" />);

    expect(
      await screen.findByRole("link", { name: "Try-dive at Nemo Reef" }),
    ).toHaveAttribute("href", "/e/try-dive-nemo-reef");
    expect(screen.getByText("Sample Dive Operator")).toBeInTheDocument();
    expect(screen.getByText(/Tue, 22 Sep · 07:00/)).toBeInTheDocument();
    expect(screen.getByText(/Jetty 2, Havelock/)).toBeInTheDocument();
    expect(screen.getByText("Beside the blue ticket hut")).toBeInTheDocument();
    expect(screen.getByText("About 2 hours")).toBeInTheDocument();
    expect(screen.getByText("Going ahead")).toBeInTheDocument();
  });

  it("says You for the reader's own place, and names the others", async () => {
    server.use(trip());
    __signInAppRouteMock();
    renderWithQuery(<InvitedTripScreen id="inv_1" />);

    expect(await screen.findByText("You")).toBeInTheDocument();
    expect(screen.getByText("Ravi")).toBeInTheDocument();
  });

  it("shows no money, no reference and nobody who paid", async () => {
    server.use(trip());
    __signInAppRouteMock();
    renderWithQuery(<InvitedTripScreen id="inv_1" />);

    await screen.findByText("Sample Dive Operator");
    expect(document.body.textContent).not.toMatch(/₹/);
    expect(document.body.textContent).not.toMatch(/YV-/);
    expect(document.body.textContent).not.toMatch(/Invited by/i);
    expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull();
  });

  it("hides What to bring while no listing carries it", async () => {
    // "No listing field carries this yet, so it is absent for now." An empty
    // heading over nothing is worse than no heading.
    server.use(trip());
    __signInAppRouteMock();
    renderWithQuery(<InvitedTripScreen id="inv_1" />);
    await screen.findByText("Sample Dive Operator");
    expect(screen.queryByText("What to bring")).toBeNull();
  });

  it("separates a called-off departure from a cancelled booking", async () => {
    /*
      A guest who reads "Cancelled" about a departure the operator stood down
      will ask the person who booked it why they cancelled.
    */
    server.use(trip({ status: "called_off" }));
    __signInAppRouteMock();
    renderWithQuery(<InvitedTripScreen id="inv_1" />);
    expect(
      await screen.findByText("Called off by the operator"),
    ).toBeInTheDocument();
  });
});

describe("answering", () => {
  it("joins", async () => {
    let accepted = false;
    server.use(
      trip(),
      http.post(`${BASE}/me/invited-trips/:id/accept`, () => {
        accepted = true;
        return HttpResponse.json({});
      }),
    );
    __signInAppRouteMock();

    const user = userEvent.setup();
    renderWithQuery(<InvitedTripScreen id="inv_1" />);
    await user.click(
      await screen.findByRole("button", { name: "Join this trip" }),
    );

    await waitFor(() => expect(accepted).toBe(true));
  });

  it("confirms before declining, and goes back to Trips", async () => {
    /*
      Not undoable from here: the contract has no way back, and the place
      returns to the booker to offer again. A one-tap Decline would be a
      destructive action dressed as a toggle.
    */
    let declined = false;
    server.use(
      trip(),
      http.post(`${BASE}/me/invited-trips/:id/decline`, () => {
        declined = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    __signInAppRouteMock();

    const user = userEvent.setup();
    renderWithQuery(<InvitedTripScreen id="inv_1" />);
    await user.click(await screen.findByRole("button", { name: "Decline" }));

    // The sheet, not the request.
    expect(await screen.findByText(/Your place goes back/)).toBeInTheDocument();
    expect(declined).toBe(false);

    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(declined).toBe(false);

    await user.click(screen.getByRole("button", { name: "Decline" }));
    await user.click(
      (await screen.findAllByRole("button", { name: "Decline" }))[1],
    );

    await waitFor(() => expect(declined).toBe(true));
    await waitFor(() => expect(nav.pushed).toContain("/trips"));
  });

  it("offers nothing to press once they have joined", async () => {
    // There is no "leave" in the contract, so a Decline here would either lie
    // or quietly remove somebody from a trip they are on.
    server.use(trip({ guestState: "joined" }));
    __signInAppRouteMock();
    renderWithQuery(<InvitedTripScreen id="inv_1" />);

    await screen.findByText("Sample Dive Operator");
    expect(screen.queryByRole("button", { name: "Join this trip" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
  });
});

describe("signed out", () => {
  it("says which number to sign in with, and comes back here", async () => {
    server.use(trip());
    renderWithQuery(<InvitedTripScreen id="inv_1" />);

    expect(
      await screen.findByRole("link", { name: "Sign in" }),
    ).toHaveAttribute("href", "/account?next=/trips/invited/inv_1");
  });
});
