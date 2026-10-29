import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { TableScreen } from "./table-screen";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import {
  FIXTURE_NOW,
  TABLE_DAY_OF_CONTACT,
  TABLE_ID,
  TABLE_VENUE,
  TABLE_VIEW,
} from "../../../mocks/fixtures";
import type { TableView } from "@/lib/tables/use-table";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/tables/${TABLE_ID}`,
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * One table, where every table email links (yuvoy-app#194).
 *
 * Much of this asserts absence, and that is the point: a forwarded letter
 * shows a stranger nothing, the venue and the day's number are an approved
 * guest's alone, and the names are the server's to give. Each answer is the
 * fixture moved one way, as the API would send it.
 */

/** `GET /tables/{id}` answering this table, or this status. */
function answer(over: Partial<TableView> = {}, drop: (keyof TableView)[] = []) {
  return http.get(`${BASE}/tables/:id`, () => {
    const view: Record<string, unknown> = { ...TABLE_VIEW, ...over };
    for (const key of drop) delete view[key];
    return HttpResponse.json(view);
  });
}

function refuse(status: number, code: string, message = "No.") {
  return http.get(`${BASE}/tables/:id`, () =>
    HttpResponse.json(
      { error: { code, message, requestId: "01JTEST" } },
      { status },
    ),
  );
}

function signedIn(...handlers: Parameters<typeof server.use>) {
  server.use(...handlers);
  __signInAppRouteMock();
  return renderWithQuery(<TableScreen id={TABLE_ID} />);
}

beforeEach(() => {
  // The fixture's own morning, two days before the table.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXTURE_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  server.events.removeAllListeners();
  cleanup();
});

describe("signed out", () => {
  it("asks for the account that asked to join, and comes back here", async () => {
    renderWithQuery(<TableScreen id={TABLE_ID} />);

    expect(
      await screen.findByRole("heading", { name: "Sign in to see this table" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/account?next=/tables/${TABLE_ID}`,
    );
  });

  it("reads nothing about the table, and shows nothing of it", async () => {
    /*
      The link builder's own rule: the id alone opens nothing. A forwarded
      letter must not tell a stranger the title, the time or the area.
    */
    const asked: string[] = [];
    server.events.on("request:start", ({ request }) => {
      asked.push(request.url);
    });
    renderWithQuery(<TableScreen id={TABLE_ID} />);

    await screen.findByRole("heading", { name: "Sign in to see this table" });
    expect(asked.some((u) => u.includes("/tables/"))).toBe(false);
    expect(document.body.textContent).not.toContain(TABLE_VIEW.title);
    expect(document.body.textContent).not.toContain(TABLE_VIEW.venueArea);
  });

  it("falls to the sign-in branch when the session ended elsewhere", async () => {
    // The proxy drops the cookie on a 401; the session read then says so.
    signedIn(refuse(401, "unauthorized", "Sign in first."));
    expect(
      await screen.findByRole("heading", { name: "Sign in to see this table" }),
    ).toBeInTheDocument();
  });
});

describe("not found", () => {
  it("says the same words whatever the 404 was for", async () => {
    signedIn(refuse(404, "not_found", "This table is no longer listed."));
    expect(
      await screen.findByText("We can't show this table"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "It may have ended, or it is on another account. Sign in with the account that asked to join.",
      ),
    ).toBeInTheDocument();
    // The state's own button, not the screen's Back of the same name.
    const state = screen.getByText("We can't show this table").parentElement!;
    expect(
      within(state).getByRole("link", { name: "Back to the feed" }),
    ).toHaveAttribute("href", "/");
  });

  it("says them for an id that is not a table's", async () => {
    // The mock's own answer, as the API's store gives a non-UUID: a 404.
    __signInAppRouteMock();
    renderWithQuery(<TableScreen id="not-a-table" />);
    expect(
      await screen.findByText("We can't show this table"),
    ).toBeInTheDocument();
    // Never the API's sentence, which would say the table once existed.
    expect(screen.queryByText(/no longer listed/)).toBeNull();
  });
});

describe("paused", () => {
  it("is its own state, with Try again and a way to report", async () => {
    signedIn(
      refuse(
        503,
        "tables_unavailable",
        "Tables are paused for now. Try again later.",
      ),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Tables are paused right now",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Nothing is lost. Your requests and seats come back as they were when we open tables again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Report a problem" }),
    ).toBeInTheDocument();
    // Not the general failure.
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });

  it("reads the table again on Try again", async () => {
    let reads = 0;
    server.use(
      http.get(`${BASE}/tables/:id`, () => {
        reads += 1;
        return reads === 1
          ? HttpResponse.json(
              { error: { code: "tables_unavailable", message: "Paused." } },
              { status: 503 },
            )
          : HttpResponse.json(TABLE_VIEW);
      }),
    );
    __signInAppRouteMock();
    const user = userEvent.setup();
    renderWithQuery(<TableScreen id={TABLE_ID} />);

    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: TABLE_VIEW.title }),
    ).toBeInTheDocument();
  });
});

describe("another failure", () => {
  it("offers a retry", async () => {
    signedIn(refuse(429, "rate_limited", "Too many requests."));
    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Tables are paused right now")).toBeNull();
  });
});

