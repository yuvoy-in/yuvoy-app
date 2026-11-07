import { HttpResponse } from "msw";
import type { components } from "../src/lib/api/schema.gen";
import { mockHeaders, mockNow } from "./fixtures";
import { TRIGO_CARD_SCENARIOS } from "./trigo-card-handlers";
import { TRIGO_REPLY_SCENARIOS } from "./trigo-reply-handlers";
import { TRIGO_LIST_SCENARIOS } from "./trigo-list-handlers";

/**
 * The Trigo mock's scenarios, notice, chat state and helpers, moved here from
 * `trigo-handlers.ts` (yuvoy-app#243) as they were. That file holds the
 * handlers, says what each scenario does, and re-exports the public names.
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

/** For the handlers in `trigo-handlers.ts`. */
export type { TrigoTurnResult };
export {
  url,
  rid,
  envelope,
  scenarioOf,
  NOT_RELEASED,
  NO_CHAT,
  TEAM,
  states,
  stateOf,
  nextIndianMidnight,
  uuid,
  sessionOf,
  KEY_SHAPE,
  message,
  listed,
  ownChat,
};
