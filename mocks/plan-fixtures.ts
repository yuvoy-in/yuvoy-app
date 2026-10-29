import type { components } from "../src/lib/api/schema.gen";

type PlanView = components["schemas"]["PlanView"];
type PlanCost = components["schemas"]["PlanCost"];
type PlanMe = components["schemas"]["PlanMe"];
type PlanReply = components["schemas"]["PlanReply"];
type PlanPersonReply = components["schemas"]["PlanPersonReply"];

/**
 * Plans as the API answers them (contract ad4fa894), for the signed-in plan
 * page (yuvoy-app#193), the guest page by link (yuvoy-mobile#373) and both
 * pages' tests and e2e specs.
 *
 * The names and the data match the stand-in the guest page's branch wrote
 * before this module existed (`plan-link-fixtures.ts` on that branch): the
 * same `PLAN_IDS`, `PLAN_PAYEE`, `upiPayLink`, `guestMe`, `openPlanView`,
 * `decidedPlanView` and `cancelledPlanView`, with the same values. So at the
 * merge that file can go and its imports point here, and nothing either
 * page's tests assert on moves.
 *
 * Everything is built fresh on each call. A handler that edits a shared
 * object (a claim, a reply) would otherwise carry one test's reply into the
 * next.
 *
 * Every person is a first name, as the contract promises: no phone number,
 * email or id of anybody appears in a plan, and a fixture that showed one
 * would let a screen that renders it pass.
 */

/** Fixed ids, so a test and an e2e spec can name a time, an item or a cost. */
export const PLAN_IDS = {
  /** The weekly series both plans belong to. The guest key cookie is named after it. */
  series: "5e7a1c2d-0b3f-4a61-9c8e-2f4d6b8a0c11",
  open: "8d2f6a10-3c4b-4e5f-8a9b-0c1d2e3f4a51",
  decided: "8d2f6a10-3c4b-4e5f-8a9b-0c1d2e3f4a52",
  /** A well-formed id no plan has: the API's 404. */
  unknown: "8d2f6a10-3c4b-4e5f-8a9b-0c1d2e3f4a5f",
  times: [
    "1a1b1c1d-0001-4a00-8a00-000000000001",
    "1a1b1c1d-0001-4a00-8a00-000000000002",
    "1a1b1c1d-0001-4a00-8a00-000000000003",
  ],
  ideas: [
    "2a2b2c2d-0002-4a00-8a00-000000000001",
    "2a2b2c2d-0002-4a00-8a00-000000000002",
  ],
  items: [
    "3a3b3c3d-0003-4a00-8a00-000000000001",
    "3a3b3c3d-0003-4a00-8a00-000000000002",
    "3a3b3c3d-0003-4a00-8a00-000000000003",
  ],
  costs: [
    "4a4b4c4d-0004-4a00-8a00-000000000001",
    "4a4b4c4d-0004-4a00-8a00-000000000002",
  ],
} as const;

/** The planner's UPI details, shown to members and never to a visitor. */
export const PLAN_PAYEE = { upiId: "asha@okaxis", name: "Asha R" } as const;

/**
 * The share link exactly as the API writes it (`internal/upi/upi.go`): each
 * value escaped with spaces as `%20`, the amount as rupees with two decimals.
 * Built here rather than written out, so a fixture whose amount and link
 * disagree cannot exist. Written out longhand rather than with the page's own
 * `upiAmount`: a fixture made by the checker's own code would agree with the
 * checker whatever the checker did.
 */
export function upiPayLink(amountMinor: number, note: string): string {
  // As Go's `url.QueryEscape` writes it: `encodeURIComponent` leaves `!'()*`
  // raw, which the API never sends and the pay-link check refuses.
  const enc = (s: string) =>
    encodeURIComponent(s).replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  const rupees = `${Math.floor(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, "0")}`;
  return (
    `upi://pay?pa=${enc(PLAN_PAYEE.upiId)}&pn=${enc(PLAN_PAYEE.name)}` +
    `&am=${rupees}&cu=INR&tn=${enc(note)}`
  );
}

