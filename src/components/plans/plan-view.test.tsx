import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PLAN_IDS,
  PLAN_PAYEE,
  decidedPlanView,
  memberMe,
  openPlanView,
  payLinkTamperedView,
  plannerPlanView,
  upiPayLink,
  withReply,
} from "../../../mocks/plan-fixtures";
import type {
  PlanActionResult,
  PlanActions,
  PlanReplyBody,
  PlanView,
} from "./plan-view";
import { PlanViewScreen } from "./plan-view";

/**
 * The plan view both plan pages draw (yuvoy-app#193, yuvoy-mobile#373),
 * with the actions handed in as plain functions, which is how the view is
 * built: it never knows which page it is on or how a request travels.
 */

function actionsFor(
  plan: PlanView,
  over: Partial<PlanActions> = {},
): PlanActions & { sent: PlanReplyBody[] } {
  const sent: PlanReplyBody[] = [];
  return {
    sent,
    reply: vi.fn(async (body: PlanReplyBody): Promise<PlanActionResult> => {
      sent.push(body);
      return { kind: "ok", plan: withReply(plan, body) };
    }),
    leave: vi.fn(async (): Promise<PlanActionResult> => ({ kind: "gone" })),
    report: vi.fn(async (): Promise<PlanActionResult> => ({ kind: "sent" })),
    ...over,
  };
}

function draw(plan: PlanView, actions = actionsFor(plan), signedIn = true) {
  render(
    <PlanViewScreen plan={plan} actions={actions} mode="member" signedIn={signedIn} />,
  );
  return actions;
}

describe("the plan's money", () => {
  it("offers the API's pay link as it was sent, beside the UPI ID and share as text", () => {
    draw(decidedPlanView("member", memberMe()));
    const pay = screen.getByRole("link", { name: "Pay ₹450 by UPI" });
    expect(pay.getAttribute("href")).toBe(
      upiPayLink(45000, "Dinner at the beach shack"),
    );
    expect(
      screen.getByText(`Button not working? Send ₹450 to ${PLAN_PAYEE.upiId} from any UPI app.`),
    ).toBeInTheDocument();
    // Once per share: there are two costs, both paid by Asha.
    expect(
      screen.getAllByText(`Your UPI app should show ${PLAN_PAYEE.name}.`),
    ).toHaveLength(2);
  });

  it("draws no pay button for a link that pays somebody else, and keeps the text", () => {
    draw(payLinkTamperedView());
    expect(screen.queryByRole("link", { name: /by UPI/ })).toBeNull();
    expect(document.querySelector('a[href^="upi:"]')).toBeNull();
    expect(
      screen.getByText(`Send ₹450 to ${PLAN_PAYEE.upiId} from any UPI app.`),
    ).toBeInTheDocument();
    expect(screen.getByText("Your share: ₹450.")).toBeInTheDocument();
  });

  it("says a share is worked out later before the pick", () => {
    draw(openPlanView("member", memberMe()));
    expect(
      screen.getByText("Your share is worked out when Asha picks the time."),
    ).toBeInTheDocument();
    expect(document.querySelector('a[href^="upi:"]')).toBeNull();
  });

  it("gives the planner, who paid, nothing to pay", () => {
    draw(plannerPlanView());
    expect(document.querySelector('a[href^="upi:"]')).toBeNull();
    expect(screen.queryByText(/Your share/)).toBeNull();
  });
});

