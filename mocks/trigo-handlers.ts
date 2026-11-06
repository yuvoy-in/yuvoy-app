import { http, HttpResponse, delay } from "msw";
import type { components } from "../src/lib/api/schema.gen";
import { mockHeaders, mockNow } from "./fixtures";
import {
  TRIGO_CARD_SCENARIOS,
  trigoCardFor,
  trigoCardHandlers,
} from "./trigo-card-handlers";
import {
  TRIGO_REPLY_SCENARIOS,
  replyExtrasFor,
  trigoReplyHandlers,
} from "./trigo-reply-handlers";
import {
  TRIGO_LIST_SCENARIOS,
  __resetTrigoListMocks,
} from "./trigo-list-handlers";

/**
 * Trigo, the chat (yuvoy-app#223, R5-T5, yuvoy-mobile#356): the turn, the
 * chats, a chat's messages, the read mark, the notice and `PUT /me/age`.
 *
 * With no scenario `trigo` is `off`, as in production, and the turn and the
 * notice's accept answer `404`. Each scenario below but `trigo-not-released`
 * opens it at `staff` (and `GET /me` answers `cohort: staff`):
 *
 *   - `trigo-reply`: every message gets `REPLY_TEXT`, outcome `answered`,
 *     with `remainingToday` counting down from 19.
 *   - `trigo-fixed-reply`: the server's `timed_out` reply, with
 *     `handoffOffer` true.
 *   - `trigo-limit`: the chat reads 3 left today, and a turn is
 *     `429 daily_limit_reached` with `details.resetsAt`, the next midnight in
 *     India.
 *   - `trigo-continue`: an earlier chat, closed, with the id
 *     `TRIGO_CLOSED_CHAT_ID`, and the open chat of `trigo-limit` with 20 left.
 *     A turn that names the closed chat goes on in the open one, and its
 *     answer names the open chat's id, as the API does.
 *   - `trigo-slow`: as `trigo-reply`, 20 seconds late (under the 30 s
 *     write stall, so it is an answer and not a timeout). The same key sent
 *     again while it is out is `409 idempotency_in_progress` with
 *     `Retry-After: 2`, as the API answers it.
 *   - `trigo-down`: `503 unavailable`.
 *   - `trigo-consent`: the notice is not accepted yet, and a turn is
 *     `409 consent_required` until `POST /trigo/consent` takes the version in
 *     force.
 *   - `trigo-age`: a turn is `403 adult_confirmation_required` until
 *     `PUT /me/age` is `200`; then it is answered.
 *   - `trigo-busy`: `409 turn_in_progress`, with no `Retry-After`, as the
 *     API answers it.
 *   - `trigo-fast`: a turn is `429 rate_limited` with `Retry-After: 1`, the
 *     API's turn limiter (yuvoy-api#598). It stands before every other check
 *     of the turn, as the limiter stands in front of the route. Its day limit
 *     is `trigo-limit`, which sends no `Retry-After`.
 *   - `trigo-not-released`: `trigo` stays `off`, so the turn and accept are
 *     `404`. The reads are not behind the release, as in the API.
 *   - `trigo-card-*`: as `trigo-reply`, and each reply carries a confirm card
 *     (yuvoy-app#223 part 2). See `trigo-card-handlers.ts`.
 *   - `trigo-reply-cards`, `trigo-reply-link`, `trigo-reply-link-ended`: as
 *     `trigo-reply`, with cards or a link note on each reply, and the
 *     hand-off (yuvoy-app#223 (b) and (c)). See `trigo-reply-handlers.ts`.
 *   - `trigo-lists*`: the date alerts and trip drafts (yuvoy-app#220). See
 *     `trigo-list-handlers.ts`.
 *
 * Chats are kept per scenario and session (the `Authorization` header), so
 * two e2e projects signed in as different numbers never see each other's.
 */

type TrigoMessage = components["schemas"]["TrigoMessage"];
type TrigoTurnResult = components["schemas"]["TrigoTurnResult"];
type TrigoConversation = components["schemas"]["TrigoConversation"];
type TrigoTeam = components["schemas"]["TrigoTeam"];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const url = (p: string) => `${BASE}${p}`;

let requestSeq = 0;
const rid = () =>
  `01J${(++requestSeq).toString(36).toUpperCase().padStart(6, "0")}TRGO`;

function envelope(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  return HttpResponse.json(
    {
      error: {
        code,
        message,
        requestId: rid(),
        ...(details ? { details } : {}),
      },
    },
    { status, headers: { ...mockHeaders(rid()), ...headers } },
  );
}