/** Three Saturday evenings, in Asia/Kolkata, after the mock clock's start. */
const TIMES = [
  "2026-08-22T13:30:00.000Z",
  "2026-08-29T13:30:00.000Z",
  "2026-09-05T13:30:00.000Z",
] as const;

type Role = PlanView["role"];

function common(id: string, role: Role) {
  return {
    id,
    seriesId: PLAN_IDS.series,
    title: "Dinner at the beach shack",
    templateKey: "dinner" as const,
    role,
    timeZone: "Asia/Kolkata",
    planner: { name: "Asha" },
    placeText: "Full Moon Cafe, Havelock",
    mapUrl: "https://maps.app.goo.gl/FullMoonCafeHavelock",
    note: "Bring a torch for the walk back.",
    gettingHome: "Last ferry is at 4pm, so we stay over.",
    repeatWeekly: false,
    payeeSet: true,
    linkExpiresAt: "2026-09-12T18:30:00.000Z",
  };
}

/** The guest's own reply, once there is one. `name` is the first name they typed. */
export function guestMe(
  name = "Ravi",
  overrides: Partial<PlanMe> = {},
): PlanMe {
  return {
    name,
    answers: [
      { optionId: PLAN_IDS.times[0], answer: "can" },
      { optionId: PLAN_IDS.ideas[1], answer: "vote" },
    ],
    claims: [PLAN_IDS.items[1]],
    paid: [],
    adultConfirmed: true,
    done: false,
    linked: false,
    ...overrides,
  };
}

/**
 * A signed-in member's own reply: the same as a guest's, but it belongs to
 * an account (`linked`), which is what a member reading `/plans/{id}` is.
 */
export function memberMe(overrides: Partial<PlanMe> = {}): PlanMe {
  return guestMe("Ravi", { linked: true, ...overrides });
}

/**
 * An open plan: three times, two ideas, a bring list of three, and one
 * cost not split yet. `role` decides what the reader may see, as the API
 * decides it: a visitor gets no `payee`, no `me` and no `costs[].mine`.
 */
export function openPlanView(
  role: Role = "visitor",
  me: PlanMe | null = null,
): PlanView {
  const member = role !== "visitor";
  const iAmIn = member && me !== null;
  const myName = me?.name ?? "";
  const canNames = ["Asha", "Meera", ...(iAmIn ? [myName] : [])];
  const cost: PlanCost = {
    id: PLAN_IDS.costs[0],
    label: "Fish for the grill",
    amountMinor: 180000,
    currency: "INR",
    paidBy: "Asha",
    split: false,
    paidCount: 0,
    shareCount: 0,
  };
  return {
    ...common(PLAN_IDS.open, role),
    state: "open",
    times: [
      {
        id: PLAN_IDS.times[0],
        startsAt: TIMES[0],
        counts: { can: canNames.length, maybe: 1, cant: 0 },
        names: { can: canNames, maybe: ["Kiran"] },
      },
      {
        id: PLAN_IDS.times[1],
        startsAt: TIMES[1],
        counts: { can: 1, maybe: 0, cant: 2 },
        names: { can: ["Asha"], cant: ["Meera", "Kiran"] },
      },
      {
        id: PLAN_IDS.times[2],
        startsAt: TIMES[2],
        counts: { can: 0, maybe: 1, cant: 0 },
        names: { maybe: ["Meera"] },
      },
    ],
    ideas: [
      {
        id: PLAN_IDS.ideas[0],
        title: "Grill on the beach",
        source: { kind: "text" },
        votes: 2,
        names: ["Asha", "Kiran"],
        mine: false,
      },
      {
        id: PLAN_IDS.ideas[1],
        title: "Dinner at the shack",
        source: { kind: "text" },
        votes: iAmIn ? 2 : 1,
        names: ["Meera", ...(iAmIn ? [myName] : [])],
        mine: iAmIn,
      },
    ],
    items: [
      {
        id: PLAN_IDS.items[0],
        label: "Charcoal",
        claimedBy: "Kiran",
        mine: false,
      },
      {
        id: PLAN_IDS.items[1],
        label: "Speaker",
        ...(iAmIn ? { claimedBy: myName } : {}),
        mine: iAmIn,
      },
      { id: PLAN_IDS.items[2], label: "Paper plates", mine: false },
    ],
    costs: [cost],
    people: [
      {
        name: "Asha",
        role: "planner",
        reply: "answered",
        you: role === "planner",
      },
      { name: "Meera", role: "guest", reply: "answered", you: false },
      { name: "Kiran", role: "guest", reply: "answered", you: false },
      ...(iAmIn
        ? [
            {
              name: myName,
              role: "guest" as const,
              reply: "answered" as const,
              you: true,
            },
          ]
        : []),
    ],
    canReply: true,
    answersCloseAt: TIMES[2],
    ...(member ? { payee: { ...PLAN_PAYEE } } : {}),
    ...(iAmIn ? { me } : {}),
  };
}

