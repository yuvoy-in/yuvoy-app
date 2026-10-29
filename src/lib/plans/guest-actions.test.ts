import { describe, it, expect, vi } from "vitest";
import {
  decidedPlanView,
  guestMe,
  openPlanView,
  PLAN_IDS,
} from "../../../mocks/plan-fixtures";
import type { GuestAnswer, GuestBodies, GuestRoute } from "./guest-calls";
import {
  guestActions,
  type GuestActionsInput,
  type SendGuest,
} from "./guest-actions";
import type { PlanView } from "./types";

/**
 * The guest's actions (yuvoy-mobile#373), against a stand-in for the route
 * handlers that keeps what it was sent: the first name and the nonce go on
 * a first reply and only then, the nonce stays the same across sends of
 * one form and changes only after "send again", an empty name costs no
 * request, and nothing that did not answer is ever read as sent.
 */

const TOKEN = `yp_${"T".repeat(40)}a-_`;
const REPLY = {
  answers: [{ optionId: PLAN_IDS.times[0], answer: "can" as const }],
  claims: [],
  paid: [],
};

type Sent = { route: GuestRoute; body: GuestBodies[GuestRoute] };

function setup(
  over: Partial<GuestActionsInput> & {
    answers?: GuestAnswer[];
    throws?: boolean;
  } = {},
) {
  const sent: Sent[] = [];
  const answers = [...(over.answers ?? [])];
  const send: SendGuest = async (route, body) => {
    sent.push({ route, body });
    if (over.throws) throw new TypeError("Failed to fetch");
    return (
      answers.shift() ?? {
        status: 200,
        body: openPlanView("member", guestMe()),
      }
    );
  };
  let plan: PlanView | null = over.current ? over.current() : openPlanView();
  let n = 0;
  const onPlan = vi.fn((p: PlanView) => {
    plan = p;
  });
  const onNameRefused = vi.fn();
  const actions = guestActions(
    {
      token: TOKEN,
      current: () => plan,
      firstName: over.firstName ?? (() => "Ravi"),
      signedIn: over.signedIn ?? (() => false),
      onPlan,
      onNameRefused,
    },
    send,
    () => `nonce_${++n}`.padEnd(24, "x"),
  );
  return { actions, sent, onPlan, onNameRefused };
}

const conflict = (reason: string): GuestAnswer => ({
  status: 409,
  body: {
    error: { code: "conflict", message: "Send again.", details: { reason } },
  },
});