describe("the table", () => {
  it("shows the title, the leader, the time, the area and the seats", async () => {
    signedIn(answer());
    expect(
      await screen.findByRole("heading", { name: TABLE_VIEW.title }),
    ).toBeInTheDocument();
    expect(screen.getByText("Led by Meera from Yuvoy")).toBeInTheDocument();
    expect(
      screen.getByText(
        "A café in Govind Nagar. The exact place is shared when you're in.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("3 of 6 going")).toBeInTheDocument();
    expect(screen.getByText(TABLE_VIEW.gettingHome)).toBeInTheDocument();
    expect(
      screen.getByText(
        "You pay for your own food and drinks at the place. Yuvoy takes no money for tables.",
      ),
    ).toBeInTheDocument();
  });

  it("reads the times in the table's own zone, whatever the browser's is", async () => {
    /*
      18:00 to 20:00 in Kolkata is 12:30 to 14:30 UTC and 05:30 to 07:30 in
      Los Angeles. A page that used the browser's zone shows one of those.
    */
    const before = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      signedIn(answer());
      expect(
        await screen.findByText("Fri, 21 Aug, 18:00 to 20:00"),
      ).toBeInTheDocument();
    } finally {
      process.env.TZ = before;
    }
  });

  it("names a partner club as the leader, and in the safety line", async () => {
    signedIn(
      answer({
        leader: {
          kind: "partner_club",
          firstName: "Kabir",
          clubName: "Sample Run Club",
        },
      }),
    );
    expect(
      await screen.findByText("Led by Sample Run Club"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Someone from Sample Run Club is there from start/),
    ).toBeInTheDocument();
  });

  it("shows the names when they are sent, and the count when they are not", async () => {
    signedIn(answer());
    expect(await screen.findByText("Asha")).toBeInTheDocument();
    expect(screen.queryByText(/people so far/)).toBeNull();
    cleanup();

    // Women only, a request alone: the server sends no names, and the page
    // never works them out.
    signedIn(answer({ womenOnly: true }, ["whoIsGoing"]));
    expect(await screen.findByText("3 people so far")).toBeInTheDocument();
    expect(screen.getByText("Women only")).toBeInTheDocument();
    expect(screen.queryByText("Asha")).toBeNull();
  });

  it("shows the event as words and the experience as a link", async () => {
    signedIn(
      answer({
        event: { id: "a1b2", title: "Sample full-moon walk" },
        experience: { slug: "try-dive-nemo-reef", title: "Try-dive" },
      }),
    );
    expect(
      await screen.findByText("Sample full-moon walk"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Sample full-moon walk" }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Try-dive" })).toHaveAttribute(
      "href",
      "/e/try-dive-nemo-reef",
    );
  });

  it.each([
    ["requested", "Request sent. We will email you."],
    ["declined", "The Yuvoy team could not offer you a seat at this table."],
    ["removed", "The Yuvoy team could not offer you a seat at this table."],
    ["withdrawn", "You withdrew your request."],
  ] as const)("says where a %s request stands", async (state, line) => {
    signedIn(answer({ myRequest: { state } }));
    expect(await screen.findByText(line)).toBeInTheDocument();
  });

  it.each([
    ["in_review", "The Yuvoy team is checking a change to this table."],
    ["cancelled", "This table was cancelled."],
    ["ended", "This table has ended."],
  ] as const)("says when the table is %s", async (status, line) => {
    signedIn(answer({ status }));
    expect(await screen.findByText(line)).toBeInTheDocument();
  });
});

describe("the place and the day's number", () => {
  it("are not shown unless the answer has them", async () => {
    signedIn(answer());
    await screen.findByRole("heading", { name: TABLE_VIEW.title });
    expect(screen.queryByText(TABLE_VENUE.name)).toBeNull();
    expect(screen.queryByRole("link", { name: "Open in maps" })).toBeNull();
    expect(document.body.textContent).not.toContain(TABLE_DAY_OF_CONTACT);
  });

  it("are shown to an approved guest, with a map link and a number to call", async () => {
    signedIn(
      answer({
        myRequest: { state: "approved" },
        venue: TABLE_VENUE,
        dayOfContact: TABLE_DAY_OF_CONTACT,
      }),
    );
    expect(await screen.findByText(TABLE_VENUE.name)).toBeInTheDocument();
    expect(screen.getByText(TABLE_VENUE.meetingPoint)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in maps" })).toHaveAttribute(
      "href",
      TABLE_VENUE.mapUrl,
    );
    expect(
      screen.getByRole("link", { name: TABLE_DAY_OF_CONTACT }),
    ).toHaveAttribute("href", `tel:${TABLE_DAY_OF_CONTACT}`);
    // The area line is for before approval only.
    expect(screen.queryByText(/The exact place is shared/)).toBeNull();
  });

  it("does not link a map address that is not https", async () => {
    signedIn(
      answer({
        myRequest: { state: "approved" },
        venue: { ...TABLE_VENUE, mapUrl: "javascript:alert(1)" },
      }),
    );
    expect(await screen.findByText(TABLE_VENUE.name)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open in maps" })).toBeNull();
    expect(screen.getByText("javascript:alert(1)").tagName).toBe("P");
  });
});
