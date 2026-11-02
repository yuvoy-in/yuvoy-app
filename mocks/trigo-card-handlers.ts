import { http, HttpResponse } from "msw";
import type { components } from "../src/lib/api/schema.gen";
import { availabilityFor } from "./fixtures";

/**
 * Trigo's confirm cards (yuvoy-app#223 part 2, yuvoy-mobile#391): the card
 * on a reply, `POST /trigo/actions/{id}/confirm` and
 * `POST /trigo/actions/{id}/decline`. Kept out of `trigo-handlers.ts`, which
 * passes in its chat state, so neither file imports the other's handlers.
 *
 * Under each `trigo-card-*` scenario every Trigo reply carries one card, a
 * new one per turn, as the API makes them. Trigo is at `staff`, as under the
 * other Trigo scenarios.
 *
 * One card per kind, answered 200:
 *   - `trigo-card-book`: a book card for 2 on `try-dive-nemo-reef`'s first
 *     departure; confirm answers its checkout (`trg_` key, the total at the
 *     fixture's price) and the card reads `confirmed`.
 *   - `trigo-card-book-request`: the same on a request listing
 *     (`snorkel-elephant-beach`, `mode: request`).
 *   - `trigo-card-date-alert`, `trigo-card-trip-draft`: confirm answers
 *     `done` with the alert's or the draft's id and the card reads `used`.
 *   - `trigo-card-move`, `trigo-card-add-people`: a change card; confirm
 *     is `409 action_expired`, as in the API until R6-T2 (no web screen for
 *     it yet, yuvoy-mobile#398).
 *   - `trigo-card-long`: a book card with the contract's 8 lines.
 *
 * A card already past `proposed`: `trigo-card-confirmed`, `trigo-card-used`
 * (with `bookingReference`), `trigo-card-expired`, `trigo-card-declined`,
 * `trigo-card-superseded`. A confirmed or used card's confirm answers its
 * first answer again, 200 with the card's own state, as the API replays it:
 * a used book card answers its checkout with `state: used`.
 *
 * One per refusal of confirm, all on a book card but the date alerts one:
 *   - `trigo-card-sold-out`, `trigo-card-price-moved`, `trigo-card-time-moved`,
 *     `trigo-card-not-bookable`: `409 action_changed` with `details.reason`.
 *   - `trigo-card-expired-confirm`: `409 action_expired`; the card reads
 *     `expired` after.
 *   - `trigo-card-alerts-full`: a date-alert card, `409 date_alerts_full`.
 *   - `trigo-card-not-found`: `404 not_found`.
 *   - `trigo-card-signed-out`: `401 unauthorized`.
 *   - `trigo-card-rate-limited`: `429 rate_limited`.
 *   - `trigo-card-down`: `503 unavailable`.
 *
 * Checked in the API's order (`internal/trigo/actions_confirm.go`): a change
 * card, then a replay, then a card no longer `proposed`, then the refusals.
 *
 * Decline answers Trigo's line under every scenario, and a card no longer
 * `proposed` is `409 action_expired`, as in the API.
 */

type TrigoMessage = components["schemas"]["TrigoMessage"];
type TrigoActionCard = components["schemas"]["TrigoActionCard"];
type TrigoActionConfirmation = components["schemas"]["TrigoActionConfirmation"];

/** The API's sentences (yuvoy-api `internal/handler/trigo_actions.go`). */
const NO_CARD = "We could not find that card.";
/** yuvoy-api `internal/handler/trigo.go` trigoDown. */
const TRIGO_DOWN = "Trigo is not available right now. Try again later.";
const CARD_CHANGED = "This changed since I made this card. Ask Trigo again.";
const CARD_EXPIRED = "This card has expired. Ask Trigo again.";
const ALERTS_FULL = "You have 50 date alerts waiting. Stop one to add another.";
/** yuvoy-api `internal/trigo/actions_cards.go` ReplyDeclined. */
export const DECLINED_REPLY = "No problem. Nothing has been booked or changed.";

/** The listing a book card is for, and the party. */
export const CARD_BOOK_SLUG = "try-dive-nemo-reef";
export const CARD_REQUEST_SLUG = "snorkel-elephant-beach";
export const CARD_GUESTS = 2;
export const CARD_REFERENCE = "YV-7Q2K";

const CHANGED: Record<string, string> = {
  "trigo-card-sold-out": "sold_out",
  "trigo-card-price-moved": "price_moved",
  "trigo-card-time-moved": "time_moved",
  "trigo-card-not-bookable": "not_bookable",
};