function scenarioOf(request: Request): string {
  return (
    request.headers.get("x-yuvoy-scenario") ??
    new URL(request.url).searchParams.get("__scenario") ??
    "ok"
  );
}

/** Every scenario of this file. See above for each. */
export const TRIGO_SCENARIOS: ReadonlySet<string> = new Set([
  "trigo-reply",
  "trigo-fixed-reply",
  "trigo-limit",
  "trigo-continue",
  "trigo-slow",
  "trigo-down",
  "trigo-consent",
  "trigo-age",
  "trigo-busy",
  "trigo-fast",
  "trigo-not-released",
  ...TRIGO_CARD_SCENARIOS,
  ...TRIGO_REPLY_SCENARIOS,
  ...TRIGO_LIST_SCENARIOS,
]);

/** The stage a scenario gives `trigo`; null is `off`. */
export function trigoStageOf(scenario: string): "staff" | null {
  return TRIGO_SCENARIOS.has(scenario) && scenario !== "trigo-not-released"
    ? "staff"
    : null;
}

/** Whether `GET /me` answers `cohort: staff` under the scenario. */
export function trigoStaffCohort(scenario: string): boolean {
  return trigoStageOf(scenario) !== null;
}

/** The notice in force, as the contract's example names it. */
export const TRIGO_NOTICE_VERSION = "2026-11-r5";

/** yuvoy-mobile#356's notice, word for word. */
export const TRIGO_NOTICE_TEXT =
  "Trigo is an AI assistant. It answers only from what is listed on Yuvoy, and it can be wrong, so check the card before you go. Your messages are processed by our AI provider in India. We delete each message 90 days after it was sent. A person on our team reads a chat when you ask for help, when you report an answer, when we look into a safety concern, when the law asks us to, and in a small sample to check answers are right.";

/** The fake answer of `trigo-reply` (yuvoy-mobile#356). */
export const REPLY_TEXT =
  "On Saturday morning the Sunrise Kayak Trip leaves from the beach at six.";

/** The server's `timed_out` reply (yuvoy-mobile#356). */
export const TIMED_OUT_TEXT =
  "I couldn't finish that in time. Try again, or ask the team.";

/** The closed chat of `trigo-continue`, to open with `?trigo=` in e2e. */
export const TRIGO_CLOSED_CHAT_ID = "3b9e2f4a-6c1d-4e8b-9a7f-2d5c8e1b4f60";

const NOT_RELEASED = "Trigo isn't open to your account yet.";
const NO_CHAT = "We could not find that chat.";
const DAILY = 20;

const TEAM: TrigoTeam = { state: "none", openNow: true };

interface OwnChat {
  conversation: TrigoConversation;
  messages: TrigoMessage[];
}

interface TrigoState {
  conversation: TrigoConversation | null;
  messages: TrigoMessage[];
  /** The traveller's earlier chats, closed. */
  earlier: OwnChat[];
  seq: number;
  remaining: number;
  consentAccepted: boolean;
  ageConfirmed: boolean;
  /** Idempotency-Key to the text it carried and the stored turn. */
  keys: Map<string, { text: string; result: TrigoTurnResult }>;
  /** Keys whose turn is still being answered (`trigo-slow`). */
  inFlight: Set<string>;
}

const states = new Map<string, TrigoState>();

function stateOf(request: Request, auth: string): TrigoState {
  const scenario = scenarioOf(request);
  const key = `${scenario}|${auth}`;
  let state = states.get(key);
  if (!state) {
    state = {
      conversation: null,
      messages: [],
      earlier: [],
      seq: 0,
      remaining: scenario === "trigo-limit" ? 3 : DAILY,
      consentAccepted: scenario !== "trigo-consent",
      ageConfirmed: scenario !== "trigo-age",
      keys: new Map(),
      inFlight: new Set(),
    };
    if (scenario === "trigo-continue") {
      const at = new Date(mockNow() - 2 * 24 * 60 * 60_000).toISOString();
      state.earlier.push({
        conversation: {
          id: TRIGO_CLOSED_CHAT_ID,
          state: "closed",
          startedAt: at,
          lastMessageAt: at,
          team: TEAM,
          unread: 0,
          textRemoved: false,
        },
        messages: [
          message(state, "traveller", "Kayaks near Calangute?", false),
          message(state, "trigo", REPLY_TEXT, false),
        ],
      });
      // Each chat counts its own messages from 1.
      state.seq = 0;
    }
    /*
      `trigo-limit` starts with a chat 17 answers into the day, so the read
      before the refused turn shows 3 left. `trigo-continue` has the same
      open chat.
    */
    if (scenario === "trigo-limit" || scenario === "trigo-continue") {
      const at = new Date(mockNow() - 10 * 60_000).toISOString();
      state.conversation = {
        id: uuid(),
        state: "open",
        startedAt: at,
        lastMessageAt: at,
        team: TEAM,
        unread: 0,
        textRemoved: false,
      };
      state.messages.push(
        message(state, "traveller", "What should I do this weekend?", false),
        message(state, "trigo", REPLY_TEXT, false),
      );
    }
    states.set(key, state);
  }
  return state;
}

