import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { server } from "../../../mocks/server";
import { foundWords } from "@/lib/found/found-words";
import {
  FOUND_PAGE_WORDS,
  FoundItemPage,
  alsoListedOn,
  endTimeMissing,
  type FoundItemDetail,
} from "./found-item-page";

/**
 * A found card's page, `/f/{id}` (yuvoy-app#179).
 *
 * Two halves: the page itself, given a card, and the route that reads the
 * card and decides what an answer becomes (a merged id moves, a 404 is the
 * not-found page, the robots tag follows `indexable`). The words that are
 * the card's own (when, where, the status tags) come from `found-words.ts`
 * and are asserted through it, so a copy edit there does not fail here.
 *
 * The trust line and the department picture are stood in for: they have
 * their own tests, and what matters on this page is that they are there and
 * that the sentence under the trust line is the API's.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("@/components/found/trust-line", () => ({
  TrustLine: ({ check }: { check: { label: string } }) => (
    <p data-testid="trust-line">{check.label}</p>
  ),
}));
vi.mock("@/components/found/department-art", () => ({
  DepartmentArt: () => <div data-testid="department-art" />,
}));
vi.mock("@/lib/found/device-store", () => ({
  hideCard: vi.fn(async () => {}),
  hiddenCardIds: vi.fn(async () => new Set()),
  leaveNoticeOff: vi.fn(async () => false),
  setLeaveNoticeOff: vi.fn(async () => {}),
  HIDDEN_CARDS_CHANGED: "yv:hidden-cards-changed",
}));

const outcomes = vi.hoisted(() => ({ recorded: [] as unknown[][] }));
vi.mock("@/lib/found/found-outcomes", () => ({
  recordFound: vi.fn((...args: unknown[]) => {
    outcomes.recorded.push(args);
  }),
}));

const nav = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, replace: () => {}, push: () => {} }),
  usePathname: () => "/f/x",
  useSearchParams: () => new URLSearchParams(),
  redirect: nav.redirect,
  notFound: nav.notFound,
}));
vi.mock("@/components/chrome/screen", () => ({
  Screen: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

beforeEach(() => {
  outcomes.recorded = [];
  nav.redirect.mockClear();
  nav.notFound.mockClear();
  server.use(
    http.get(`${BASE}/catalog/vocabulary`, () =>
      HttpResponse.json({
        categories: [{ key: "food_drink", label: "Food and drink" }],
        activityTypes: [],
      }),
    ),
  );
});

const ID = "0f6d2a52-6a77-4c39-9a52-6b1c3a8e2f10";

function card(over: Partial<FoundItemDetail> = {}): FoundItemDetail {
  return {
    id: ID,
    kind: "event",
    department: "food_drink",
    title: "Filter coffee walk in Basavanagudi",
    when: {
      startsOn: "2026-11-07",
      startTime: "07:30",
      endsOn: null,
      repeats: null,
    },
    where: { placeText: "Vidyarthi Bhavan", town: "Bengaluru" },
    price: {
      kind: "paid",
      from: { amountMinor: 50000, currency: "INR" },
      text: "From ₹500",
    },
    status: "scheduled",
    check: {
      tier: "staff_checked",
      label: "Checked by Yuvoy · 16 Oct",
      checkedAt: "2026-10-16T09:00:00Z",
      lapsed: false,
      sentence:
        "A person at Yuvoy checked the date, time, place and price on walks.example.in on Thu, 16 Oct.",
      sourceName: "walks.example.in",
      sourceUrl: "https://walks.example.in/coffee",
    },
    seeDetailsUrl: "https://www.walks.example.in/coffee?ref=list",
    place: {
      key: "karnataka/bengaluru",
      name: "Bengaluru",
      regionName: "Karnataka",
      kind: "local",
      timezone: "Asia/Kolkata",
    },
    summary: "A slow morning through three of the old coffee rooms.",
    organiser: "Old Bengaluru Walks",
    sources: [
      { name: "walks.example.in", url: "https://walks.example.in/coffee" },
      { name: "Insider", url: "https://insider.example.com/e/123" },
      { name: "Insider again", url: "https://www.insider.example.com/e/123" },
      { name: "Town board", url: "https://board.example.org:8443/x" },
    ],
    indexable: false,
    stated: {
      endTime: null,
      setting: null,
      suits: [],
      difficulty: null,
      venueType: null,
      included: null,
      goodToKnow: null,
    },
    ...over,
  };
}

describe("the page", () => {
  it("says the card's facts, from the API and its own words", async () => {
    const item = card();
    renderWithQuery(<FoundItemPage item={item} signedIn={false} />);

    expect(
      screen.getByRole("heading", { level: 1, name: item.title }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("trust-line")).toHaveTextContent(
      item.check.label,
    );
    expect(screen.getByTestId("found-when")).toHaveTextContent(
      foundWords.whenLine(item, item.place.timezone) as string,
    );
    expect(screen.getByTestId("found-where")).toHaveTextContent(
      foundWords.whereLine(item) as string,
    );
    expect(screen.getByTestId("found-price")).toHaveTextContent("From ₹500");
    expect(screen.getByTestId("found-summary")).toHaveTextContent(
      item.summary!,
    );
    expect(screen.getByTestId("found-organiser")).toHaveTextContent(
      "Old Bengaluru Walks",
    );
    expect(await screen.findByTestId("found-department")).toHaveTextContent(
      "Food and drink",
    );
    expect(screen.getByTestId("department-art")).toBeInTheDocument();
  });

  it("says who sells the tickets on a paid card only", () => {
    renderWithQuery(<FoundItemPage item={card()} signedIn={false} />);
    expect(screen.getByText(FOUND_PAGE_WORDS.soldBy)).toBeInTheDocument();
  });

  it("says nothing about tickets on a free card, or one with no price", () => {
    for (const kind of ["free", "unknown"] as const) {
      const { unmount } = renderWithQuery(
        <FoundItemPage
          item={card({ price: { kind, from: null, text: "Free" } })}
          signedIn={false}
        />,
      );
      expect(screen.queryByText(FOUND_PAGE_WORDS.soldBy), kind).toBeNull();
      unmount();
    }
  });

  it("shows the API's check sentence verbatim, and composes none", () => {
    const { unmount } = renderWithQuery(
      <FoundItemPage item={card()} signedIn={false} />,
    );
    expect(screen.getByTestId("found-sentence")).toHaveTextContent(
      "A person at Yuvoy checked the date, time, place and price on walks.example.in on Thu, 16 Oct.",
    );
    unmount();

    // Absent: nothing, not a sentence of the web's own (R2-T4 note, 6.4).
    const found = card({
      check: {
        tier: "found",
        label: "Found by Trigo · not checked yet",
        checkedAt: null,
        lapsed: false,
        sentence: null,
        sourceName: "walks.example.in",
        sourceUrl: "https://walks.example.in/coffee",
      },
    });
    renderWithQuery(<FoundItemPage item={found} signedIn={false} />);
    expect(screen.queryByTestId("found-sentence")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Trigo found this on/);
    expect(document.body.textContent).not.toMatch(/Nobody at Yuvoy has/);
  });

  it("shows the summary only when there is one", () => {
    renderWithQuery(
      <FoundItemPage item={card({ summary: null })} signedIn={false} />,
    );
    expect(screen.queryByTestId("found-summary")).toBeNull();
  });

  it("says the end time is not listed on a one-day card whose page gives none", () => {
    expect(endTimeMissing(card())).toBe(true);
    // Over several days it ends on its last day.
    expect(
      endTimeMissing(
        card({
          when: {
            startsOn: "2026-11-07",
            startTime: null,
            endsOn: "2026-11-09",
            repeats: null,
          },
        }),
      ),
    ).toBe(false);
    // Undated already says to check the page.
    expect(
      endTimeMissing(
        card({
          when: {
            startsOn: null,
            startTime: null,
            endsOn: null,
            repeats: null,
          },
        }),
      ),
    ).toBe(false);
    // The page states one.
    expect(
      endTimeMissing(card({ stated: { ...card().stated, endTime: "10:00" } })),
    ).toBe(false);

    renderWithQuery(<FoundItemPage item={card()} signedIn={false} />);
    expect(screen.getByTestId("found-when")).toHaveTextContent(
      FOUND_PAGE_WORDS.noEndTime,
    );
  });

  it("lists the other pages by host, once each, leaving out the ones already named", () => {
    expect(alsoListedOn(card())).toEqual([
      "insider.example.com",
      "board.example.org",
    ]);
    renderWithQuery(<FoundItemPage item={card()} signedIn={false} />);
    expect(screen.getByTestId("found-also")).toHaveTextContent(
      "Also listed on insider.example.com, board.example.org",
    );
  });

  it("draws no Also listed line when there is nothing else", () => {
    renderWithQuery(
      <FoundItemPage item={card({ sources: [] })} signedIn={false} />,
    );
    expect(screen.queryByTestId("found-also")).toBeNull();
  });

  it("says an ended card has ended, in a banner and not a tag as well", () => {
    renderWithQuery(
      <FoundItemPage item={card({ status: "ended" })} signedIn={false} />,
    );
    expect(screen.getByTestId("found-ended")).toHaveTextContent(
      "This has ended.",
    );
    expect(screen.queryByTestId("found-status")).toBeNull();
  });

  it("tags any other status the card's way, and scheduled not at all", () => {
    const { unmount } = renderWithQuery(
      <FoundItemPage item={card({ status: "cancelled" })} signedIn={false} />,
    );
    expect(screen.getByTestId("found-status")).toHaveTextContent(
      foundWords.statusTag("cancelled") as string,
    );
    expect(screen.queryByTestId("found-ended")).toBeNull();
    unmount();

    renderWithQuery(<FoundItemPage item={card()} signedIn={false} />);
    expect(screen.queryByTestId("found-status")).toBeNull();
  });

  it("has no Trigo button", () => {
    renderWithQuery(<FoundItemPage item={card()} signedIn={false} />);
    expect(screen.queryByRole("button", { name: /trigo/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /trigo/i })).toBeNull();
  });

  it("offers See details, saying where it opens, and Report a problem", () => {
    renderWithQuery(<FoundItemPage item={card()} signedIn={false} />);
    const link = screen.getByRole("link", { name: "See details" });
    // Exactly as stored: nothing added, the `www.` and the query kept.
    expect(link).toHaveAttribute(
      "href",
      "https://www.walks.example.in/coffee?ref=list",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener");
    expect(screen.getByText("Opens walks.example.in")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Report a problem" }),
    ).toBeInTheDocument();
  });

  it("counts opened once, on the card page", () => {
    const item = card();
    const { rerender } = renderWithQuery(
      <FoundItemPage item={item} signedIn={false} />,
    );
    rerender(<FoundItemPage item={item} signedIn={false} />);
    expect(outcomes.recorded).toEqual([["opened", ID, "found_detail"]]);
  });
});

/* ---------------------------------------------------------------- route */

