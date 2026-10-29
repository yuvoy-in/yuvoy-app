import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { YourLinks } from "./your-links";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/account",
}));

afterEach(cleanup);

/** One link as the API sends it, with only what a test varies. */
function link(over: Record<string, unknown> = {}) {
  return {
    code: "C-K7QM2XPA",
    link: "https://app.yuvoy.in/go/C-K7QM2XPA",
    target: {
      kind: "experience",
      id: "8d2f6a10-3c4b-4e5f-8a9b-0c1d2e3f4a52",
      slug: "snorkel-elephant-beach",
      title: "Snorkel trip to Elephant Beach",
    },
    createdAt: "2026-10-21T04:00:00Z",
    opens30Days: 4,
    opensTotal: 12,
    bookings: 2,
    lastBookingOn: "2026-10-21",
    ...over,
  };
}

/** `creator` at a stage, and `cohort` on `GET /me` for a stage that needs it. */
function release(stage: "off" | "staff" | "all", cohort: string | null = null) {
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
    http.get(`${BASE}/me`, () =>
      HttpResponse.json({
        phone: "+919000000000",
        name: "Asha Menon",
        email: null,
        interests: [],
        onboardingRequired: false,
        memberSince: null,
        trips: { total: 0, upcoming: 0, completed: 0 },
        reviews: { count: 0 },
        support: { whatsappE164: null, hours: "" },
        cohort,
      }),
    ),
  );
}

/** Answers the list, and counts how often it was asked. */
function serveLinks(answer: () => Response | Promise<Response>) {
  const asked = { count: 0 };
  server.use(
    http.get(`${BASE}/me/creator-links`, async () => {
      asked.count += 1;
      return answer();
    }),
  );
  return asked;
}

const items = (list: Record<string, unknown>[]) => () =>
  HttpResponse.json({ items: list });

function show(toolsOn = true) {
  __signInAppRouteMock("sess_test");
  return renderWithQuery(<YourLinks toolsOn={toolsOn} />);
}

const section = () => screen.findByRole("region", { name: "Your links" });

/** Lets every pending read land, for a test that asserts an absence. */
const settle = () => new Promise((r) => setTimeout(r, 80));

/**
 * "Your links" on Account (yuvoy-app#207; cases from yuvoy-mobile#389).
 *
 * Counts only, and only while the `creator` release is open to the reader.
 */