describe("the reply", () => {
  it("sends one whole reply per press, and draws the plan that came back", async () => {
    const user = userEvent.setup();
    const plan = openPlanView("member", memberMe());
    const actions = draw(plan);

    const second = screen.getAllByRole("radio", { name: "Maybe" })[1]!;
    await user.click(second);
    await user.click(screen.getByRole("checkbox", { name: /Paper plates/ }));
    await user.click(screen.getByRole("button", { name: "Update my reply" }));

    await waitFor(() => expect(actions.reply).toHaveBeenCalledTimes(1));
    expect(actions.sent[0]).toEqual({
      answers: [
        { optionId: PLAN_IDS.times[0], answer: "can" },
        { optionId: PLAN_IDS.times[1], answer: "maybe" },
        { optionId: PLAN_IDS.ideas[1], answer: "vote" },
      ],
      claims: [PLAN_IDS.items[1], PLAN_IDS.items[2]],
      paid: [],
    });
    expect(await screen.findByText(/Thanks, Ravi\. Your reply is in\./)).toBeInTheDocument();
    expect(screen.getByText(/You can change it until/)).toBeInTheDocument();
  });

  it("sends one reply for two presses before the first answers", async () => {
    const plan = openPlanView("member", memberMe());
    let answer: (r: PlanActionResult) => void = () => {};
    const reply = vi.fn(
      () => new Promise<PlanActionResult>((resolve) => (answer = resolve)),
    );
    draw(plan, actionsFor(plan, { reply }));

    // Two submits in one frame, before React draws the button as busy.
    const form = screen
      .getByRole("button", { name: "Update my reply" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(reply).toHaveBeenCalledTimes(1);

    await act(async () => answer({ kind: "ok", plan }));
    expect(await screen.findByText(/Your reply is in\./)).toBeInTheDocument();
  });

  it("says when an item was taken first", async () => {
    const user = userEvent.setup();
    const plan = openPlanView("member", memberMe());
    const actions = actionsFor(plan, {
      reply: vi.fn(async (body: PlanReplyBody) => ({
        kind: "ok" as const,
        plan: { ...withReply(plan, body), notClaimed: [PLAN_IDS.items[2]] },
      })),
    });
    draw(plan, actions);
    await user.click(screen.getByRole("button", { name: "Update my reply" }));
    expect(
      await screen.findByText("Paper plates was taken by someone else first."),
    ).toBeInTheDocument();
  });

  it("asks for the age tick before sending, and sends it once ticked", async () => {
    const user = userEvent.setup();
    const plan = openPlanView("member", memberMe({ adultConfirmed: false }));
    const actions = draw(plan);
    await user.click(screen.getByRole("button", { name: "Update my reply" }));
    expect(await screen.findByText("Tick to say you are 18 or over.")).toBeInTheDocument();
    expect(actions.reply).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "I am 18 or older" }));
    await user.click(screen.getByRole("button", { name: "Update my reply" }));
    await waitFor(() => expect(actions.reply).toHaveBeenCalledTimes(1));
    expect(actions.sent[0]).toMatchObject({ adult: true });
  });

  it("keeps the answers on screen and says so when nothing answered", async () => {
    const user = userEvent.setup();
    const plan = openPlanView("member", memberMe());
    draw(
      plan,
      actionsFor(plan, {
        reply: vi.fn(async () => ({
          kind: "refused" as const,
          code: "network",
          message: "",
        })),
      }),
    );
    await user.click(screen.getAllByRole("radio", { name: "Can't" })[2]!);
    await user.click(screen.getByRole("button", { name: "Update my reply" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Your answers are still filled in.");
    expect(screen.getAllByRole("radio", { name: "Can't" })[2]).toBeChecked();
  });

  it("reads a reply refused because the plan started", async () => {
    const user = userEvent.setup();
    const plan = openPlanView("member", memberMe());
    draw(
      plan,
      actionsFor(plan, {
        reply: vi.fn(async () => ({
          kind: "refused" as const,
          code: "plan_closed",
          reason: "started",
          message: "x",
        })),
      }),
    );
    await user.click(screen.getByRole("button", { name: "Update my reply" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Replies are closed because the plan has started.",
    );
  });

  it("takes only paid marks once replies close", async () => {
    const user = userEvent.setup();
    const plan = { ...decidedPlanView("member", memberMe()), canReply: false };
    const actions = draw(plan);
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    expect(
      screen.getByText("Replies are closed because the plan has started."),
    ).toBeInTheDocument();

    await user.click(screen.getAllByRole("checkbox", { name: /I've paid my share/ })[0]!);
    await user.click(screen.getByRole("button", { name: "Update my reply" }));
    await waitFor(() => expect(actions.reply).toHaveBeenCalledTimes(1));
    expect(actions.sent[0]).toEqual({ paid: [PLAN_IDS.costs[0]] });
  });
});

describe("leaving", () => {
  it("asks first, then leaves with one request", async () => {
    const user = userEvent.setup();
    const actions = draw(decidedPlanView("member", memberMe()));
    await user.click(screen.getByRole("button", { name: "Leave this plan" }));
    expect(
      await screen.findByText(
        "Your name and answers will be deleted, and your items freed for others.",
      ),
    ).toBeInTheDocument();
    expect(actions.leave).not.toHaveBeenCalled();
    const buttons = await screen.findAllByRole("button", { name: "Leave this plan" });
    await user.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(actions.leave).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("You left this plan.")).toBeInTheDocument();
  });

  it("is never offered to the planner", () => {
    draw(plannerPlanView());
    expect(screen.queryByRole("button", { name: "Leave this plan" })).toBeNull();
  });
});

describe("what the page never shows", () => {
  it("never calls the planner the host, and shows nobody's number or email", () => {
    draw(decidedPlanView("member", memberMe()));
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\bhosts?\b/i);
    expect(text).not.toMatch(/\d{10}/);
    // The payee's UPI ID is the one handle on the page, and it is meant to be.
    expect(text.replaceAll(PLAN_PAYEE.upiId, "")).not.toMatch(/\S+@\S+/);
    expect(text).not.toMatch(/[‒-―−]/);
  });

  it("names the planner who invited the reader", () => {
    draw(decidedPlanView("member", memberMe()));
    expect(screen.getByText("Asha invited you")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Dinner at the beach shack",
    );
  });
});
