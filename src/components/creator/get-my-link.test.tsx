import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { tripTitleId, type ServerTrip } from "@/lib/trips/tabs";
import { useRelease } from "@/lib/site/use-release";
import { GetMyLink, mayGetLink } from "./get-my-link";
import { YourLinks } from "./your-links";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/trips",
}));

afterEach(cleanup);

const EXPERIENCE_ID = "8d2f6a10-3c4b-4e5f-8a9b-0c1d2e3f4a52";

/** A past trip as `GET /me/bookings?tab=past` sends it. */
function trip(over: Partial<ServerTrip> = {}): ServerTrip {
  return {
    reference: "YV-PAST1111",
    reservationId: "res_past",
    experience: "Snorkel trip to Elephant Beach",
    operator: "Sample Boat Operator",
    localDate: "2026-10-02",
    localTime: "09:00",
    state: "completed",
    guests: 2,
    statusToken: "tok_past",
    experienceSlug: "snorkel-elephant-beach",
    operatorSlug: "sample-boat-operator",
    heroImageUrl: null,
    destination: "Havelock",
    startsAt: "2026-10-02T03:30:00Z",
    timezone: "Asia/Kolkata",
    createdAt: "2026-09-14T06:00:00Z",
    price: { totalPaise: 900000, currency: "INR" },
    reviewed: false,
    canReview: false,
    unreadCount: 0,
    ...over,
  };
}

const LINK = {
  code: "C-K7QM2XPA",
  link: "https://app.yuvoy.in/go/C-K7QM2XPA",
  target: {
    kind: "experience",
    id: EXPERIENCE_ID,
    slug: "snorkel-elephant-beach",
    title: "Snorkel trip to Elephant Beach",
  },
  createdAt: "2026-10-21T04:00:00Z",
  opens30Days: 0,
  opensTotal: 0,
  bookings: 0,
};

/** `creator` at a stage everybody sees, or off. */
function release(stage: "off" | "all") {
  server.use(
    http.get(`${BASE}/app-config`, () =>
      HttpResponse.json({
        minimumVersion: { ios: "0.0.0", android: "0.0.0" },
        features: { payments: "coming_soon", inviteOnly: false },
        support: { whatsappE164: null, hours: "" },
        deliveryHost: null,
        releases: { creator: stage },
      }),
    ),
  );
}

/** The listing the trip names, read for its id. */
function serveListing() {
  const asked: string[] = [];
  server.use(
    http.get(`${BASE}/experiences/:slug`, ({ params }) => {
      asked.push(String(params.slug));
      return HttpResponse.json({
        id: EXPERIENCE_ID,
        slug: params.slug,
        title: "Snorkel trip to Elephant Beach",
      });
    }),
  );
  return asked;
}

/** Answers the write in turn, and records every body it was sent. */
function serveWrite(...answers: (() => Response)[]) {
  const bodies: unknown[] = [];
  let at = 0;
  server.use(
    http.post(`${BASE}/me/creator-links`, async ({ request }) => {
      bodies.push(await request.json());
      const answer = answers[Math.min(at, answers.length - 1)];
      at += 1;
      return answer();
    }),
  );
  return bodies;
}

const refused = (status: number, code: string, message: string) => () =>
  HttpResponse.json({ error: { code, message } }, { status });

function show(over: Partial<ServerTrip> = {}) {
  __signInAppRouteMock("sess_test");
  return renderWithQuery(<GetMyLink trip={trip(over)} />);
}

const button = () => screen.findByRole("button", { name: "Get my link" });

/** The creator release as the button reads it, once it is known. */
function ReleaseProbe() {
  const release = useRelease("creator");
  return (
    <p data-testid="release">
      {release.stage} {release.pending ? "pending" : "known"}
    </p>
  );
}

/** Past trips the API's check refuses: only a completed one counts. */
const NOT_COMPLETED = [
  "confirmed",
  "paid_pending_ops",
  "cancelled",
  "declined",
  "no_show",
] as const;

/**
 * "Get my link" on a past trip (yuvoy-app#207; cases from yuvoy-mobile#389).
 */