/**
 * The same evening once Asha picked the first time: shares frozen, the
 * caller's own share carrying a pay link a member may open. The planner
 * paid both costs, so on the planner's own view neither share has a link
 * (the contract: "absent on the payer's own share").
 */
export function decidedPlanView(
  role: Role = "member",
  me: PlanMe | null = role === "member" ? guestMe() : null,
): PlanView {
  const member = role === "member";
  const iAmIn = member && me !== null;
  const myName = me?.name ?? "";
  const note = "Dinner at the beach shack";
  const share = (amountMinor: number) =>
    iAmIn
      ? {
          mine: {
            amountMinor,
            paidMarked: false,
            receivedMarked: false,
            payLink: upiPayLink(amountMinor, note),
          },
        }
      : {};
  const costs: PlanCost[] = [
    {
      id: PLAN_IDS.costs[0],
      label: "Fish for the grill",
      amountMinor: 180000,
      currency: "INR",
      paidBy: "Asha",
      split: true,
      paidCount: 1,
      shareCount: 4,
      ...share(45000),
    },
    {
      id: PLAN_IDS.costs[1],
      label: "Boat to the beach",
      amountMinor: 60000,
      currency: "INR",
      paidBy: "Asha",
      split: true,
      paidCount: 0,
      shareCount: 4,
      ...share(15000),
    },
  ];
  const open = openPlanView(role, me);
  return {
    ...open,
    id: PLAN_IDS.decided,
    state: "decided",
    decidedTimeId: PLAN_IDS.times[0],
    decidedIdeaId: PLAN_IDS.ideas[1],
    times: [open.times[0]],
    costs,
    people: [
      {
        name: "Asha",
        role: "planner",
        reply: "going",
        you: role === "planner",
      },
      { name: "Meera", role: "guest", reply: "going", you: false },
      { name: "Kiran", role: "guest", reply: "maybe", you: false },
      ...(iAmIn
        ? [
            {
              name: myName,
              role: "guest" as const,
              reply: "going" as const,
              you: true,
            },
          ]
        : []),
    ],
    answersCloseAt: TIMES[0],
  };
}

/** A plan the planner cancelled: it still answers, so the guest is told. */
export function cancelledPlanView(role: Role = "visitor"): PlanView {
  return { ...openPlanView(role), state: "cancelled", canReply: false };
}

/**
 * The planner's own view of the decided plan: no `me` to answer with and no
 * share to pay (they paid), so no Leave control and no pay button. Planner
 * tools are a later part; this is the view the signed-in page must not break
 * on before they exist.
 */
export function plannerPlanView(): PlanView {
  return decidedPlanView("planner", null);
}

/**
 * The decided plan with the caller's pay link pointing at somebody else's
 * UPI ID: what the page must refuse to turn into a button, while the UPI ID
 * and the amount it does show stay right (yuvoy-app#193, R7-c section 3).
 */
export function payLinkTamperedView(): PlanView {
  const view = decidedPlanView("member", memberMe());
  for (const cost of view.costs) {
    if (cost.mine?.payLink) {
      cost.mine.payLink = cost.mine.payLink.replace(
        `pa=${encodeURIComponent(PLAN_PAYEE.upiId)}`,
        `pa=${encodeURIComponent("someone.else@okaxis")}`,
      );
    }
  }
  return view;
}

