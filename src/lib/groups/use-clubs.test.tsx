import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { YuvoyError } from "@/lib/api/errors";
import type { Cohort, ReleaseStage } from "@/lib/site/app-config";
import { server } from "../../../mocks/server";
import {
  __resetAppRouteMocks,
  __signInAppRouteMock,
} from "../../../mocks/app-route-handlers";
import { CLUB_IDS, CLUB_MESSAGES as M } from "../../../mocks/club-fixtures";
import { PeopleClosedError } from "./clubs";
import { useReportClub } from "./use-clubs";

/**
 * What a People 404 means when the release is read again with a cohort
 * (decision A, 2 Nov): at `early` or `staff`, a signed-in reader's `GET /me`
 * says whether People is open to them. Open: the 404 stays, "not there".
 * Closed: `PeopleClosedError`. A `GET /me` that fails leaves the 404, which
 * is still no success. The other release stages are covered by the sheets'
 * and pages' own tests.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/** A report is the call here; every form goes through the same `checked`. */
function Probe() {
  const report = useReportClub(CLUB_IDS.reefRunners);
  const error = report.error;
  const ended =
    error instanceof PeopleClosedError
      ? "closed"
      : error instanceof YuvoyError && error.status === 404
        ? "not there"
        : report.isSuccess
          ? "sent"
          : "none";
  return (
    <>
      <button
        type="button"
        onClick={() => report.mutate({ reason: "not_a_real_group" })}
      >
        Send
      </button>
      <p data-testid="ended">{ended}</p>
    </>
  );
}

function people(stage: ReleaseStage) {
  server.use(
    http.get(`${BASE}/app-config`, () =>
      HttpResponse.json({ releases: { people: stage } }),
    ),
  );
}

/** `POST /clubs/{clubId}/reports` answers 404, as it does for a group not shown. */
function notShown() {
  server.use(
    http.post(`${BASE}/clubs/:clubId/reports`, () =>
      HttpResponse.json(
        {
          error: {
            code: "not_found",
            message: M.notFound,
            requestId: "01JTEST",
          },
        },
        { status: 404 },
      ),
    ),
  );
}

/** `GET /me` answers `cohort`, or fails with a 403 when it is `"fails"`. */
function account(cohort: Cohort | "fails") {
  const asked: number[] = [];
  server.use(
    http.get(`${BASE}/me`, () => {
      asked.push(1);
      if (cohort === "fails") {
        return HttpResponse.json(
          {
            error: { code: "forbidden", message: "No.", requestId: "01JTEST" },
          },
          { status: 403 },
        );
      }
      return HttpResponse.json({
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
      });
    }),
  );
  return asked;
}

async function sendAndRead(text: string) {
  const user = userEvent.setup();
  renderWithQuery(<Probe />);
  await user.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() =>
    expect(screen.getByTestId("ended")).toHaveTextContent(text),
  );
}

beforeEach(() => {
  __resetAppRouteMocks();
  __signInAppRouteMock();
  notShown();
});
afterEach(cleanup);

describe("a People 404 for a signed-in reader, by cohort", () => {
  it("stays not there at staff for the staff cohort", async () => {
    people("staff");
    const asked = account("staff");
    await sendAndRead("not there");
    expect(asked).toHaveLength(1);
  });

  it("is People closed at staff for the early cohort", async () => {
    people("staff");
    const asked = account("early");
    await sendAndRead("closed");
    expect(asked).toHaveLength(1);
  });

  it("stays not there at early for the early cohort", async () => {
    people("early");
    account("early");
    await sendAndRead("not there");
  });

  it("is People closed at early for a reader with no cohort", async () => {
    people("early");
    account(null);
    await sendAndRead("closed");
  });

  it("stays not there when GET /me fails, never People closed", async () => {
    people("early");
    const asked = account("fails");
    await sendAndRead("not there");
    expect(asked).toHaveLength(1);
  });

  it("asks nobody who they are once People is open to everybody", async () => {
    people("all");
    const asked = account("staff");
    await sendAndRead("not there");
    expect(asked).toEqual([]);
  });
});