/** The next midnight in India (UTC+05:30), as `resetsAt` is. */
function nextIndianMidnight(now: number): string {
  const offset = 5.5 * 60 * 60_000;
  const day = 24 * 60 * 60_000;
  const local = now + offset;
  return new Date(Math.floor(local / day) * day + day - offset).toISOString();
}

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * No session, or a recovery link rather than one (the verify handler mints
 * `sess_`): both are `401` in the API's words. Returns the header otherwise.
 */
function sessionOf(request: Request): string | Response {
  const auth = request.headers.get("authorization");
  if (!auth || !auth.includes("Bearer sess_")) {
    return envelope("unauthorized", "Sign in to ask Trigo.", 401);
  }
  return auth;
}

const KEY_SHAPE = /^[A-Za-z0-9_.:-]{16,128}$/;

function message(
  state: TrigoState,
  role: TrigoMessage["role"],
  text: string,
  handoffOffer: boolean,
): TrigoMessage {
  state.seq += 1;
  return {
    id: uuid(),
    seq: state.seq,
    role,
    text,
    createdAt: new Date(mockNow()).toISOString(),
    cards: [],
    safetyAnswer: null,
    handoffOffer,
    staffName: null,
    removed: false,
    linkNotChecked: null,
    actionCard: null,
  };
}

function listed(state: TrigoState): TrigoConversation | null {
  return state.conversation ? { ...state.conversation, unread: 0 } : null;
}

/** One of the traveller's own chats, the open one or an earlier one. */
function ownChat(state: TrigoState, id: string): OwnChat | null {
  const open = listed(state);
  if (open && open.id === id) {
    return { conversation: open, messages: state.messages };
  }
  return state.earlier.find((c) => c.conversation.id === id) ?? null;
}