describe("a first reply", () => {
  it("carries the typed first name and the form's nonce, with the token in the body", async () => {
    const { actions, sent } = setup({ firstName: () => "  Ravi " });
    await actions.reply(REPLY);
    expect(sent[0].route).toBe("reply");
    expect(sent[0].body).toEqual({
      token: TOKEN,
      seriesId: PLAN_IDS.series,
      nonce: "nonce_1".padEnd(24, "x"),
      reply: { ...REPLY, name: "Ravi" },
    });
  });

  it("sends the same nonce again after no answer, so a retry is the same guest", async () => {
    const { actions, sent } = setup({ throws: true });
    const first = await actions.reply(REPLY);
    expect(first).toMatchObject({ kind: "refused", code: "network" });
    await actions.reply(REPLY);
    const nonces = sent.map((s) => (s.body as GuestBodies["reply"]).nonce);
    expect(nonces[0]).toBe(nonces[1]);
  });

  it("makes a new nonce after send again, for the next send", async () => {
    const { actions, sent } = setup({ answers: [conflict("nonce")] });
    const refused = await actions.reply(REPLY);
    expect(refused).toMatchObject({
      kind: "refused",
      code: "conflict",
      reason: "nonce",
    });
    await actions.reply(REPLY);
    const nonces = sent.map((s) => (s.body as GuestBodies["reply"]).nonce);
    expect(nonces[1]).not.toBe(nonces[0]);
    expect(nonces[1]).toBe("nonce_2".padEnd(24, "x"));
  });

  it("asks for a name before any request when there is no session", async () => {
    const { actions, sent, onNameRefused } = setup({ firstName: () => "   " });
    const result = await actions.reply(REPLY);
    expect(result).toEqual({
      kind: "refused",
      code: "invalid_input",
      reason: "name",
      message: "Use your first name, in letters only.",
    });
    expect(sent).toHaveLength(0);
    expect(onNameRefused).toHaveBeenLastCalledWith(
      "Use your first name, in letters only.",
    );
  });

  it("puts the API's own name sentence under the box", async () => {
    const { actions, onNameRefused } = setup({
      firstName: () => "R2D2",
      answers: [
        {
          status: 400,
          body: {
            error: {
              code: "invalid_input",
              message: "Check the form.",
              details: { name: "Use your first name, in letters only." },
            },
          },
        },
      ],
    });
    const result = await actions.reply(REPLY);
    expect(result).toMatchObject({ kind: "refused", reason: "name" });
    expect(onNameRefused).toHaveBeenLastCalledWith(
      "Use your first name, in letters only.",
    );
  });

  it("lets a signed-in guest leave the name out: the API uses the profile's", async () => {
    const { actions, sent } = setup({
      firstName: () => "",
      signedIn: () => true,
    });
    await actions.reply(REPLY);
    expect((sent[0].body as GuestBodies["reply"]).reply).toEqual(REPLY);
  });

  it("hands the answered plan to the page, and no key with it", async () => {
    const answered = {
      ...openPlanView("member", guestMe()),
      guestKey: `ypk_${"K".repeat(43)}`,
    };
    const { actions, onPlan } = setup({
      answers: [{ status: 201, body: answered }],
    });
    const result = await actions.reply(REPLY);
    expect(result.kind).toBe("ok");
    expect(onPlan).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(onPlan.mock.calls[0][0])).not.toContain("ypk_");
  });
});

describe("a later reply", () => {
  it("sends neither name nor nonce: the cookie says who this is", async () => {
    const { actions, sent } = setup({
      current: () => openPlanView("member", guestMe()),
      firstName: () => "",
    });
    await actions.reply(REPLY);
    expect(sent[0].body).toEqual({
      token: TOKEN,
      seriesId: PLAN_IDS.series,
      reply: REPLY,
    });
  });
});

describe("the other actions", () => {
  it("removes the reply, and a 204 is gone", async () => {
    const { actions, sent } = setup({
      answers: [{ status: 204, body: undefined }],
    });
    expect(await actions.leave()).toEqual({ kind: "gone" });
    expect(sent[0]).toEqual({
      route: "leave",
      body: { token: TOKEN, seriesId: PLAN_IDS.series },
    });
  });

  it("reports from the not-working page, with no series to name", async () => {
    const { actions, sent } = setup({
      current: () => null,
      answers: [{ status: 202, body: undefined }],
    });
    expect(await actions.report({ reason: "spam" })).toEqual({ kind: "sent" });
    expect(sent[0].body).toEqual({ token: TOKEN, report: { reason: "spam" } });
  });

  it("links the reply to the account", async () => {
    const linked = openPlanView("member", guestMe("Ravi", { linked: true }));
    const { actions, sent, onPlan } = setup({
      answers: [{ status: 200, body: linked }],
    });
    expect((await actions.link()).kind).toBe("ok");
    expect(sent[0].route).toBe("link");
    expect(onPlan).toHaveBeenCalledWith(linked);
  });

  it("marks an earlier week paid with that week's ids alone", async () => {
    const { actions, sent } = setup({
      current: () => decidedPlanView("member", guestMe()),
    });
    await actions.payEarlier(["4a4b4c4d-0004-4a00-8a00-0000000000e1"]);
    expect(sent[0]).toEqual({
      route: "reply",
      body: {
        token: TOKEN,
        seriesId: PLAN_IDS.series,
        reply: { paid: ["4a4b4c4d-0004-4a00-8a00-0000000000e1"] },
      },
    });
  });
});
