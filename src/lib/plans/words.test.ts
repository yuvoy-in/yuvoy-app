import { describe, it, expect } from "vitest";
import {
  answerLabel,
  namesList,
  planWords,
  refusalLine,
  stateLine,
} from "./words";

/**
 * The words both plan pages share (yuvoy-app#193, yuvoy-mobile#373).
 *
 * Two rules hold for every line, and both are easy to break by accident in a
 * later edit: no dash, and never "host" for the person who made the plan
 * (yuvoy-api#480: "host" means a business and nothing else since 21 Oct).
 */

/** Every line, with each function called on sample words. */
function everyLine(): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") out.push(value);
    else if (typeof value === "function") {
      out.push(String(value("Asha", "₹250", "asha@okaxis")));
    } else if (value && typeof value === "object") {
      for (const v of Object.values(value)) walk(v);
    }
  };
  walk(planWords);
  out.push(planWords.counts({ can: 2, maybe: 1, cant: 0 }));
  return out;
}

describe("every plan line", () => {
  it("has no dash in it", () => {
    for (const line of everyLine()) {
      expect(line, line).not.toMatch(/[\u2012-\u2015\u2212]/);
      // A hyphen with a space either side is a dash typed on a keyboard.
      expect(line, line).not.toMatch(/\s-\s/);
    }
  });

  it("never calls the person who made the plan the host", () => {
    for (const line of everyLine()) {
      expect(line, line).not.toMatch(/\bhosts?\b/i);
    }
  });

  it("names the planner where a plan is loaded", () => {
    expect(planWords.invitedYou("Asha")).toBe("Asha invited you");
    expect(planWords.footerSeen("Asha")).toBe(
      "Asha and the others on this plan see your name and replies.",
    );
    expect(planWords.planFull("Asha")).toBe(
      "This plan has as many people as Yuvoy allows. Ask Asha if there is room.",
    );
    expect(planWords.cancelled("Asha")).toBe("Asha cancelled this plan.");
  });

  it("says the person who made the plan where none is loaded", () => {
    expect(planWords.linkNotWorking).toContain(
      "the person who made the plan may have made a new one",
    );
  });

  it("draws the money lines from R7-c", () => {
    expect(planWords.costLine("Pizza", "₹1,000", "Asha")).toBe(
      "Pizza: ₹1,000, paid by Asha.",
    );
    expect(planWords.yourShare("₹250")).toBe("Your share: ₹250.");
    expect(planWords.payButton("₹250")).toBe("Pay ₹250 by UPI");
    expect(planWords.payFallback("₹250", "asha@okaxis")).toBe(
      "Button not working? Send ₹250 to asha@okaxis from any UPI app.",
    );
    expect(planWords.paidHint("Asha")).toBe(
      "This tells Asha. Yuvoy cannot see payments.",
    );
  });

  it("counts with a middle dot, and votes in the singular for one", () => {
    expect(planWords.counts({ can: 2, maybe: 1, cant: 0 })).toBe(
      "Can 2 · Maybe 1 · Can't 0",
    );
    expect(planWords.votes(1)).toBe("1 vote");
    expect(planWords.votes(0)).toBe("0 votes");
  });
});

describe("answerLabel", () => {
  it("says Can before the pick and Going after it", () => {
    expect(answerLabel("can", false)).toBe("Can");
    expect(answerLabel("can", true)).toBe("Going");
    expect(answerLabel("cant", false)).toBe("Can't");
    expect(answerLabel("cant", true)).toBe("Can't make it");
  });
});

describe("namesList", () => {
  it("joins one, two and three names the same way everywhere", () => {
    expect(namesList([])).toBe("");
    expect(namesList(["Asha"])).toBe("Asha");
    expect(namesList(["Asha", "Ravi"])).toBe("Asha and Ravi");
    expect(namesList(["Asha", "Ravi", "Meera"])).toBe("Asha, Ravi and Meera");
  });
});

describe("stateLine", () => {
  const plan = (state: string, canReply = true) => ({
    state,
    canReply,
    planner: { name: "Asha" },
  });

  it("says nothing for a plan still taking answers", () => {
    expect(stateLine(plan("open"))).toBeNull();
    expect(stateLine(plan("decided"))).toBeNull();
  });

  it("names each ending, and a plan that has started", () => {
    expect(stateLine(plan("cancelled", false))).toBe(
      "Asha cancelled this plan.",
    );
    expect(stateLine(plan("done", false))).toBe("This plan has happened.");
    expect(stateLine(plan("closed", false))).toBe(
      "This plan is no longer available.",
    );
    expect(stateLine(plan("decided", false))).toBe(
      "Replies are closed because the plan has started.",
    );
  });

  it("does not throw on a state this build has never seen", () => {
    expect(stateLine(plan("paused_by_staff"))).toBeNull();
  });
});

describe("refusalLine", () => {
  const line = (code: string, reason?: string, message = "") =>
    refusalLine({ code, reason, message }, "Asha");

  it("reads plan_closed by its reason", () => {
    expect(line("plan_closed", "started")).toBe(
      "Replies are closed because the plan has started.",
    );
    expect(line("plan_closed", "cancelled")).toBe("Asha cancelled this plan.");
    expect(line("plan_closed", "done")).toBe("This plan has happened.");
    expect(line("plan_closed", "closed")).toBe(
      "This plan is no longer available.",
    );
  });

  it("tells the planner to cancel rather than leave", () => {
    expect(line("conflict", "planner_leaves")).toBe("Cancel the plan instead.");
  });

  it("shows a field refusal in the API's own words", () => {
    expect(
      line("invalid_input", "adult", "Tick to say you are 18 or over."),
    ).toBe("Tick to say you are 18 or over.");
  });

  it("keeps the answers on a network failure and says so", () => {
    expect(line("network")).toBe(
      "We could not send your reply. Check your connection and send again. Your answers are still filled in.",
    );
    expect(line("internal_error")).toBe(line("network"));
  });

  it("has a line for being full, too fast and paused", () => {
    expect(line("plan_full")).toContain("Ask Asha if there is room.");
    expect(line("rate_limited")).toBe(
      "Lots of replies at once. Wait a minute and send again.",
    );
    expect(line("plans_unavailable")).toBe(
      "Plans are paused for a moment. Try again later.",
    );
  });
});
