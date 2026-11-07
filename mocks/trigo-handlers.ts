import { http, HttpResponse, delay } from "msw";
import { mockHeaders, mockNow } from "./fixtures";
import { trigoCardFor, trigoCardHandlers } from "./trigo-card-handlers";
import { replyExtrasFor, trigoReplyHandlers } from "./trigo-reply-handlers";
import { __resetTrigoListMocks } from "./trigo-list-handlers";
import {
  url,
  rid,
  envelope,
  scenarioOf,
  TRIGO_SCENARIOS,
  trigoStageOf,
  TRIGO_NOTICE_VERSION,
  TRIGO_NOTICE_TEXT,
  REPLY_TEXT,
  TIMED_OUT_TEXT,
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
  type TrigoTurnResult,
} from "./trigo-handlers-parts";

export {
  TRIGO_SCENARIOS,
  trigoStageOf,
  trigoStaffCohort,
  TRIGO_NOTICE_VERSION,
  TRIGO_NOTICE_TEXT,
  REPLY_TEXT,
  TIMED_OUT_TEXT,
  TRIGO_CLOSED_CHAT_ID,
} from "./trigo-handlers-parts";

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
