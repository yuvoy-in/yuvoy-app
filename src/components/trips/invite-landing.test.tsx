import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { renderWithQuery } from "@/test/render";
import RouteLoading from "@/app/i/[token]/loading";
import { InviteLanding } from "./invite-landing";
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
  usePathname: () => "/i/tok_invite",
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * An invitation link (yuvoy-app#38 item 11).
 *
 * The property that matters most is that it WORKS SIGNED OUT. Somebody
 * arriving from a WhatsApp forward has no context and no account, and a page
 * that asks them to sign in before saying what they are signing in for is an
 * invitation that gets ignored.
 */

const preview = (over: Record<string, unknown> = {}) =>
  http.get(`${BASE}/invites/:token`, () =>
    HttpResponse.json({
      experience: "Try-dive at Nemo Reef",
      experienceSlug: "try-dive-nemo-reef",
      operator: "Sample Dive Operator",
      localDate: "2026-09-22",
      localTime: "07:00",
      status: "confirmed",
      ...over,
    }),
  );

afterEach(() => {
  cleanup();
  __resetAppRouteMocks();
  nav.pushed = [];
});

describe("signed out", () => {
  it("names the trip before asking for anything", async () => {
    server.use(preview());
    renderWithQuery(<InviteLanding token="tok_invite" />);

    expect(
      await screen.findByRole("link", { name: "Try-dive at Nemo Reef" }),
    ).toHaveAttribute("href", "/e/try-dive-nemo-reef");
    expect(screen.getByText("Sample Dive Operator")).toBeInTheDocument();
    // The market's own day, from our tables rather than the runtime's CLDR.
    expect(screen.getByText(/Tue, 22 Sep · 07:00/)).toBeInTheDocument();
    expect(screen.getByText("Going ahead")).toBeInTheDocument();
  });

  it("offers sign-in that comes back here", async () => {
    /*
      Without `next` the traveller lands on Account and has to find their way
      back to an invitation they reached from a message. Same mechanism as the
      Login button in yuvoy-app#56.
    */
    server.use(preview());
    renderWithQuery(<InviteLanding token="tok_invite" />);
    expect(
      await screen.findByRole("link", { name: "Sign in to join" }),
    ).toHaveAttribute("href", "/account?next=/i/tok_invite");
  });

  it("says nothing personal and nothing about money", async () => {
    /*
      The server's own guarantee, asserted here because this page is one
      forward of a group chat. A price or a booker's name on it would be a
      disclosure to everyone in that chat.
    */
    server.use(preview());
    renderWithQuery(<InviteLanding token="tok_invite" />);
    await screen.findByText("Sample Dive Operator");
    expect(document.body.textContent).not.toMatch(/₹/);
    expect(document.body.textContent).not.toMatch(/YV-/);
  });
});

describe("while it is read", () => {
  it("is the route's own first paint, caption and all", () => {
    /*
      It was three shapes: the generic sheet, then a smaller skeleton of
      another shape, then the page, whose caption arrived last (stability
      audit, 6 Oct 2026). The route's fallback and the screen's wait are one
      drawing now, with the caption from the first frame.
    */
    server.use(
      http.get(`${BASE}/invites/:token`, async () => {
        await delay("infinite");
      }),
    );
    const screenWait = renderWithQuery(<InviteLanding token="tok_invite" />);
    expect(
      screen.getByRole("status", { name: "Loading this invitation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("You are invited")).toBeInTheDocument();
    const waiting = screenWait.container.innerHTML;
    cleanup();

    const route = renderWithQuery(<RouteLoading />);
    expect(route.container.innerHTML).toBe(waiting);
  });
});

describe("a link that does not work", () => {
  it("points at the person who sent it, not at us", async () => {
    /*
      404 covers unknown, revoked, declined and finished, and the page must not
      tell them apart either: distinguishing them would confirm that a
      particular invitation once existed.
    */
    server.use(
      http.get(`${BASE}/invites/:token`, () =>
        HttpResponse.json(
          { error: { code: "not_found", message: "No such invitation." } },
          { status: 404 },
        ),
      ),
    );

    renderWithQuery(<InviteLanding token="gone" />);
    expect(
      await screen.findByText("This invitation does not work"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ask the person who invited you to send it again."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    // The screen's caption stays, as it stayed in the wait before this.
    expect(screen.getByText("You are invited")).toBeInTheDocument();
  });

  it("offers a retry when the failure is ours", async () => {
    server.use(
      http.get(`${BASE}/invites/:token`, () =>
        HttpResponse.json(
          { error: { code: "service_unavailable", message: "later" } },
          { status: 503 },
        ),
      ),
    );

    renderWithQuery(<InviteLanding token="tok_invite" />);
    expect(
      await screen.findByText("We could not load this invitation"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});

describe("a trip that is off", () => {
  it("says so and offers nothing to press", async () => {
    for (const status of ["cancelled", "called_off"]) {
      cleanup();
      server.use(preview({ status }));
      renderWithQuery(<InviteLanding token="tok_invite" />);
      expect(
        await screen.findByText("This trip was cancelled."),
        status,
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Join this trip" }),
      ).toBeNull();
      expect(
        screen.queryByRole("link", { name: "Sign in to join" }),
      ).toBeNull();
    }
  });
});

describe("signed in", () => {
  it("joins, and lands on the trip", async () => {
    server.use(
      preview(),
      http.post(`${BASE}/invites/:token/accept`, () =>
        HttpResponse.json({
          id: "inv_joined",
          role: "guest",
          guestState: "joined",
          experience: "Try-dive at Nemo Reef",
          experienceSlug: "try-dive-nemo-reef",
          operator: "Sample Dive Operator",
          localDate: "2026-09-22",
          localTime: "07:00",
          meetingPoint: "Jetty 2",
          durationMinutes: 120,
          partySize: 3,
          status: "confirmed",
          going: [],
        }),
      ),
    );
    __signInAppRouteMock();

    const user = userEvent.setup();
    renderWithQuery(<InviteLanding token="tok_invite" />);
    await user.click(
      await screen.findByRole("button", { name: "Join this trip" }),
    );

    await waitFor(() =>
      expect(nav.pushed).toContain("/trips/invited/inv_joined"),
    );
  });

  it("explains a 409 in words rather than a code", async () => {
    // Two causes, one sentence, because the traveller's next step is the same
    // either way and we do not tell somebody they own a booking they may not.
    server.use(
      preview(),
      http.post(`${BASE}/invites/:token/accept`, () =>
        HttpResponse.json(
          { error: { code: "conflict", message: "raw" } },
          { status: 409 },
        ),
      ),
    );
    __signInAppRouteMock();

    const user = userEvent.setup();
    renderWithQuery(<InviteLanding token="tok_invite" />);
    await user.click(
      await screen.findByRole("button", { name: "Join this trip" }),
    );

    expect(
      await screen.findByText(
        "This trip was cancelled, or it is your own booking.",
      ),
    ).toBeInTheDocument();
  });

  it("asks for a sign-in again when the session turns out to be dead", async () => {
    /*
      A 401 on accept means the cookie expired between loading the page and
      pressing the button, which on a link somebody opens hours later is a
      realistic gap rather than an edge case.
    */
    server.use(
      preview(),
      http.post(`${BASE}/invites/:token/accept`, () =>
        HttpResponse.json(
          { error: { code: "token_expired", message: "gone" } },
          { status: 401 },
        ),
      ),
    );
    __signInAppRouteMock();

    const user = userEvent.setup();
    renderWithQuery(<InviteLanding token="tok_invite" />);
    await user.click(
      await screen.findByRole("button", { name: "Join this trip" }),
    );

    expect(
      await screen.findByRole("link", { name: "Sign in to join" }),
    ).toHaveAttribute("href", "/account?next=/i/tok_invite");
  });
});