describe("your links", () => {
  it("lists each link with its counts and its latest booking, in the API's order", async () => {
    release("all");
    serveLinks(
      items([
        link(),
        link({
          code: "C-SECOND22",
          link: "https://app.yuvoy.in/go/C-SECOND22",
          target: {
            kind: "event",
            id: "3a1e6a10-3c4b-4e5f-8a9b-0c1d2e3f4a52",
            title: "Sunset music on the beach",
          },
          opens30Days: 1,
          opensTotal: 1,
          bookings: 0,
          lastBookingOn: undefined,
        }),
      ]),
    );
    show();

    const region = await section();
    expect(
      within(region).getByRole("heading", { name: "Your links" }),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(
        "Share a link to something you went on. We count opens and bookings through it. The counts are indicative. Yuvoy does not pay for links yet.",
      ),
    ).toBeInTheDocument();

    const rows = await within(region).findAllByTestId("creator-link");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Snorkel trip to Elephant Beach");
    expect(
      within(rows[0]).getByText(
        "4 opens in the last 30 days · 12 in all · 2 bookings",
      ),
    ).toBeInTheDocument();
    expect(
      within(rows[0]).getByText("Latest booking 21 Oct"),
    ).toBeInTheDocument();

    // No bookings, no line for the latest one.
    expect(rows[1]).toHaveTextContent("Sunset music on the beach");
    expect(
      within(rows[1]).getByText(
        "1 opens in the last 30 days · 1 in all · 0 bookings",
      ),
    ).toBeInTheDocument();
    expect(within(rows[1]).queryByText(/Latest booking/)).toBeNull();

    for (const row of rows) {
      expect(
        within(row).getByRole("button", { name: "Copy link" }),
      ).toBeInTheDocument();
      expect(
        within(row).getByRole("button", { name: "Share" }),
      ).toBeInTheDocument();
    }
  });

  it("keeps a link whose listing is no longer listed, with its counts", async () => {
    // Case 12: the read does not filter on listing state, and nor does this.
    release("all");
    serveLinks(items([link({ bookings: 5, opensTotal: 40 })]));
    show();
    const region = await section();
    expect(
      await within(region).findByText(
        "4 opens in the last 30 days · 40 in all · 5 bookings",
      ),
    ).toBeInTheDocument();
  });

  it("says how to get one when there are none, with the tools on", async () => {
    release("all");
    serveLinks(items([]));
    show(true);
    const region = await section();
    expect(
      await within(region).findByText(
        "No links yet. Get one from a trip you went on.",
      ),
    ).toBeInTheDocument();
  });

  it("is not drawn with the tools off and no links", async () => {
    // Case 11.
    release("all");
    const asked = serveLinks(items([]));
    show(false);
    await waitFor(() => expect(asked.count).toBe(1));
    await settle();
    expect(screen.queryByRole("region", { name: "Your links" })).toBeNull();
  });

  it("is drawn with the tools off when there is a link made on the phone", async () => {
    release("all");
    serveLinks(items([link()]));
    show(false);
    const region = await section();
    expect(
      await within(region).findByText("Snorkel trip to Elephant Beach"),
    ).toBeInTheDocument();
  });

  it("asks nothing and draws nothing while the release is off", async () => {
    release("off");
    const asked = serveLinks(items([link()]));
    show();
    await settle();
    expect(asked.count).toBe(0);
    expect(screen.queryByRole("region", { name: "Your links" })).toBeNull();
  });

  it("asks nothing for somebody outside a staff release", async () => {
    release("staff", null);
    const asked = serveLinks(items([link()]));
    show();
    await settle();
    expect(asked.count).toBe(0);
    expect(screen.queryByRole("region", { name: "Your links" })).toBeNull();
  });

  it("opens for staff at a staff release", async () => {
    release("staff", "staff");
    serveLinks(items([link()]));
    show();
    expect(await section()).toBeInTheDocument();
  });

  it("hides itself when the API says the release is closed to them", async () => {
    // Case 8: the config and the API can disagree for a few minutes.
    release("all");
    const asked = serveLinks(() =>
      HttpResponse.json(
        {
          error: {
            code: "not_found",
            message: "We could not find your links.",
          },
        },
        { status: 404 },
      ),
    );
    show();
    await waitFor(() => expect(asked.count).toBeGreaterThan(0));
    await settle();
    expect(screen.queryByRole("region", { name: "Your links" })).toBeNull();
    expect(screen.queryByText("We could not find your links.")).toBeNull();
  });

  it("shows a wait while the list is out", async () => {
    release("all");
    serveLinks(async () => {
      await delay("infinite");
      return HttpResponse.json({ items: [] });
    });
    show();
    const region = await section();
    expect(
      await within(region).findByRole("status", { name: "Loading your links" }),
    ).toBeInTheDocument();
  });

  it("says a failed read plainly and reads again on Try again", async () => {
    release("all");
    let fail = true;
    serveLinks(() =>
      fail
        ? HttpResponse.json(
            {
              error: {
                code: "internal_error",
                message: "Something went wrong.",
              },
            },
            { status: 500 },
          )
        : HttpResponse.json({ items: [link()] }),
    );
    const user = userEvent.setup();
    show();

    /*
      A 500 is retried by the client wrapper before it is an answer, with a
      backoff of up to about a second in all, so the wait here is longer.
    */
    const region = await screen.findByRole(
      "region",
      { name: "Your links" },
      { timeout: 3000 },
    );
    const alert = await within(region).findByRole(
      "alert",
      {},
      { timeout: 3000 },
    );
    expect(alert).toHaveTextContent("Your links did not load");

    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(
      await within(region).findByText("Snorkel trip to Elephant Beach"),
    ).toBeInTheDocument();
    expect(within(region).queryByRole("alert")).toBeNull();
  });

  it("reads the list again every time it opens, never from a cache", async () => {
    release("all");
    const asked = serveLinks(items([link()]));
    // One client throughout, so a cached answer would be there to reuse.
    const view = show();
    await within(await section()).findByText("Snorkel trip to Elephant Beach");
    view.rerender(<p>Elsewhere</p>);
    expect(screen.queryByRole("region", { name: "Your links" })).toBeNull();

    view.rerender(<YourLinks toolsOn />);
    await within(await section()).findByText("Snorkel trip to Elephant Beach");
    await waitFor(() => expect(asked.count).toBe(2));
  });

  it("shows no amount, no earning and no other person anywhere", async () => {
    // Case 13.
    release("all");
    serveLinks(items([link()]));
    show();
    const region = await section();
    await within(region).findByText("Snorkel trip to Elephant Beach");
    expect(region.textContent).not.toMatch(
      /₹|INR|\brs\.?\s?\d|earn|commission|payout|booked by/i,
    );
    // The one date is the day of the latest booking.
    expect(region.textContent).not.toMatch(/2026|\d{1,2}:\d{2}/);
    // And the address itself is a thing to copy, not text on the screen.
    expect(region.textContent).not.toContain("/go/");
  });
});
