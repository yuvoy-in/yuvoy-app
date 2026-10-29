import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../mocks/server";
import {
  PLAN_IDS,
  decidedPlanView,
  guestMe,
  openPlanView,
  upiPayLink,
} from "../../../mocks/plan-fixtures";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { __forgetArrival } from "@/lib/plans/guest-return";
import type { PlanView } from "@/lib/plans/types";
import { renderWithQuery } from "@/test/render";
import { GuestPlan } from "./guest-plan";

/**
 * The guest page once its plan has loaded (yuvoy-mobile#373): the shared
 * view in guest mode with the first-name box, the link across sign-in,
 * Share, last week's shares and the footer, against stand-ins for the
 * page's own route handlers.
 */

const TOKEN = `yp_${"T".repeat(40)}a-_`;
const START = window.location.href;

type Sent = { route: string; body: Record<string, unknown> };

/** Stand-ins for `/p/api/<route>` that keep what each was sent. */
function routes(
  answers: Partial<Record<string, (body: Record<string, unknown>) => Response>>,
) {
  const sent: Sent[] = [];
  for (const route of ["reply", "leave", "link", "report"]) {
    server.use(
      http.post(`*/p/api/${route}`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        sent.push({ route, body });
        const answer = answers[route];
        return answer
          ? answer(body)
          : HttpResponse.json({ error: { code: "x" } }, { status: 500 });
      }),
    );
  }
  return sent;
}

function draw(plan: PlanView, linkOnArrival = false) {
  return renderWithQuery(
    <GuestPlan token={TOKEN} plan={plan} linkOnArrival={linkOnArrival} />,
  );
}

const send = () =>
  userEvent.click(screen.getByRole("button", { name: "Send my reply" }));

beforeEach(() => {
  __forgetArrival();
  window.history.replaceState(null, "", `/p#${TOKEN}`);
});
afterEach(() => {
  window.history.replaceState(null, "", START);
});

