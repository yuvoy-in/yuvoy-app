import type { components } from "../src/lib/api/schema.gen";

type PlanView = components["schemas"]["PlanView"];
type PlanCost = components["schemas"]["PlanCost"];
type PlanMe = components["schemas"]["PlanMe"];

/**
 * Plans as a friend holding the link sees them (yuvoy-mobile#373), for the
 * by-link mocks in `plan-link-handlers.ts` and the guest page's tests.
 *
 * STANDS IN FOR PART OF `plan-fixtures.ts`. The signed-in plan page
 * (yuvoy-app#193) owns that module and its names: `PLAN_IDS` and one builder
 * per plan. This branch was cut before it existed, so the same names are
 * written here against the same contract, and the two are reconciled at the
 * merge: whichever module keeps the builders, the other imports them. Until
 * then nothing outside the by-link mocks imports this file.
 *
 * Everything is built fresh on each call. A handler that edits a shared
 * object (a claim, a reply) would otherwise carry one test's reply into the
 * next.
 *
 * Every person is a first name, as the contract promises: no phone number,
 * email or id of anybody appears in a plan by link, and a fixture that showed
 * one would let a screen that renders it pass.
 */

/** Fixed ids, so a test and an e2e spec can name a time, an item or a cost. */
export const PLAN_IDS = {
  /** The weekly series both plans belong to. The guest key cookie is named after it. */
  series: "5e7a1c2d-0b3f-4a61-9c8e-2f4d6b8a0c11",
  open: "8d2f6a10-3c4b-4e5f-8a9b-0c1d2e3f4a51",
  decided: "8d2f6a10-3c4b-4e5f-8a9b-0c1d2e3f4a52",
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
 * The share link exactly as the API writes it (`internal/upi/upi.go`): the
 * query escaped with spaces as `%20`, and the amount as rupees with two
 * decimals. Built here rather than written out, so a fixture whose amount
 * and link disagree cannot exist.
 */
export function upiPayLink(amountMinor: number, note: string): string {
  const enc = (s: string) => encodeURIComponent(s);
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
    note: "Bring a torch for the walk back.",
    gettingHome: "Last ferry is at 4pm, so we stay over.",
    repeatWeekly: false,
    payeeSet: true,
    linkExpiresAt: "2026-09-12T18:30:00.000Z",
  };
}

/** The guest's own reply, once there is one. `name` is the first name they typed. */
export function guestMe(name = "Ravi", overrides: Partial<PlanMe> = {}): PlanMe {
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
      { id: PLAN_IDS.items[0], label: "Charcoal", claimedBy: "Kiran", mine: false },
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
      { name: "Asha", role: "planner", reply: "answered", you: role === "planner" },
      { name: "Meera", role: "guest", reply: "answered", you: false },
      { name: "Kiran", role: "guest", reply: "answered", you: false },
      ...(iAmIn
        ? [{ name: myName, role: "guest" as const, reply: "answered" as const, you: true }]
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
 * caller's own share carrying a pay link a member may open, and the other
 * cost paid by the caller so its share has no link at all (the contract:
 * "absent on the payer's own share").
 */
export function decidedPlanView(
  role: Role = "member",
  me: PlanMe | null = role === "member" ? guestMe() : null,
): PlanView {
  const member = role !== "visitor";
  const iAmIn = member && me !== null;
  const myName = me?.name ?? "";
  const note = "Dinner at the beach shack";
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
      ...(iAmIn
        ? {
            mine: {
              amountMinor: 45000,
              paidMarked: false,
              receivedMarked: false,
              payLink: upiPayLink(45000, note),
            },
          }
        : {}),
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
      ...(iAmIn
        ? {
            mine: {
              amountMinor: 15000,
              paidMarked: false,
              receivedMarked: false,
              payLink: upiPayLink(15000, note),
            },
          }
        : {}),
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
      { name: "Asha", role: "planner", reply: "going", you: role === "planner" },
      { name: "Meera", role: "guest", reply: "going", you: false },
      { name: "Kiran", role: "guest", reply: "maybe", you: false },
      ...(iAmIn
        ? [{ name: myName, role: "guest" as const, reply: "going" as const, you: true }]
        : []),
    ],
    answersCloseAt: TIMES[0],
  };
}

/** A plan the planner cancelled: it still answers, so the guest is told. */
export function cancelledPlanView(role: Role = "visitor"): PlanView {
  return { ...openPlanView(role), state: "cancelled", canReply: false };
}
