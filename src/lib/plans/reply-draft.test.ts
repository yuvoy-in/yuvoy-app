import { describe, it, expect } from "vitest";
import {
  PLAN_IDS,
  decidedPlanView,
  memberMe,
  openPlanView,
} from "../../../mocks/plan-fixtures";
import {
  bodyFromDraft,
  canSendReply,
  draftFromPlan,
  needsAdultTick,
} from "./reply-draft";

/**
 * A reply is a complete set: whatever the request leaves out, the API clears.
 * So the one property that matters most is that a reader who changes one
 * thing sends everything else back exactly as it was.
 */

describe("draftFromPlan", () => {
  it("starts from the reader's own reply", () => {
    const draft = draftFromPlan(openPlanView("member", memberMe()));
    expect(draft).toEqual({
      answers: { [PLAN_IDS.times[0]]: "can" },
      vote: PLAN_IDS.ideas[1],
      claims: [PLAN_IDS.items[1]],
      paid: [],
      adult: false,
    });
  });

  it("starts empty for a reader with no reply", () => {
    const draft = draftFromPlan(openPlanView("visitor"));
    expect(draft).toEqual({
      answers: {},
      vote: null,
      claims: [],
      paid: [],
      adult: false,
    });
  });
});

describe("bodyFromDraft", () => {
  it("sends one changed answer with every other answer, claim and mark as they were", () => {
    const plan = openPlanView("member", memberMe());
    const draft = draftFromPlan(plan);
    draft.answers[PLAN_IDS.times[1]] = "maybe";
    expect(bodyFromDraft(plan, draft)).toEqual({
      body: {
        answers: [
          { optionId: PLAN_IDS.times[0], answer: "can" },
          { optionId: PLAN_IDS.times[1], answer: "maybe" },
          { optionId: PLAN_IDS.ideas[1], answer: "vote" },
        ],
        claims: [PLAN_IDS.items[1]],
        paid: [],
      },
    });
  });

  it("leaves out an option the plan no longer has", () => {
    const plan = openPlanView("member", memberMe());
    const draft = draftFromPlan(plan);
    draft.answers["gone-time"] = "can";
    draft.vote = "gone-idea";
    draft.claims.push("gone-item");
    draft.paid.push("gone-cost");
    const result = bodyFromDraft(plan, draft);
    expect(JSON.stringify(result)).not.toMatch(/gone-/);
  });

  it("sends only paid once replies are closed", () => {
    const plan = { ...decidedPlanView("member", memberMe()), canReply: false };
    const draft = draftFromPlan(plan);
    draft.paid = [PLAN_IDS.costs[0]];
    draft.answers[PLAN_IDS.times[0]] = "cant";
    expect(bodyFromDraft(plan, draft)).toEqual({
      body: { paid: [PLAN_IDS.costs[0]] },
    });
  });

  it("asks for the age tick before sending, for a member with no age", () => {
    const plan = openPlanView("member", memberMe({ adultConfirmed: false }));
    const draft = draftFromPlan(plan);
    expect(bodyFromDraft(plan, draft)).toEqual({
      problem: { field: "adult", message: "Tick to say you are 18 or over." },
    });
    draft.adult = true;
    expect(bodyFromDraft(plan, draft)).toMatchObject({ body: { adult: true } });
  });

  it("never sends adult for a member whose age Yuvoy holds", () => {
    const plan = openPlanView("member", memberMe());
    const result = bodyFromDraft(plan, draftFromPlan(plan));
    expect(result).toHaveProperty("body");
    expect("body" in result && "adult" in result.body).toBe(false);
  });
});

describe("needsAdultTick and canSendReply", () => {
  it("asks for the tick only while replies are open", () => {
    expect(needsAdultTick(openPlanView("visitor"))).toBe(true);
    expect(needsAdultTick(openPlanView("member", memberMe()))).toBe(false);
    const closed = {
      ...openPlanView("member", memberMe({ adultConfirmed: false })),
      canReply: false,
    };
    expect(needsAdultTick(closed)).toBe(false);
  });

  it("still lets a member mark a share paid after replies close", () => {
    const closed = { ...decidedPlanView("member", memberMe()), canReply: false };
    expect(canSendReply(closed)).toBe(true);
    const nothing = { ...openPlanView("member", memberMe()), canReply: false };
    expect(canSendReply(nothing)).toBe(false);
  });
});