/**
 * A plan with a reply applied, as the API answers `PUT /plans/{id}/reply`.
 *
 * Applied to a view built for the same reader, so only what the reply moves
 * is recomputed: this reader's name in each time's and idea's lists (and the
 * counts from them), the items they hold, their paid marks, their row in
 * the people list and their `me`. An item somebody else already holds stays
 * theirs and comes back in `notClaimed`, by id, which is how the API says a
 * claim lost a race. Answers, claims and paid are complete sets, so anything
 * the reply leaves out is cleared, exactly as the contract says.
 *
 * A paid-only reply (only `paid`) moves the paid marks and nothing else.
 */
export function withReply(view: PlanView, reply: PlanReply): PlanView {
  // A plan is JSON, so a JSON copy is a whole one, in any runtime the mocks run in.
  const next: PlanView = JSON.parse(JSON.stringify(view));
  const me: PlanMe = next.me ?? {
    name: reply.name ?? "Ravi",
    answers: [],
    claims: [],
    paid: [],
    adultConfirmed: reply.adult === true,
    done: false,
    linked: false,
  };
  const name = me.name;
  const paidOnly =
    reply.name === undefined &&
    reply.adult === undefined &&
    reply.answers === undefined &&
    reply.claims === undefined;

  const paid = new Set(reply.paid ?? []);
  for (const cost of next.costs) {
    if (!cost.mine) continue;
    const was = cost.mine.paidMarked;
    cost.mine.paidMarked = paid.has(cost.id);
    cost.paidCount += Number(cost.mine.paidMarked) - Number(was);
  }
  me.paid = next.costs.filter((c) => c.mine?.paidMarked).map((c) => c.id);

  if (paidOnly) {
    next.me = me;
    return next;
  }

  const answers = reply.answers ?? [];
  const answerFor = (id: string) =>
    answers.find((a) => a.optionId === id)?.answer;

  for (const time of next.times) {
    const lists: Record<"can" | "maybe" | "cant", string[]> = {
      can: (time.names.can ?? []).filter((n) => n !== name),
      maybe: (time.names.maybe ?? []).filter((n) => n !== name),
      cant: (time.names.cant ?? []).filter((n) => n !== name),
    };
    const answer = answerFor(time.id);
    if (answer && answer !== "vote") lists[answer].push(name);
    time.names = lists;
    time.counts = {
      can: lists.can.length,
      maybe: lists.maybe.length,
      cant: lists.cant.length,
    };
  }

  for (const idea of next.ideas) {
    idea.names = idea.names.filter((n) => n !== name);
    idea.mine = answerFor(idea.id) === "vote";
    if (idea.mine) idea.names.push(name);
    idea.votes = idea.names.length;
  }

  const claims = new Set(reply.claims ?? []);
  const notClaimed: string[] = [];
  for (const item of next.items) {
    if (item.mine && !claims.has(item.id)) {
      delete item.claimedBy;
      item.mine = false;
    } else if (claims.has(item.id) && !item.mine) {
      if (item.claimedBy) notClaimed.push(item.id);
      else {
        item.claimedBy = name;
        item.mine = true;
      }
    }
  }
  me.claims = next.items.filter((i) => i.mine).map((i) => i.id);
  me.answers = answers;
  if (reply.adult) me.adultConfirmed = true;

  // Decided, the answer for the decided time; before, answered or none.
  const decided = next.decidedTimeId
    ? answerFor(next.decidedTimeId)
    : undefined;
  const reading: PlanPersonReply = next.decidedTimeId
    ? decided === "can"
      ? "going"
      : decided === "maybe" || decided === "cant"
        ? decided
        : "none"
    : answers.length > 0
      ? "answered"
      : "none";
  const row = next.people.find((p) => p.you);
  if (row) row.reply = reading;
  else next.people.push({ name, role: "guest", reply: reading, you: true });

  next.me = me;
  if (next.role === "visitor") next.role = "member";
  if (notClaimed.length > 0) next.notClaimed = notClaimed;
  else delete next.notClaimed;
  return next;
}
