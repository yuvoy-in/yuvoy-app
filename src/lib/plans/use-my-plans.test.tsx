import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { useInvitablePlans, type PlanSummary } from "./use-my-plans";

/**
 * What Invite to a plan offers (yuvoy-mobile#392, web half): every upcoming
 * page is read before the plans are filtered, so a plan this traveller made
 * on page 2 is still offered.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const plan = (id: string, role: PlanSummary["role"]): PlanSummary => ({
  id,
  title: id,
  templateKey: "custom",
  role,
  state: "open",
  timeZone: "Asia/Kolkata",
  going: 1,
});

/** Two pages: members only on the first, the traveller's own on the second. */
function twoPages() {
  const cursors: (string | null)[] = [];
  server.use(
    http.get(`${BASE}/me/plans`, ({ request }) => {
      const cursor = new URL(request.url).searchParams.get("cursor");
      cursors.push(cursor);
      return cursor === "p2"
        ? HttpResponse.json({
            items: [plan("mine", "planner")],
            complete: true,
          })
        : HttpResponse.json({
            items: [plan("joined", "member")],
            complete: false,
            nextCursor: "p2",
          });
    }),
  );
  return cursors;
}

function Probe() {
  const picker = useInvitablePlans(true);
  return (
    <p data-testid="offered">
      {picker.complete
        ? picker.plans.map((p) => p.id).join(",") || "none"
        : "reading"}
    </p>
  );
}

beforeEach(() => __signInAppRouteMock());

describe("the plans a crew can be invited to", () => {
  it("reads every page before saying what it offers", async () => {
    const cursors = twoPages();
    renderWithQuery(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("offered")).toHaveTextContent("mine"),
    );
    expect(cursors).toEqual([null, "p2"]);
  });
});