type PageArgs = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const args = (id: string): PageArgs => ({
  params: Promise.resolve({ id }),
  searchParams: Promise.resolve({}),
});

function serveCard(answer: () => Response) {
  const asked: { id: string; auth: string | null }[] = [];
  server.use(
    http.get(`${BASE}/events/:id`, ({ params, request }) => {
      asked.push({
        id: String(params.id),
        auth: request.headers.get("authorization"),
      });
      return answer();
    }),
  );
  return asked;
}

async function route() {
  const mod = await import("@/app/f/[id]/page");
  return { page: mod.default, metadata: mod.generateMetadata };
}

describe("the route", () => {
  it("opens signed out, with no credential at all", async () => {
    const asked = serveCard(() => HttpResponse.json(card()));
    const { page } = await route();

    renderWithQuery(await page(args(ID)));

    expect(
      screen.getByRole("heading", { level: 1, name: card().title }),
    ).toBeInTheDocument();
    expect(asked[0]).toEqual({ id: ID, auth: null });
  });

  it("moves a merged card's link to the card it was merged into", async () => {
    const survivor = "9d1f0e3b-2c4a-4b5d-8e6f-7a8b9c0d1e2f";
    serveCard(() => HttpResponse.json(card({ id: survivor })));
    const { page } = await route();

    await expect(page(args(ID))).rejects.toThrow(`REDIRECT /f/${survivor}`);
    expect(nav.redirect).toHaveBeenCalledWith(`/f/${survivor}`);
  });

  it("answers a 404 with the not-found page", async () => {
    serveCard(() =>
      HttpResponse.json(
        { error: { code: "not_found", message: "not found" } },
        { status: 404 },
      ),
    );
    const { page } = await route();

    await expect(page(args(ID))).rejects.toThrow("NOT_FOUND");
    expect(nav.notFound).toHaveBeenCalled();
  });

  it("answers an outage with Try again, never the not-found page", async () => {
    serveCard(() =>
      HttpResponse.json(
        { error: { code: "unavailable", message: "down" } },
        { status: 503 },
      ),
    );
    const { page } = await route();

    renderWithQuery(await page(args(ID)));
    expect(nav.notFound).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeVisible();
  });

  it("is noindex unless the API calls the card indexable, with an Event only then", async () => {
    serveCard(() => HttpResponse.json(card({ indexable: false })));
    let { page, metadata } = await route();

    const closed = await metadata(args(ID));
    expect(closed.robots).toEqual({ index: false, follow: false });
    expect(closed.title).toEqual({
      absolute: "Filter coffee walk in Basavanagudi, Bengaluru | Yuvoy",
    });
    const { unmount } = renderWithQuery(await page(args(ID)));
    expect(eventNodes()).toEqual([]);
    unmount();

    serveCard(() => HttpResponse.json(card({ indexable: true })));
    ({ page, metadata } = await route());
    const open = await metadata(args(ID));
    expect(open.robots).toBeUndefined();

    renderWithQuery(await page(args(ID)));
    const [event] = eventNodes();
    expect(event).toMatchObject({
      "@type": "Event",
      name: "Filter coffee walk in Basavanagudi",
      // The place's own clock, with its offset written on (Q7).
      startDate: "2026-11-07T07:30:00+05:30",
      eventStatus: "https://schema.org/EventScheduled",
      organizer: { "@type": "Organization", name: "Old Bengaluru Walks" },
    });
    expect(event).not.toHaveProperty("endDate");
    // No price and no offer: Yuvoy does not sell these tickets.
    expect(JSON.stringify(event)).not.toMatch(/"offers"|"price"/);
  });

  it("gives an undated card no Event, indexable or not", async () => {
    serveCard(() =>
      HttpResponse.json(
        card({
          indexable: true,
          when: {
            startsOn: null,
            startTime: null,
            endsOn: null,
            repeats: null,
          },
        }),
      ),
    );
    const { page } = await route();
    renderWithQuery(await page(args(ID)));
    expect(eventNodes()).toEqual([]);
  });
});

/** The Event nodes in the JSON-LD on the page. */
function eventNodes(): Record<string, unknown>[] {
  return [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((s) => JSON.parse(s.textContent ?? "{}") as Record<string, unknown>)
    .filter((node) => node["@type"] === "Event");
}
