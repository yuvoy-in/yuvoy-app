import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { crewInviteFailure, crewInviteLine } from "./crew-invite";
import { useInviteCrewToPlan } from "./use-crew-invite";

/**
 * Invite a crew to a plan through the hook (yuvoy-mobile#392, web half).
 * Decision A: a 404 is never success. After one the releases are read
 * again: People closed, or the plan not there and nobody invited.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const CREW = "7c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e51";
const PLAN = "8d2f6a10-3c4b-4e5f-8a9b-0c1d2e3f4a51";

function notFound(message: string) {
  return HttpResponse.json(
    { error: { code: "not_found", message } },
    { status: 404 },
  );
}

/** `GET /app-config` with these stages, or a 400 when `null`. */
function releases(stages: { people: string; plans: string } | null) {
  server.use(
    http.get(`${BASE}/app-config`, () =>
      stages === null
        ? HttpResponse.json(
            { error: { code: "invalid_input", message: "x" } },
            { status: 400 },
          )
        : HttpResponse.json({
            minimumVersion: { ios: "0.0.0", android: "0.0.0" },
            features: { payments: "coming_soon", inviteOnly: false },
            support: { whatsappE164: null, hours: "" },
            deliveryHost: null,
            releases: stages,
          }),
    ),
  );
}

/** `GET /me/club-follows` answering a list: People open to the caller. */
function followsOpen() {
  server.use(
    http.get(`${BASE}/me/club-follows`, () =>
      HttpResponse.json({ clubIds: [], clubs: [] }),
    ),
  );
}

/** `GET /me/plans` answering a page: plans open to the caller. */
function plansOpen() {
  server.use(
    http.get(`${BASE}/me/plans`, () =>
      HttpResponse.json({ items: [], complete: true }),
    ),
  );
}

function invites(answer: () => Response) {
  const sent: { planId: string; body: unknown }[] = [];
  server.use(
    http.post(
      `${BASE}/plans/:planId/crew-invites`,
      async ({ params, request }) => {
        sent.push({
          planId: String(params.planId),
          body: await request.json(),
        });
        return answer();
      },
    ),
  );
  return sent;
}

function Probe() {
  const invite = useInviteCrewToPlan(CREW);
  return (
    <div>
      <p data-testid="said">
        {invite.data
          ? crewInviteLine(invite.data)
          : invite.error
            ? crewInviteFailure(invite.error).kind
            : "nothing yet"}
      </p>
      <button
        type="button"
        onClick={() => {
          invite.invite(PLAN);
          invite.invite(PLAN);
        }}
      >
        invite
      </button>
    </div>
  );
}

const says = (text: string) =>
  waitFor(() => expect(screen.getByTestId("said")).toHaveTextContent(text));

beforeEach(() => __signInAppRouteMock());

describe("Invite to a plan", () => {
  it("sends the crew once for a burst of taps and counts who came in", async () => {
    const sent = invites(() => HttpResponse.json({ invited: 1, skipped: 3 }));
    renderWithQuery(<Probe />);
    fireEvent.click(screen.getByText("invite"));
    await says("1 invited. 3 left out.");
    expect(sent).toEqual([{ planId: PLAN, body: { crewId: CREW } }]);
  });

  it("reads a 404 with both releases open as the plan not there, and reads plans again", async () => {
    releases({ people: "all", plans: "all" });
    followsOpen();
    plansOpen();
    invites(() => notFound("We could not find that plan."));
    const { client } = renderWithQuery(<Probe />);
    client.setQueryData(["listMyPlans", "upcoming"], {
      pages: [],
      pageParams: [],
    });
    fireEvent.click(screen.getByText("invite"));
    await says("gone");
    await waitFor(() =>
      expect(
        client.getQueryState(["listMyPlans", "upcoming"])?.isInvalidated,
      ).toBe(true),
    );
  });

  it("reads a 404 as plans closed when only plans is closed, as the picker says", async () => {
    releases({ people: "all", plans: "off" });
    followsOpen();
    invites(() => notFound("We could not find that plan."));
    renderWithQuery(<Probe />);
    fireEvent.click(screen.getByText("invite"));
    await says("plansClosed");
  });

  it("reads a 404 as plans closed when the plans list says so though the config is open", async () => {
    // The config can lag the API by minutes, for plans as for People.
    releases({ people: "all", plans: "all" });
    followsOpen();
    invites(() => notFound("We could not find that plan."));
    server.use(
      http.get(`${BASE}/me/plans`, () =>
        notFound("We could not find that plan."),
      ),
    );
    renderWithQuery(<Probe />);
    fireEvent.click(screen.getByText("invite"));
    await says("plansClosed");
  });

  it("reads a 404 as People closed when the follows list says so though the config is open", async () => {
    // The config can lag the API by minutes.
    releases({ people: "all", plans: "all" });
    invites(() => notFound("Not found."));
    server.use(
      http.get(`${BASE}/me/club-follows`, () => notFound("Not found.")),
    );
    renderWithQuery(<Probe />);
    fireEvent.click(screen.getByText("invite"));
    await says("peopleClosed");
  });

  it("reads a 404 as People closed when the release no longer admits the caller", async () => {
    releases({ people: "off", plans: "all" });
    invites(() => notFound("Not found."));
    renderWithQuery(<Probe />);
    fireEvent.click(screen.getByText("invite"));
    await says("peopleClosed");
  });

  it("asks the follows list when the releases cannot be read", async () => {
    releases(null);
    invites(() => notFound("Not found."));
    server.use(
      http.get(`${BASE}/me/club-follows`, () => notFound("Not found.")),
    );
    renderWithQuery(<Probe />);
    fireEvent.click(screen.getByText("invite"));
    await says("peopleClosed");
  });

  it("keeps the 404 as not there when nothing says People closed", async () => {
    releases(null);
    invites(() => notFound("We could not find that plan."));
    followsOpen();
    plansOpen();
    renderWithQuery(<Probe />);
    fireEvent.click(screen.getByText("invite"));
    await says("gone");
  });

  it("says why a closed plan takes no invites", async () => {
    invites(() =>
      HttpResponse.json(
        {
          error: {
            code: "plan_closed",
            message:
              "This plan has started, so its times and answers are fixed.",
            details: { reason: "started" },
          },
        },
        { status: 409 },
      ),
    );
    renderWithQuery(<Probe />);
    fireEvent.click(screen.getByText("invite"));
    await says("closed");
  });
});