describe("a first reply", () => {
  it("asks for the first name under its box, focused, with no request and no second copy", async () => {
    const sent = routes({});
    draw(openPlanView());
    await userEvent.click(screen.getAllByRole("radio", { name: "Can" })[0]);
    await userEvent.click(
      screen.getByRole("checkbox", { name: "I am 18 or older" }),
    );
    await send();

    const box = screen.getByRole("textbox", { name: "Your first name" });
    await waitFor(() => expect(box).toHaveFocus());
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getAllByText("Use your first name, in letters only."),
    ).toHaveLength(1);
    expect(box.getAttribute("aria-describedby")).toContain(
      screen.getByText("Use your first name, in letters only.").id,
    );
    // What was chosen is still chosen.
    expect(screen.getAllByRole("radio", { name: "Can" })[0]).toBeChecked();
    expect(sent).toHaveLength(0);
  });

  it("sends the name and a nonce, then reads as the guest's own reply", async () => {
    const sent = routes({
      reply: () => HttpResponse.json(openPlanView("member", guestMe("Meera"))),
    });
    draw(openPlanView());
    await userEvent.click(screen.getAllByRole("radio", { name: "Can" })[0]);
    await userEvent.click(
      screen.getByRole("checkbox", { name: "I am 18 or older" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Your first name" }),
      "Meera",
    );
    await send();

    expect(
      await screen.findByText(/Thanks, Meera\. Your reply is in\./),
    ).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    const body = sent[0].body as {
      token: string;
      nonce: string;
      reply: { name: string };
    };
    expect(body.token).toBe(TOKEN);
    expect(body.nonce).toMatch(/^[A-Za-z0-9_-]{22,64}$/);
    expect(body.reply.name).toBe("Meera");
    expect(
      screen.queryByRole("textbox", { name: "Your first name" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Update my reply" }),
    ).toBeInTheDocument();
  });

  it("signed in, draws the name box after all when the profile's name is refused", async () => {
    __signInAppRouteMock();
    const NO_NAME = "Use your first name, in letters only.";
    const sent = routes({
      reply: (body) =>
        (body.reply as { name?: string }).name
          ? HttpResponse.json(openPlanView("member", guestMe("Meera")))
          : HttpResponse.json(
              {
                error: {
                  code: "invalid_input",
                  message: NO_NAME,
                  details: { name: NO_NAME },
                },
              },
              { status: 400 },
            ),
    });
    draw(openPlanView());
    await userEvent.click(screen.getAllByRole("radio", { name: "Can" })[0]);
    await userEvent.click(
      screen.getByRole("checkbox", { name: "I am 18 or older" }),
    );
    // A session: the profile's first name is used, so no box at first.
    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: "Your first name" }),
      ).toBeNull(),
    );
    await send();

    // The API could not use it: the box, with the line under it, focused.
    const box = await screen.findByRole("textbox", { name: "Your first name" });
    await waitFor(() => expect(box).toHaveFocus());
    expect(screen.getAllByText(NO_NAME)).toHaveLength(1);

    // Typing clears the line and keeps the box; the typed name is sent.
    await userEvent.type(box, "Meera");
    expect(screen.queryByText(NO_NAME)).toBeNull();
    expect(screen.getByRole("textbox", { name: "Your first name" })).toBe(box);
    await send();
    expect(
      await screen.findByText(/Thanks, Meera\. Your reply is in\./),
    ).toBeInTheDocument();
    expect(sent.map((s) => (s.body.reply as { name?: string }).name)).toEqual([
      undefined,
      "Meera",
    ]);
  });

  it("sends the same nonce again after no answer, so it is one guest", async () => {
    let fail = true;
    const sent = routes({
      reply: () =>
        fail
          ? HttpResponse.error()
          : HttpResponse.json(openPlanView("member", guestMe("Meera"))),
    });
    draw(openPlanView());
    await userEvent.click(
      screen.getByRole("checkbox", { name: "I am 18 or older" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Your first name" }),
      "Meera",
    );
    await send();
    expect(
      await screen.findByText(/Check your connection and send again/),
    ).toBeInTheDocument();
    fail = false;
    await send();
    await screen.findByText(/Thanks, Meera/);
    expect(sent).toHaveLength(2);
    expect(sent[1].body.nonce).toBe(sent[0].body.nonce);
  });
});

describe("a returning guest", () => {
  const returning = () => openPlanView("member", guestMe("Ravi"));

  it("sees their own answers and Update my reply, with no name box", () => {
    routes({});
    draw(returning());
    expect(
      screen.getByRole("button", { name: "Update my reply" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Your first name" }),
    ).toBeNull();
    expect(screen.getAllByRole("radio", { name: "Can" })[0]).toBeChecked();
  });

  it("signed out, goes to sign-in to link, keeping the token in this tab and out of the address", async () => {
    routes({});
    window.history.replaceState(
      null,
      "",
      `/p?__scenario=plan-guest-returning#${TOKEN}`,
    );
    draw(returning());
    const link = screen.getByRole("link", {
      name: "Link my reply to my account",
    });
    expect(link.getAttribute("href")).toBe(
      "/account?next=%2Fp%3F__scenario%3Dplan-guest-returning",
    );
    link.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(link);
    expect(sessionStorage.getItem("yuvoy.plan-link.return")).toContain(TOKEN);
  });

  it("back from sign-in, links the reply with no tap", async () => {
    __signInAppRouteMock();
    const sent = routes({
      link: () =>
        HttpResponse.json(
          openPlanView("member", guestMe("Ravi", { linked: true })),
        ),
    });
    draw(returning(), true);
    expect(
      await screen.findByText("Your reply is linked to your account."),
    ).toBeInTheDocument();
    expect(sent.map((s) => s.route)).toEqual(["link"]);
    expect(
      screen.queryByRole("button", { name: "Link my reply to my account" }),
    ).toBeNull();
  });

  it("says this account already answered, when it has", async () => {
    __signInAppRouteMock();
    routes({
      link: () =>
        HttpResponse.json(
          {
            error: {
              code: "conflict",
              message: "This account already answered this plan.",
              details: { reason: "already_answered" },
            },
          },
          { status: 409 },
        ),
    });
    draw(returning());
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Link my reply to my account",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This account already answered this plan.",
    );
  });
});

describe("share", () => {
  it("offers the plan's own link to the share sheet, never the page's query", async () => {
    routes({});
    window.history.replaceState(
      null,
      "",
      `/p?__scenario=plan-guest-first#${TOKEN}`,
    );
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, "share", {
      value: share,
      configurable: true,
    });
    try {
      draw(openPlanView());
      await userEvent.click(screen.getByRole("button", { name: "Share" }));
      expect(share).toHaveBeenCalledWith({
        title: "Dinner at the beach shack",
        text: "Dinner at the beach shack. Friends are choosing a time. Reply here, no app needed:",
        url: `${window.location.origin}/p/#${TOKEN}`,
      });
    } finally {
      delete (navigator as { share?: unknown }).share;
    }
  });
});

describe("the footer", () => {
  it("says who sees what, how long it is kept, and where safety questions go", () => {
    routes({});
    draw(openPlanView());
    expect(
      screen.getByText(/never asks guests for a phone number/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/kept until 90 days after the plan/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Asha and the others on this plan see your name and replies.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "info@yuvoy.in" })).toHaveAttribute(
      "href",
      "mailto:info@yuvoy.in",
    );
    expect(
      screen.getAllByRole("button", { name: "Report this plan" }),
    ).toHaveLength(1);
  });
});

