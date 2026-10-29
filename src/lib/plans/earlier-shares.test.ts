import { describe, it, expect } from "vitest";
import { PLAN_PAYEE, upiPayLink } from "../../../mocks/plan-fixtures";
import {
  earlierPayLink,
  earlierPayee,
  earlierWeeks,
  paidForWeek,
} from "./earlier-shares";

/**
 * Earlier weeks' shares (yuvoy-mobile#373 case 11): each pay link is
 * checked against that share's own payee and amount, never this week's,
 * and marking one paid sends that week's whole set and nothing else.
 */

const WEEK_1 = "2026-08-08T13:30:00.000Z";
const WEEK_2 = "2026-08-15T13:30:00.000Z";

function share(
  costId: string,
  startsAt: string,
  amountMinor: number,
  paidMarked = false,
) {
  return {
    costId,
    label: "Fish for the grill",
    startsAt,
    amountMinor,
    paidBy: "Asha",
    paidMarked,
    payLink: upiPayLink(
      amountMinor,
      "Dinner at the beach shack: Fish for the grill",
    ),
  };
}

describe("an earlier share's pay link", () => {
  it("is refused with no payee of its own, even when it matches this week's", () => {
    // The link pays asha@okaxis, which is this week's payee too. Not enough:
    // nothing says it was that week's.
    const s = share("a", WEEK_2, 40000);
    expect(s.payLink).toContain(encodeURIComponent(PLAN_PAYEE.upiId));
    expect(earlierPayLink(s)).toBeNull();
    // So the pay panel is handed no payee, and says who to ask.
    expect(earlierPayee(s)).toBeUndefined();
  });

  it("passes when it pays that share's own payee that share's amount", () => {
    const s = { ...share("a", WEEK_2, 40000), payee: { ...PLAN_PAYEE } };
    expect(earlierPayLink(s)).toBe(s.payLink);
    expect(earlierPayee(s)).toEqual(PLAN_PAYEE);
  });

  it("is refused for another payee or another amount than the share's", () => {
    const other = {
      ...share("a", WEEK_2, 40000),
      payee: { upiId: "meera@okhdfc", name: "Meera" },
    };
    expect(earlierPayLink(other)).toBeNull();
    const wrongAmount = {
      ...share("a", WEEK_2, 40000),
      amountMinor: 45000,
      payee: { ...PLAN_PAYEE },
    };
    expect(earlierPayLink(wrongAmount)).toBeNull();
  });
});

describe("weeks", () => {
  it("groups the shares by the week they belong to, in the API's order", () => {
    const weeks = earlierWeeks([
      share("a", WEEK_1, 100),
      share("b", WEEK_2, 200),
      share("c", WEEK_1, 300),
    ]);
    expect(
      weeks.map((w) => [w.startsAt, w.shares.map((s) => s.costId)]),
    ).toEqual([
      [WEEK_1, ["a", "c"]],
      [WEEK_2, ["b"]],
    ]);
    expect(earlierWeeks(undefined)).toEqual([]);
  });
});

describe("marking one paid", () => {
  const shares = [
    share("a", WEEK_1, 100, true),
    share("b", WEEK_1, 200),
    share("c", WEEK_2, 300, true),
  ];

  it("sends that week's marked shares with the new one, and no other week's", () => {
    expect(paidForWeek(shares, "b")).toEqual(["a", "b"]);
  });

  it("sends nothing for a cost that is not an earlier share", () => {
    expect(paidForWeek(shares, "this-week")).toEqual([]);
    expect(paidForWeek(undefined, "a")).toEqual([]);
  });
});