export const trigoHandlers = [
  http.post(url("/trigo/turns"), async ({ request }) => {
    const auth = sessionOf(request);
    if (auth instanceof Response) return auth;
    const scenario = scenarioOf(request);
    if (trigoStageOf(scenario) === null) {
      return envelope("not_found", NOT_RELEASED, 404);
    }
    if (scenario === "trigo-fast") {
      return envelope(
        "rate_limited",
        "Too many trigo turns in a short time. Wait a moment and try again.",
        429,
        undefined,
        { "Retry-After": "1" },
      );
    }
    const key = request.headers.get("idempotency-key");
    if (!key || !KEY_SHAPE.test(key)) {
      return envelope(
        "idempotency_key_malformed",
        "Idempotency-Key must be 16-128 characters of A-Z a-z 0-9 _ . : -",
        400,
      );
    }
    const body = (await request.json().catch(() => null)) as {
      text?: unknown;
      conversationId?: unknown;
    } | null;
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (text.length === 0 || text.length > 1000) {
      return envelope(
        "invalid_input",
        "Check the message and send it again.",
        400,
        { text: "Between 1 and 1,000 characters." },
      );
    }
    const state = stateOf(request, auth);

    if (state.inFlight.has(key)) {
      return envelope(
        "idempotency_in_progress",
        "Trigo is still answering this message. Read the chat for the answer.",
        409,
        undefined,
        { "Retry-After": "2" },
      );
    }

    const stored = state.keys.get(key);
    if (stored) {
      if (stored.text !== text) {
        return envelope(
          "idempotency_key_reuse",
          "That Idempotency-Key was already used for another message.",
          409,
        );
      }
      return HttpResponse.json(stored.result, {
        headers: { ...mockHeaders(rid()), "Idempotent-Replay": "true" },
      });
    }

    /*
      Any chat of the traveller's own goes on in the open one, or in a new
      one when none is open, and the answer names that chat. Only an id
      that is not theirs is 404.
    */
    if (
      typeof body?.conversationId === "string" &&
      !ownChat(state, body.conversationId)
    ) {
      return envelope("not_found", NO_CHAT, 404);
    }
    if (!state.consentAccepted) {
      return envelope(
        "consent_required",
        "Read and accept the note about Trigo first.",
        409,
        { noticeVersion: TRIGO_NOTICE_VERSION },
      );
    }
    if (!state.ageConfirmed) {
      return envelope(
        "adult_confirmation_required",
        "Add your birth year to use Trigo.",
        403,
      );
    }
    if (scenario === "trigo-busy") {
      return envelope(
        "turn_in_progress",
        "Trigo is still answering your last message.",
        409,
      );
    }
    if (scenario === "trigo-down") {
      return envelope(
        "unavailable",
        "Trigo is not available right now. Try again later.",
        503,
      );
    }
    const resetsAt = nextIndianMidnight(mockNow());
    if (scenario === "trigo-limit" || state.remaining <= 0) {
      return envelope(
        "daily_limit_reached",
        "You've used today's 20 messages. You can ask again after midnight, or talk to a person.",
        429,
        { resetsAt },
      );
    }
    if (scenario === "trigo-slow") {
      state.inFlight.add(key);
      await delay(20_000);
      state.inFlight.delete(key);
    }

    const now = new Date(mockNow()).toISOString();
    if (!state.conversation) {
      state.conversation = {
        id: uuid(),
        state: "open",
        startedAt: now,
        lastMessageAt: now,
        team: TEAM,
        unread: 0,
        textRemoved: false,
      };
    }
    const fixed = scenario === "trigo-fixed-reply";
    const mine = message(state, "traveller", text, false);
    const reply = message(
      state,
      "trigo",
      fixed ? TIMED_OUT_TEXT : REPLY_TEXT,
      fixed,
    );
    reply.actionCard = trigoCardFor(scenario, mockNow());
    Object.assign(reply, replyExtrasFor(scenario));
    state.messages.push(mine, reply);
    state.remaining -= 1;
    state.conversation = { ...state.conversation, lastMessageAt: now };

    const result: TrigoTurnResult = {
      conversationId: state.conversation.id,
      turnId: uuid(),
      outcome: fixed ? "timed_out" : "answered",
      messages: [mine, reply],
      remainingToday: state.remaining,
      resetsAt,
      team: TEAM,
    };
    state.keys.set(key, { text, result });
    return HttpResponse.json(result, { headers: mockHeaders(rid()) });
  }),

  http.get(url("/trigo/conversations"), ({ request }) => {
    const auth = sessionOf(request);
    if (auth instanceof Response) return auth;
    const state = stateOf(request, auth);
    const open = listed(state);
    const earlier = state.earlier.map((c) => c.conversation);
    return HttpResponse.json(
      { conversations: open ? [open, ...earlier] : earlier },
      { headers: mockHeaders(rid()) },
    );
  }),

  http.get(url("/trigo/conversations/:id"), ({ request, params }) => {
    const auth = sessionOf(request);
    if (auth instanceof Response) return auth;
    const state = stateOf(request, auth);
    const chat = ownChat(state, String(params.id));
    if (!chat) return envelope("not_found", NO_CHAT, 404);
    const after = Number(new URL(request.url).searchParams.get("after") ?? 0);
    const messages =
      after > 0
        ? chat.messages.filter((m) => m.seq > after)
        : chat.messages.slice(-50);
    return HttpResponse.json(
      {
        conversation: chat.conversation,
        messages,
        more: false,
        hasOlder: after > 0 ? false : chat.messages.length > 50,
        remainingToday: state.remaining,
        resetsAt: nextIndianMidnight(mockNow()),
        pollAfterSeconds: 0,
      },
      { headers: mockHeaders(rid()) },
    );
  }),

  http.post(url("/trigo/conversations/:id/read"), ({ request, params }) => {
    const auth = sessionOf(request);
    if (auth instanceof Response) return auth;
    if (!ownChat(stateOf(request, auth), String(params.id))) {
      return envelope("not_found", NO_CHAT, 404);
    }
    return new HttpResponse(null, { status: 204, headers: mockHeaders(rid()) });
  }),

  http.get(url("/trigo/consent"), ({ request }) => {
    const auth = sessionOf(request);
    if (auth instanceof Response) return auth;
    const accepted =
      trigoStageOf(scenarioOf(request)) !== null &&
      stateOf(request, auth).consentAccepted;
    return HttpResponse.json(
      {
        accepted,
        noticeVersion: TRIGO_NOTICE_VERSION,
        noticeText: TRIGO_NOTICE_TEXT,
        acceptedVersion: accepted ? TRIGO_NOTICE_VERSION : null,
      },
      { headers: mockHeaders(rid()) },
    );
  }),

  http.post(url("/trigo/consent"), async ({ request }) => {
    const auth = sessionOf(request);
    if (auth instanceof Response) return auth;
    if (trigoStageOf(scenarioOf(request)) === null) {
      return envelope("not_found", NOT_RELEASED, 404);
    }
    const body = (await request.json().catch(() => null)) as {
      noticeVersion?: unknown;
      surface?: unknown;
    } | null;
    if (body?.noticeVersion !== TRIGO_NOTICE_VERSION) {
      return envelope(
        "invalid_input",
        "That is not the Trigo notice in force. Show the current notice and ask again.",
        400,
        { noticeVersion: TRIGO_NOTICE_VERSION },
      );
    }
    if (!["web", "ios", "android"].includes(String(body?.surface))) {
      return envelope(
        "invalid_input",
        "Say where the person chose: web, ios or android.",
        400,
        { surface: "required" },
      );
    }
    stateOf(request, auth).consentAccepted = true;
    return new HttpResponse(null, { status: 204, headers: mockHeaders(rid()) });
  }),

  http.delete(url("/trigo/consent"), ({ request }) => {
    const auth = sessionOf(request);
    if (auth instanceof Response) return auth;
    const surface = new URL(request.url).searchParams.get("surface");
    if (!["web", "ios", "android"].includes(String(surface))) {
      return envelope(
        "invalid_input",
        "Say where the person chose: web, ios or android.",
        400,
        { surface: "required" },
      );
    }
    stateOf(request, auth).consentAccepted = false;
    return new HttpResponse(null, { status: 204, headers: mockHeaders(rid()) });
  }),

  /*
    The year asked once (R4-T1). Under `trigo-age` it is what opens the turn.
    Answered only under a Trigo scenario: under any other, this returns
    nothing and the organiser pages' handler (`organiser-handlers.ts`,
    listed after this file) answers, so each keeps its own record.
  */
  http.put(url("/me/age"), async ({ request }) => {
    if (!TRIGO_SCENARIOS.has(scenarioOf(request))) return undefined;
    const auth = request.headers.get("authorization");
    if (!auth || !auth.includes("Bearer sess_")) {
      return envelope("unauthorized", "Sign in to add your birth year.", 401);
    }
    const body = (await request.json().catch(() => null)) as {
      birthYear?: unknown;
      birthdayPassed?: unknown;
    } | null;
    const year = body?.birthYear;
    if (
      typeof year !== "number" ||
      !Number.isInteger(year) ||
      year < 1900 ||
      year > 2100
    ) {
      return envelope(
        "invalid_input",
        "Give the year you were born, such as 1995.",
        400,
        { birthYear: "invalid" },
      );
    }
    // The year in India now.
    const thisYear = new Date(mockNow() + 5.5 * 60 * 60_000).getUTCFullYear();
    const age = thisYear - year;
    if (age === 18 && typeof body?.birthdayPassed !== "boolean") {
      return envelope(
        "invalid_input",
        "Say whether your birthday has passed this year.",
        400,
        { birthdayPassed: "required" },
      );
    }
    if (age < 18 || (age === 18 && body?.birthdayPassed === false)) {
      return envelope(
        "under_age_sign_up",
        "Yuvoy is for people 18 and over. We have closed this account.",
        403,
      );
    }
    stateOf(request, auth).ageConfirmed = true;
    return HttpResponse.json(
      { ageConfirmed: true },
      { headers: mockHeaders(rid()) },
    );
  }),

  ...trigoCardHandlers({
    url,
    scenarioOf,
    sessionOf,
    envelope,
    headers: () => mockHeaders(rid()),
    chatOf: (request, auth) => {
      const state = stateOf(request, auth);
      return {
        messages: state.messages,
        say: (text) => {
          const line = message(state, "trigo", text, false);
          state.messages.push(line);
          return line;
        },
      };
    },
  }),

  ...trigoReplyHandlers({
    url,
    scenarioOf,
    sessionOf,
    envelope,
    headers: () => mockHeaders(rid()),
    isTrigo: (scenario) => trigoStageOf(scenario) !== null,
    chatOf: (request, auth) => {
      const state = stateOf(request, auth);
      return {
        conversationId: state.conversation?.id ?? null,
        messages: state.messages,
        team: state.conversation?.team ?? TEAM,
        handOff: (text, team) => {
          const line = message(state, "system", text, false);
          state.messages.push(line);
          if (state.conversation)
            state.conversation = { ...state.conversation, team };
          return line;
        },
      };
    },
  }),
];

/** Test-only: forget the chats, keys and answers between cases. */
export function __resetTrigoMocks(): void {
  states.clear();
  // And the date alerts and drafts stopped or deleted (yuvoy-app#220).
  __resetTrigoListMocks();
}
