import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { TableScreen } from "./table-screen";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import {
  FIXTURE_NOW,
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
 * Withdrawing a request, or giving back a seat (yuvoy-app#194).
 *
 * Through the whole screen rather than the button alone: what has to hold is
 * what the page shows after the answer, and that is the screen's cache.
 */

/** Counts each read, answering `views` in turn and then the last one. */
function reads(...views: (TableView | number)[]) {
  const seen = { count: 0 };
  server.use(
    http.get(`${BASE}/tables/:id`, () => {
      const view = views[Math.min(seen.count, views.length - 1)];
      seen.count += 1;
      return typeof view === "number"
        ? HttpResponse.json(
            { error: { code: "not_found", message: "Gone." } },
            { status: view },
          )
        : HttpResponse.json(view);
    }),
  );
  return seen;
}

/** Counts each withdraw, answering with `respond`. */
function withdraws(respond: () => Response) {
  const seen = { count: 0 };
  server.use(
    http.delete(`${BASE}/tables/:id/requests/mine`, () => {
      seen.count += 1;
      return respond();
    }),
  );
  return seen;
}

const withdrawn: TableView = {
  ...TABLE_VIEW,
  myRequest: { state: "withdrawn" },
};
delete withdrawn.whoIsGoing;

function open() {
  __signInAppRouteMock();
  return renderWithQuery(<TableScreen id={TABLE_ID} />);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXTURE_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("when it is offered", () => {
  it("is offered for a waiting request and for an approved seat", async () => {
    reads(TABLE_VIEW);
    open();
    expect(
      await screen.findByRole("button", { name: "Withdraw my request" }),
    ).toBeInTheDocument();
    cleanup();

    reads({
      ...TABLE_VIEW,
      myRequest: { state: "approved" },
      venue: TABLE_VENUE,
    });
    open();
    expect(
      await screen.findByRole("button", { name: "Give back my seat" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Can't make it? Let us know so someone else can have the seat.",
      ),
    ).toBeInTheDocument();
  });

  it("is offered on a table in review", async () => {
    reads({ ...TABLE_VIEW, status: "in_review" });
    open();
    expect(
      await screen.findByRole("button", { name: "Withdraw my request" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["a declined request", { myRequest: { state: "declined" } }],
    ["a withdrawn request", { myRequest: { state: "withdrawn" } }],
    ["a cancelled table", { status: "cancelled" }],
    ["an ended table", { status: "ended" }],
  ] as const)("is not offered for %s", async (_, over) => {
    reads({ ...TABLE_VIEW, ...over } as TableView);
    open();
    await screen.findByRole("heading", { name: TABLE_VIEW.title });
    expect(screen.queryByRole("button", { name: /Withdraw|Give back/ })).toBe(
      null,
    );
  });

  it("is not offered once the table has started", async () => {
    vi.setSystemTime(new Date(Date.parse(TABLE_VIEW.startsAt) + 60_000));
    reads(TABLE_VIEW);
    open();
    await screen.findByRole("heading", { name: TABLE_VIEW.title });
    expect(
      screen.queryByRole("button", { name: "Withdraw my request" }),
    ).toBeNull();
  });
});

describe("withdrawing", () => {
  it("asks first, sends one DELETE, and shows the answer", async () => {
    reads(TABLE_VIEW);
    const sent = withdraws(() => HttpResponse.json(withdrawn));
    const user = userEvent.setup();
    open();

    await user.click(
      await screen.findByRole("button", { name: "Withdraw my request" }),
    );
    expect(
      await screen.findByText("The Yuvoy team stops looking at your request."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(sent.count).toBe(0);

    await user.click(
      screen.getByRole("button", { name: "Withdraw my request" }),
    );
    await user.click(await screen.findByRole("button", { name: "Withdraw" }));

    expect(
      await screen.findByText("You withdrew your request."),
    ).toBeInTheDocument();
    expect(sent.count).toBe(1);
    // The answer replaced the table: the names went with the live request.
    expect(screen.queryByText("Asha")).toBeNull();
  });

  it("says why on table_closed, and reads the table again", async () => {
    const seen = reads(TABLE_VIEW, { ...TABLE_VIEW, status: "cancelled" });
    withdraws(() =>
      HttpResponse.json(
        {
          error: {
            code: "table_closed",
            message: "Requests for this table are closed.",
          },
        },
        { status: 409 },
      ),
    );
    const user = userEvent.setup();
    open();

    await user.click(
      await screen.findByRole("button", { name: "Withdraw my request" }),
    );
    await user.click(await screen.findByRole("button", { name: "Withdraw" }));

    expect(
      await screen.findByText(
        "This table has started, so the seat can't be given back here. Write to us if you can't come.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(seen.count).toBe(2));
    expect(
      await screen.findByText("This table was cancelled."),
    ).toBeInTheDocument();
  });

  it("reads the table again on a 404, and shows what that says", async () => {
    // No live seat any more. Here the table is gone for this reader too.
    const seen = reads(TABLE_VIEW, 404);
    withdraws(() =>
      HttpResponse.json(
        {
          error: {
            code: "not_found",
            message: "You have no request or seat at this table.",
          },
        },
        { status: 404 },
      ),
    );
    const user = userEvent.setup();
    open();

    await user.click(
      await screen.findByRole("button", { name: "Withdraw my request" }),
    );
    await user.click(await screen.findByRole("button", { name: "Withdraw" }));

    expect(
      await screen.findByText("We can't show this table"),
    ).toBeInTheDocument();
    expect(seen.count).toBe(2);
  });
});
