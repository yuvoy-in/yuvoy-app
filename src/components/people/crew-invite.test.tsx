import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { CREW_INVITE_WORDS } from "@/lib/people/crew-invite";
import { useRelease } from "@/lib/site/use-release";
import type { PlanSummary } from "@/lib/plans/use-my-plans";
import { CrewInvite } from "./crew-invite";

/**
 * Invite to a plan on a crew page (yuvoy-mobile#392, web half): shown only
 * while People and plans are open and the crew has someone in it; the
 * picker reads every page, and a page that fails offers Try again, never a
 * wait that does not end.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const CREW = "7c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e51";

const plan = (id: string, role: PlanSummary["role"]): PlanSummary => ({
  id,
  title: `Plan ${id}`,
  templateKey: "custom",
  role,
  state: "open",
  timeZone: "Asia/Kolkata",
  going: 1,
});

function releases(stages: { people: string; plans: string }) {
  server.use(
    http.get(`${BASE}/app-config`, () =>
      HttpResponse.json({
        minimumVersion: { ios: "0.0.0", android: "0.0.0" },
        features: { payments: "coming_soon", inviteOnly: false },
        support: { whatsappE164: null, hours: "" },
        deliveryHost: null,
        releases: stages,
      }),
    ),
  );
}

/** One page of plans, all of them. */
function onePage(items: PlanSummary[]) {
  server.use(
    http.get(`${BASE}/me/plans`, () =>
      HttpResponse.json({ items, complete: true }),
    ),
  );
}

/** Says when the config is in, so "not shown" is checked after it, not before. */
function ConfigIn() {
  const people = useRelease("people");
  return people.pending ? null : <p>config in</p>;
}

/** Opens the picker once the config is in and the button shows. */
const open = async () =>
  fireEvent.click(
    await screen.findByRole("button", { name: "Invite to a plan" }),
  );

beforeEach(() => __signInAppRouteMock());

describe("Invite to a plan on a crew page", () => {
  it("is not shown while plans is closed", async () => {
    releases({ people: "all", plans: "off" });
    renderWithQuery(
      <>
        <ConfigIn />
        <CrewInvite crewId={CREW} memberCount={3} />
      </>,
    );
    await screen.findByText("config in");
    expect(screen.queryByText(CREW_INVITE_WORDS.button)).toBeNull();
  });

  it("is not shown for a crew with nobody in it", async () => {
    releases({ people: "all", plans: "all" });
    renderWithQuery(
      <>
        <ConfigIn />
        <CrewInvite crewId={CREW} memberCount={0} />
      </>,
    );
    await screen.findByText("config in");
    expect(screen.queryByText(CREW_INVITE_WORDS.button)).toBeNull();
  });

  it("says there are no plans only once every page is read", async () => {
    releases({ people: "all", plans: "all" });
    onePage([plan("joined", "member")]);
    renderWithQuery(<CrewInvite crewId={CREW} memberCount={3} />);
    await open();
    expect(await screen.findByText(CREW_INVITE_WORDS.noPlans)).toBeTruthy();
  });

  it("shows Try again when page 2 fails, and the plan once it is read", async () => {
    releases({ people: "all", plans: "all" });
    let secondPageTries = 0;
    server.use(
      http.get(`${BASE}/me/plans`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        if (cursor !== "p2") {
          return HttpResponse.json({
            items: [plan("joined", "member")],
            complete: false,
            nextCursor: "p2",
          });
        }
        secondPageTries += 1;
        if (secondPageTries === 1) {
          return HttpResponse.json(
            {
              error: {
                code: "plans_unavailable",
                message: "Plans are paused for a moment. Try again soon.",
              },
            },
            { status: 503 },
          );
        }
        return HttpResponse.json({
          items: [plan("mine", "planner")],
          complete: true,
        });
      }),
    );
    renderWithQuery(<CrewInvite crewId={CREW} memberCount={3} />);
    await open();
    expect(await screen.findByText(CREW_INVITE_WORDS.plansPaused)).toBeTruthy();
    expect(screen.queryByText(CREW_INVITE_WORDS.loading)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Plan mine")).toBeTruthy();
    expect(secondPageTries).toBe(2);
  });

  it("invites the crew to the plan picked and counts who came in", async () => {
    releases({ people: "all", plans: "all" });
    onePage([plan("mine", "planner")]);
    const sent: unknown[] = [];
    server.use(
      http.post(`${BASE}/plans/:planId/crew-invites`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ invited: 1, skipped: 3 });
      }),
    );
    renderWithQuery(<CrewInvite crewId={CREW} memberCount={4} />);
    await open();
    fireEvent.click(await screen.findByText("Plan mine"));
    expect(await screen.findByText("1 invited. 3 left out.")).toBeTruthy();
    expect(sent).toEqual([{ crewId: CREW }]);
  });
});
