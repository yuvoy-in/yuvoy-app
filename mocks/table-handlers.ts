import { http, HttpResponse } from "msw";
import {
  TABLE_DAY_OF_CONTACT,
  TABLE_ID,
  TABLE_VENUE,
  TABLE_VIEW,
  mockHeaders,
} from "./fixtures";
import type { components } from "../src/lib/api/schema.gen";

type TableView = components["schemas"]["TableView"];

/**
 * One table, as the API answers the three routes `/tables/{id}` calls
 * (yuvoy-app#194, R8-T1).
 *
 * Written against the API's handler (`internal/handler/tables.go` at
 * ad4fa89) for what the page depends on: the names only to a live request,
 * and on a women-only table only to an approved guest; the venue and the
 * day's number only to an approved guest on a listed or recently ended table;
 * a 404 for a malformed id and for anybody the table is not shown to; reports
 * never paused.
 *
 * ## One fixture id, many scenarios
 *
 * Every state is the same table moved by `x-yuvoy-scenario` (or
 * `?__scenario=`), which the proxy carries upstream in a mocked build. So the
 * e2e suite reaches each one at the same address an email would link.
 *
 * ## Withdraw keeps nothing
 *
 * The `200` is the table with the request withdrawn, and the next read is the
 * scenario's table again. The Next server's mock is shared by every spec and
 * both projects, so a withdraw that stuck would make the order of the specs
 * decide what the next one sees.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const url = (p: string) => `${BASE}${p}`;

let seq = 0;
const rid = () =>
  `01JTBL${(++seq).toString(36).toUpperCase().padStart(5, "0")}`;

function envelope(code: string, message: string, status: number) {
  return HttpResponse.json(
    { error: { code, message, requestId: rid() } },
    { status, headers: mockHeaders(rid()) },
  );
}

function scenarioOf(request: Request): string {
  return (
    request.headers.get("x-yuvoy-scenario") ??
    new URL(request.url).searchParams.get("__scenario") ??
    "ok"
  );
}

const UNAUTHORIZED = () => envelope("unauthorized", "Sign in first.", 401);
const NOT_FOUND = () =>
  envelope("not_found", "This table is no longer listed.", 404);
const PAUSED = () =>
  envelope(
    "tables_unavailable",
    "Tables are paused for now. Try again later.",
    503,
  );

/**
 * The failures any route here can give before its own logic: the shared
 * `offline` and `rate-limited` scenarios, as `commonFailure` in
 * `handlers.ts` gives them.
 */
function commonFailure(request: Request) {
  switch (scenarioOf(request)) {
    case "offline":
      return HttpResponse.error();
    case "rate-limited":
      return envelope(
        "rate_limited",
        "Too many requests. Try again shortly.",
        429,
      );
    default:
      return null;
  }
}

/** The approved guest's view: the venue, the names and the day's number. */
function approved(over: Partial<TableView> = {}): TableView {
  return {
    ...TABLE_VIEW,
    seatsTaken: 4,
    myRequest: { state: "approved" },
    whoIsGoing: ["Asha", "Rohan", "Lena", "Guest"],
    venue: TABLE_VENUE,
    dayOfContact: TABLE_DAY_OF_CONTACT,
    ...over,
  };
}

/** No live seat: no names, no venue, and only while it takes requests. */
function noLiveSeat(state: "declined" | "removed" | "withdrawn"): TableView {
  const view: TableView = { ...TABLE_VIEW, myRequest: { state } };
  delete view.whoIsGoing;
  return view;
}

/** The table each scenario reads, or null for the scenario's 404. */
function tableFor(scenario: string): TableView | null {
  switch (scenario) {
    case "table-approved":
      return approved();
    case "table-women-only-requested": {
      // A request alone on a women-only table sees the count, not the names.
      const view: TableView = { ...TABLE_VIEW, womenOnly: true };
      delete view.whoIsGoing;
      return view;
    }
    case "table-declined":
      return noLiveSeat("declined");
    case "table-cancelled": {
      // Cancelled carries no venue and no number, approved or not.
      const view = approved({ status: "cancelled" });
      delete view.venue;
      delete view.dayOfContact;
      return view;
    }
    case "table-ended":
      // Ended less than thirty days ago: the venue stays for the guest.
      return approved({ status: "ended" });
    case "table-missing":
      return null;
    default:
      return TABLE_VIEW;
  }
}