describe("earlier weeks", () => {
  const WEEK = "2026-08-15T13:30:00.000Z";
  const earlier = [
    {
      costId: "4a4b4c4d-0004-4a00-8a00-0000000000e1",
      label: "Fish for the grill",
      startsAt: WEEK,
      amountMinor: 40000,
      paidBy: "Asha",
      paidMarked: true,
      payLink: upiPayLink(
        40000,
        "Dinner at the beach shack: Fish for the grill",
      ),
    },
    {
      costId: "4a4b4c4d-0004-4a00-8a00-0000000000e2",
      label: "Boat to the beach",
      startsAt: WEEK,
      amountMinor: 15000,
      paidBy: "Asha",
      paidMarked: false,
      payLink: upiPayLink(
        15000,
        "Dinner at the beach shack: Boat to the beach",
      ),
    },
  ];
  const started = (): PlanView => ({
    ...decidedPlanView("member", guestMe("Ravi")),
    canReply: false,
    earlierShares: earlier,
  });

  it("draws no pay button for a share with no payee of its own, and says who to ask", () => {
    routes({});
    draw(started());
    expect(
      screen.getByRole("heading", { name: "Earlier weeks" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Boat to the beach\. Your share: ₹150, paid by Asha\./),
    ).toBeInTheDocument();
    // This week's share has its pay button; last week's has none.
    expect(screen.queryByRole("link", { name: "Pay ₹150 by UPI" })).toBeNull();
    expect(
      screen.getAllByText("Ask Asha for their UPI ID.").length,
    ).toBeGreaterThan(0);
  });

  it("marks one paid with that week's whole set and nothing of this week's", async () => {
    const sent = routes({
      reply: () =>
        HttpResponse.json({
          ...started(),
          earlierShares: earlier.map((s) => ({ ...s, paidMarked: true })),
        }),
    });
    draw(started());
    await userEvent.click(
      screen.getByRole("button", { name: "I've paid this share" }),
    );
    await waitFor(() =>
      expect(screen.getAllByText("You marked this paid.")).toHaveLength(2),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].body.reply).toEqual({
      paid: [earlier[0].costId, earlier[1].costId],
    });
    expect(JSON.stringify(sent[0].body.reply)).not.toContain(PLAN_IDS.costs[0]);
  });
});