const KIND: Record<string, TrigoActionCard["kind"]> = {
  "trigo-card-date-alert": "date_alert",
  "trigo-card-alerts-full": "date_alert",
  "trigo-card-trip-draft": "trip_draft",
  "trigo-card-move": "move_booking",
  "trigo-card-add-people": "add_people",
};

const STATE: Record<string, TrigoActionCard["state"]> = {
  "trigo-card-confirmed": "confirmed",
  "trigo-card-used": "used",
  "trigo-card-expired": "expired",
  "trigo-card-declined": "declined",
  "trigo-card-superseded": "superseded",
};

/** Every scenario of this file. See above for each. */
export const TRIGO_CARD_SCENARIOS: ReadonlySet<string> = new Set([
  "trigo-card-book",
  "trigo-card-book-request",
  "trigo-card-long",
  "trigo-card-expired-confirm",
  "trigo-card-not-found",
  "trigo-card-signed-out",
  "trigo-card-rate-limited",
  "trigo-card-down",
  ...Object.keys(CHANGED),
  ...Object.keys(KIND),
  ...Object.keys(STATE),
]);

function rupees(paise: number): string {
  return `₹${new Intl.NumberFormat("en-IN").format(paise / 100)}`;
}

function slotOf(scenario: string) {
  const slug =
    scenario === "trigo-card-book-request" ? CARD_REQUEST_SLUG : CARD_BOOK_SLUG;
  const slot = availabilityFor(slug)[0];
  return { slug, slot, total: (slot.price?.amountMinor ?? 0) * CARD_GUESTS };
}

/** The card a Trigo reply carries under the scenario, or null. */
export function trigoCardFor(
  scenario: string,
  now: number,
): TrigoActionCard | null {
  if (!TRIGO_CARD_SCENARIOS.has(scenario)) return null;
  const kind = KIND[scenario] ?? "book";
  const state = STATE[scenario] ?? "proposed";
  const base = {
    actionId: crypto.randomUUID(),
    kind,
    state,
    expiresAt: new Date(now + 30 * 60_000).toISOString(),
    declineLabel: "Not now" as const,
  };
  if (kind === "date_alert") {
    return {
      ...base,
      heading: "Tell you when the full moon walk has a date",
      lines: ["One message when a date is listed", "Nothing is booked"],
      confirmLabel: "Tell me",
    };
  }
  if (kind === "trip_draft") {
    return {
      ...base,
      heading: "Save this weekend plan",
      lines: ["Saturday: try-dive at 7:00 am", "Sunday: free morning"],
      confirmLabel: "Save the plan",
    };
  }
  if (kind === "move_booking" || kind === "add_people") {
    return {
      ...base,
      heading:
        kind === "move_booking"
          ? `Move ${CARD_REFERENCE} to Sunday`
          : `Add 1 person to ${CARD_REFERENCE}`,
      lines: ["Same price per person", "Paid at the counter"],
      confirmLabel: kind === "move_booking" ? "Move it" : "Add them",
      bookingReference: CARD_REFERENCE,
    };
  }
  const { slot, total } = slotOf(scenario);
  const lines = [
    `${slot.localDate}, ${slot.localStartTime.slice(0, 5)}`,
    `${CARD_GUESTS} people`,
    `${rupees(total)} in all, paid at the counter`,
  ];
  if (scenario === "trigo-card-long") {
    lines.push(
      "Meet at the dive shop 30 minutes before",
      "Bring a towel and sunscreen",
      "No swimming needed",
      "Ages 10 and up",
      "Free to cancel until the day before",
    );
  }
  return {
    ...base,
    heading:
      scenario === "trigo-card-book-request"
        ? "Ask for Snorkel trip to Elephant Beach"
        : "Book Try-dive at Nemo Reef",
    lines,
    confirmLabel: scenario === "trigo-card-book-request" ? "Ask" : "Book",
    ...(state === "used" ? { bookingReference: CARD_REFERENCE } : {}),
  };
}

/** What `trigo-handlers.ts` hands in: its chat for the request, and helpers. */
export interface CardMockDeps {
  url: (path: string) => string;
  scenarioOf: (request: Request) => string;
  sessionOf: (request: Request) => string | Response;
  envelope: (
    code: string,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) => Response;
  headers: () => Record<string, string>;
  /** The chat's messages, kept in place, and a way to add Trigo's line. */
  chatOf: (
    request: Request,
    auth: string,
  ) => { messages: TrigoMessage[]; say: (text: string) => TrigoMessage };
}