describe("get my link", () => {
  it("reads the listing for its id, sends it, and shows the new link", async () => {
    // Case 1, first half: 201.
    release("all");
    const listings = serveListing();
    const bodies = serveWrite(() => HttpResponse.json(LINK, { status: 201 }));
    const user = userEvent.setup();
    show();

    await user.click(await button());
    expect(
      await screen.findByText(
        "Your link is ready. It is in Your links on Account too.",
      ),
    ).toBeInTheDocument();
    expect(listings).toEqual(["snorkel-elephant-beach"]);
    expect(bodies).toEqual([{ experienceId: EXPERIENCE_ID }]);
    expect(
      screen.getByRole("button", { name: "Copy link" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get my link" })).toBeNull();
  });

  it("says so in a live region that was there all along, and focuses Copy link", async () => {
    /*
      The button that had the focus is replaced, so the focus moves to Copy
      link rather than falling to the page, and the sentence is written into
      a status region mounted before the tap: one that arrives already
      holding its words may never be read out.
    */
    release("all");
    serveListing();
    serveWrite(() => HttpResponse.json(LINK, { status: 201 }));
    const user = userEvent.setup();
    show();

    const tap = await button();
    const status = screen.getByTestId("get-my-link-status");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveTextContent("");

    await user.click(tap);
    const copy = await screen.findByRole("button", { name: "Copy link" });
    await waitFor(() => expect(copy).toHaveFocus());
    expect(screen.getByTestId("get-my-link-status")).toBe(status);
    expect(status).toHaveTextContent(
      "Your link is ready. It is in Your links on Account too.",
    );
  });

  it("describes every button by the trip it is for", async () => {
    // The names stay as they are; the trip's title is the description.
    release("all");
    serveListing();
    serveWrite(() => HttpResponse.json(LINK, { status: 201 }));
    const user = userEvent.setup();
    __signInAppRouteMock("sess_test");
    const past = trip();
    renderWithQuery(
      <>
        <p id={tripTitleId(past)}>{past.experience}</p>
        <GetMyLink trip={past} />
      </>,
    );

    const tap = await button();
    expect(tap).toHaveAccessibleDescription("Snorkel trip to Elephant Beach");
    await user.click(tap);
    for (const name of ["Copy link", "Share"]) {
      expect(
        await screen.findByRole("button", { name }),
      ).toHaveAccessibleDescription("Snorkel trip to Elephant Beach");
    }
  });

  it("says it is the one they already had on a 200", async () => {
    // Case 1, second half.
    release("all");
    serveListing();
    serveWrite(() => HttpResponse.json(LINK, { status: 200 }));
    const user = userEvent.setup();
    show();

    await user.click(await button());
    expect(
      await screen.findByText(
        "You already have this link. It is in Your links on Account.",
      ),
    ).toBeInTheDocument();
  });

  it("puts the link into Your links when both are on screen", async () => {
    release("all");
    serveListing();
    serveWrite(() => HttpResponse.json(LINK, { status: 201 }));
    server.use(
      http.get(`${BASE}/me/creator-links`, () =>
        HttpResponse.json({ items: [] }),
      ),
    );
    const user = userEvent.setup();
    __signInAppRouteMock("sess_test");
    renderWithQuery(
      <>
        <YourLinks toolsOn />
        <GetMyLink trip={trip()} />
      </>,
    );

    const region = await screen.findByRole("region", { name: "Your links" });
    await within(region).findByText(
      "No links yet. Get one from a trip you went on.",
    );
    await user.click(await button());
    const row = await within(region).findByTestId("creator-link");
    expect(row).toHaveTextContent("Snorkel trip to Elephant Beach");
    expect(row).toHaveTextContent(
      "0 opens in the last 30 days · 0 in all · 0 bookings",
    );
  });

  it.each([
    // Case 6.
    [
      403,
      "not_went",
      "You can get a link only to something you went on, once it is over.",
    ],
    // Case 7.
    [403, "not_open_yet", "You can get a link once the event is over."],
    // Case 10.
    [
      429,
      "rate_limited",
      "You have made 20 links today. You can make more tomorrow.",
    ],
    [503, "unavailable", "Links cannot be made on this service right now."],
  ])(
    "shows the API's own sentence for a %i %s",
    async (status, code, message) => {
      release("all");
      serveListing();
      serveWrite(refused(status, code, message));
      const user = userEvent.setup();
      show();

      await user.click(await button());
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      // And the button is still there, to try again from.
      expect(await button()).toBeInTheDocument();
    },
  );

  it("gives the sign-in answer for a 401, and a way back in", async () => {
    release("all");
    serveListing();
    serveWrite(
      refused(
        401,
        "unauthorized",
        "Sign in with your WhatsApp number to see your trips.",
      ),
    );
    const user = userEvent.setup();
    show();

    await user.click(await button());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Your sign-in has expired");
    expect(
      within(alert).getByRole("link", { name: "Sign in again" }),
    ).toHaveAttribute("href", "/account?next=/trips");
  });

  it("tries again after a refusal and shows the link", async () => {
    release("all");
    serveListing();
    serveWrite(
      refused(
        503,
        "unavailable",
        "Links cannot be made on this service right now.",
      ),
      () => HttpResponse.json(LINK, { status: 201 }),
    );
    const user = userEvent.setup();
    show();

    await user.click(await button());
    await screen.findByRole("alert");
    await user.click(await button());
    expect(
      await screen.findByRole("button", { name: "Copy link" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("is not drawn while the release is off", async () => {
    release("off");
    __signInAppRouteMock("sess_test");
    renderWithQuery(
      <>
        <ReleaseProbe />
        <GetMyLink trip={trip()} />
      </>,
    );
    // The same read the button waits on has answered, and it says off.
    await waitFor(() =>
      expect(screen.getByTestId("release")).toHaveTextContent("off known"),
    );
    expect(screen.queryByRole("button", { name: "Get my link" })).toBeNull();
  });

  it.each(NOT_COMPLETED)("is not drawn on a %s trip", async (state) => {
    release("all");
    __signInAppRouteMock("sess_test");
    /*
      Beside a completed trip, whose button proves the release has been
      read as open: the absence is then this trip's own.
    */
    renderWithQuery(
      <>
        <div data-testid="went">
          <GetMyLink trip={trip({ reservationId: "res_went" })} />
        </div>
        <div data-testid="not-went">
          <GetMyLink trip={trip({ reservationId: "res_not", state })} />
        </div>
      </>,
    );
    expect(
      await within(screen.getByTestId("went")).findByRole("button", {
        name: "Get my link",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("not-went")).queryByRole("button", {
        name: "Get my link",
      }),
    ).toBeNull();
  });
});

describe("which past trips may ask", () => {
  it("is a completed trip, and no other", () => {
    expect(mayGetLink({ state: "completed" })).toBe(true);
    expect(mayGetLink({ state: "confirmed" })).toBe(false);
    expect(mayGetLink({ state: "paid_pending_ops" })).toBe(false);
    expect(mayGetLink({ state: "no_show" })).toBe(false);
    expect(mayGetLink({ state: "cancelled" })).toBe(false);
    expect(mayGetLink({ state: "declined" })).toBe(false);
    expect(mayGetLink({ state: "pending_request" })).toBe(false);
    expect(mayGetLink({ state: "holding" })).toBe(false);
  });
});
