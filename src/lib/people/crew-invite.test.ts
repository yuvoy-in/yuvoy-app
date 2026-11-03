import { describe, it, expect } from "vitest";
import { NetworkError, YuvoyError } from "@/lib/api/errors";
import { invitablePlans, type PlanSummary } from "@/lib/plans/use-my-plans";
import {
  CREW_INVITE_WORDS,
  PLAN_CLOSED_WORDS,
  PlansShutError,
  crewInviteFailure,
  crewInviteLine,
  planPickerLine,
} from "./crew-invite";
import {
  PEOPLE_FAILURE_WORDS,
  PEOPLE_SHUT_LINE,
  PeopleShutError,
} from "./people-stand-ins";

/** Invite a crew to a plan (yuvoy-mobile#392, web half). */

function refusal(
  status: number,
  code: string,
  message = "",
  details?: Record<string, unknown>,
) {
  return new YuvoyError({ status, code, message, details });
}

describe("the line after an invite", () => {
  it("counts who was invited and who was left out", () => {
    expect(crewInviteLine({ invited: 3, skipped: 0 })).toBe("3 invited.");
    expect(crewInviteLine({ invited: 1, skipped: 3 })).toBe(
      "1 invited. 3 left out.",
    );
    expect(crewInviteLine({ invited: 0, skipped: 4 })).toBe(
      "Nobody new to invite. 4 left out.",
    );
    expect(crewInviteLine({ invited: 0, skipped: 0 })).toBe(
      "Nobody new to invite.",
    );
  });

  it("never prints a negative or a fraction", () => {
    expect(crewInviteLine({ invited: -2, skipped: 1.7 })).toBe(
      "Nobody new to invite. 1 left out.",
    );
    expect(crewInviteLine({ invited: Number.NaN, skipped: 0 })).toBe(
      "Nobody new to invite.",
    );
  });
});

describe("what a failed invite says", () => {
  it("says People closed for the closed error, and invites nobody", () => {
    const f = crewInviteFailure(new PeopleShutError());
    expect(f.kind).toBe("peopleClosed");
    expect(f.line).toBe(PEOPLE_SHUT_LINE);
    expect(f.retry).toBe(false);
  });

  it("says plans closed for the plans closed error, like the picker", () => {
    expect(crewInviteFailure(new PlansShutError())).toEqual({
      kind: "plansClosed",
      line: CREW_INVITE_WORDS.plansClosed,
      retry: false,
    });
  });

  it("reads a 404 that stayed a 404 as the plan not being there", () => {
    const f = crewInviteFailure(
      refusal(404, "not_found", "We could not find that plan."),
    );
    expect(f.kind).toBe("gone");
    expect(f.line).toBe(CREW_INVITE_WORDS.gone);
  });

  it("says why a plan is closed, from the API or its own words", () => {
    const started = crewInviteFailure(
      refusal(409, "plan_closed", "", { reason: "started" }),
    );
    expect(started).toMatchObject({
      kind: "closed",
      reason: "started",
      line: PLAN_CLOSED_WORDS.started,
      retry: false,
    });
    expect(
      crewInviteFailure(
        refusal(409, "plan_closed", "This plan was cancelled.", {
          reason: "cancelled",
        }),
      ).line,
    ).toBe("This plan was cancelled.");
    expect(crewInviteFailure(refusal(409, "plan_closed")).reason).toBe(
      "closed",
    );
  });

  it("names each People refusal", () => {
    expect(
      crewInviteFailure(refusal(403, "adult_confirmation_required")).line,
    ).toBe(PEOPLE_FAILURE_WORDS.age);
    expect(crewInviteFailure(refusal(403, "people_paused")).kind).toBe(
      "paused",
    );
    expect(
      crewInviteFailure(
        refusal(403, "people_paused", "", { standing: "removed" }),
      ).kind,
    ).toBe("ended");
    expect(crewInviteFailure(refusal(409, "name_required")).kind).toBe("name");
    expect(crewInviteFailure(refusal(401, "unauthorized")).kind).toBe("signIn");
  });

  it("offers Try again while plans are paused, with no signal and on a fault", () => {
    expect(crewInviteFailure(refusal(503, "plans_unavailable"))).toMatchObject({
      kind: "plansPaused",
      line: CREW_INVITE_WORDS.plansPaused,
      retry: true,
    });
    // Only the plans store's 503 is plans paused.
    expect(
      crewInviteFailure(refusal(503, "service_unavailable")),
    ).toMatchObject({
      kind: "fault",
      retry: true,
    });
    expect(crewInviteFailure(new NetworkError()).retry).toBe(true);
    expect(crewInviteFailure(new Error("boom")).kind).toBe("fault");
  });

  it("offers no Try again on a 400, since the same request cannot help", () => {
    expect(crewInviteFailure(refusal(400, "invalid_input"))).toMatchObject({
      kind: "fault",
      retry: false,
    });
  });
});

describe("the plan picker", () => {
  const plan = (over: Partial<PlanSummary>): PlanSummary => ({
    id: "p-1",
    title: "Sunday run",
    templateKey: "custom",
    role: "planner",
    state: "open",
    timeZone: "Asia/Kolkata",
    going: 1,
    ...over,
  });

  it("offers only open or decided plans this traveller made", () => {
    const open = plan({ id: "open" });
    const decided = plan({ id: "decided", state: "decided" });
    const offered = invitablePlans([
      open,
      decided,
      plan({ id: "member", role: "member" }),
      plan({ id: "done", state: "done" }),
      plan({ id: "cancelled", state: "cancelled" }),
      plan({ id: "closed", state: "closed" }),
    ]);
    expect(offered.map((p) => p.id)).toEqual(["open", "decided"]);
  });

  it("says plans closed on a 404, and paused when paused", () => {
    expect(planPickerLine(refusal(404, "not_found"))).toEqual({
      line: CREW_INVITE_WORDS.plansClosed,
      retry: false,
    });
    expect(planPickerLine(refusal(503, "plans_unavailable"))).toEqual({
      line: CREW_INVITE_WORDS.plansPaused,
      retry: true,
    });
    expect(planPickerLine(new NetworkError()).retry).toBe(true);
  });
});