function setState(
  messages: TrigoMessage[],
  index: number,
  state: TrigoActionCard["state"],
): void {
  const m = messages[index];
  if (m.actionCard) {
    messages[index] = { ...m, actionCard: { ...m.actionCard, state } };
  }
}

function confirmation(
  scenario: string,
  card: TrigoActionCard,
): TrigoActionConfirmation {
  if (card.kind === "date_alert") {
    return {
      actionId: card.actionId,
      state: "used",
      next: { done: { alertId: crypto.randomUUID() } },
    };
  }
  if (card.kind === "trip_draft") {
    return {
      actionId: card.actionId,
      state: "used",
      next: { done: { draftId: crypto.randomUUID() } },
    };
  }
  const { slug, slot, total } = slotOf(scenario);
  return {
    actionId: card.actionId,
    state: "confirmed",
    next: {
      checkout: {
        experienceSlug: slug,
        slotId: slot.id,
        localDate: slot.localDate,
        guests: CARD_GUESTS,
        expectTotalPaise: total,
        idempotencyKey: `trg_${card.actionId.replace(/-/g, "")}`,
        mode: slot.bookingMode === "request" ? "request" : "allotment",
      },
    },
  };
}

export function trigoCardHandlers(deps: CardMockDeps) {
  const { url, scenarioOf, sessionOf, envelope, headers, chatOf } = deps;

  function find(request: Request, auth: string, id: unknown) {
    const chat = chatOf(request, auth);
    const index = chat.messages.findIndex(
      (m) => m.actionCard?.actionId === id,
    );
    const card = index >= 0 ? chat.messages[index].actionCard : null;
    return { chat, index, card: card ?? null };
  }

  return [
    http.post(url("/trigo/actions/:id/confirm"), ({ request, params }) => {
      const auth = sessionOf(request);
      if (auth instanceof Response) return auth;
      const scenario = scenarioOf(request);
      const { chat, index, card } = find(request, auth, params.id);
      if (!card || scenario === "trigo-card-not-found") {
        return envelope("not_found", NO_CARD, 404);
      }
      if (scenario === "trigo-card-signed-out") {
        return envelope("unauthorized", "Sign in to ask Trigo.", 401);
      }
      if (scenario === "trigo-card-rate-limited") {
        return envelope(
          "rate_limited",
          "Too many tries. Wait a minute and try again.",
          429,
        );
      }
      if (scenario === "trigo-card-down") {
        return envelope("unavailable", TRIGO_DOWN, 503);
      }
      // Nothing makes a move or add people card yet (R6-T2).
      if (card.kind === "move_booking" || card.kind === "add_people") {
        return envelope("action_expired", CARD_EXPIRED, 409);
      }
      // Confirmed or used before: the first answer again, in its own state.
      if (card.state === "confirmed" || card.state === "used") {
        return HttpResponse.json(
          { ...confirmation(scenario, card), state: card.state },
          { headers: headers() },
        );
      }
      if (
        scenario === "trigo-card-expired-confirm" ||
        card.state !== "proposed"
      ) {
        if (card.state === "proposed") {
          setState(chat.messages, index, "expired");
        }
        return envelope("action_expired", CARD_EXPIRED, 409);
      }
      const reason = CHANGED[scenario];
      if (reason) {
        return envelope("action_changed", CARD_CHANGED, 409, { reason });
      }
      if (scenario === "trigo-card-alerts-full") {
        return envelope("date_alerts_full", ALERTS_FULL, 409);
      }
      const result = confirmation(scenario, card);
      setState(chat.messages, index, result.state);
      return HttpResponse.json(result, { headers: headers() });
    }),

    http.post(url("/trigo/actions/:id/decline"), ({ request, params }) => {
      const auth = sessionOf(request);
      if (auth instanceof Response) return auth;
      const { chat, index, card } = find(request, auth, params.id);
      if (!card) return envelope("not_found", NO_CARD, 404);
      if (card.state !== "proposed" && card.state !== "declined") {
        return envelope("action_expired", CARD_EXPIRED, 409);
      }
      // Declined again: the same line, as the API answers it.
      const said =
        card.state === "declined"
          ? chat.messages
              .slice(index + 1)
              .find((m) => m.role === "trigo" && m.text === DECLINED_REPLY)
          : undefined;
      setState(chat.messages, index, "declined");
      const message = said ?? chat.say(DECLINED_REPLY);
      return HttpResponse.json({ message }, { headers: headers() });
    }),
  ];
}