/** The keys `TableReport` has. The server refuses any other. */
const REPORT_KEYS = new Set(["reason", "personName", "note"]);
const REPORT_REASONS = new Set([
  "unsafe",
  "harassment",
  "not_as_described",
  "spam",
  "other",
]);

export const tableHandlers = [
  http.get(url("/tables/:id"), ({ request, params }) => {
    const failed = commonFailure(request);
    if (failed) return failed;
    /*
      The API reads a table signed out too. This app never asks that way, and
      the proxy answers 401 itself with no cookie, so a request that arrives
      here with no session is a bug the mock should make loud.
    */
    if (!request.headers.get("authorization")) return UNAUTHORIZED();
    const scenario = scenarioOf(request);
    if (scenario === "tables-paused") return PAUSED();
    if (params.id !== TABLE_ID) return NOT_FOUND();
    const view = tableFor(scenario);
    if (!view) return NOT_FOUND();
    return HttpResponse.json(view, { headers: mockHeaders(rid()) });
  }),

  http.delete(url("/tables/:id/requests/mine"), ({ request, params }) => {
    const failed = commonFailure(request);
    if (failed) return failed;
    if (!request.headers.get("authorization")) return UNAUTHORIZED();
    const scenario = scenarioOf(request);
    if (scenario === "tables-paused") return PAUSED();
    if (params.id !== TABLE_ID) return NOT_FOUND();
    if (scenario === "table-started") {
      return envelope(
        "table_closed",
        "Requests for this table are closed.",
        409,
      );
    }
    const view = tableFor(scenario);
    const state = view?.myRequest?.state;
    if (!view || (state !== "requested" && state !== "approved")) {
      return envelope(
        "not_found",
        "You have no request or seat at this table.",
        404,
      );
    }
    if (view.status === "cancelled" || view.status === "ended") {
      return envelope(
        "table_closed",
        "Requests for this table are closed.",
        409,
      );
    }
    /*
      The table read whatever its state, with the request withdrawn: no live
      seat now, so no names, no venue and no number.
    */
    const withdrawn: TableView = {
      ...view,
      myRequest: { state: "withdrawn" },
      seatsTaken: state === "approved" ? view.seatsTaken - 1 : view.seatsTaken,
    };
    delete withdrawn.whoIsGoing;
    delete withdrawn.venue;
    delete withdrawn.dayOfContact;
    return HttpResponse.json(withdrawn, { headers: mockHeaders(rid()) });
  }),

  /*
    Never paused: the server takes reports while tables are paused, so
    `tables-paused` does not reach this one.
  */
  http.post(url("/tables/:id/reports"), async ({ request, params }) => {
    const failed = commonFailure(request);
    if (failed) return failed;
    if (!request.headers.get("authorization")) return UNAUTHORIZED();
    if (params.id !== TABLE_ID) return NOT_FOUND();
    if (scenarioOf(request) === "table-report-too-fast") {
      // No `Retry-After`: "send it again in a moment".
      return envelope(
        "rate_limited",
        "Reports sent too fast. Send it again in a moment.",
        429,
      );
    }
    let body: Record<string, unknown> | null = null;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = null;
    }
    const strict =
      body !== null &&
      typeof body === "object" &&
      Object.keys(body).every((k) => REPORT_KEYS.has(k));
    const reasonOk =
      typeof body?.reason === "string" && REPORT_REASONS.has(body.reason);
    const nameOk =
      body?.personName === undefined ||
      (typeof body.personName === "string" &&
        [...body.personName.trim()].length <= 30);
    const noteOk =
      body?.note === undefined ||
      (typeof body.note === "string" && [...body.note.trim()].length <= 300);
    if (!strict || !reasonOk || !nameOk || !noteOk) {
      return envelope("invalid_input", "That report could not be read.", 400);
    }
    return new HttpResponse(null, { status: 202, headers: mockHeaders(rid()) });
  }),
];
