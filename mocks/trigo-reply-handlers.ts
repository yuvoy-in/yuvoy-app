import { http, HttpResponse } from "msw";
import type { components } from "../src/lib/api/schema.gen";

/**
 * The cards in a Trigo reply and the note on a link Trigo did not open
 * (yuvoy-app#223 (b) and (c)), with `POST /trigo/conversations/{id}/handoff`.
 * Kept out of `trigo-handlers.ts`, which passes in its chat state.
 *
 * Trigo is at `staff`, as under the other Trigo scenarios:
 *   - `trigo-reply-cards`: every reply carries three cards: a listing, a
 *     found event not checked yet, and a listing no longer shown
 *     (`available: false`).
 *   - `trigo-reply-link`: every reply carries `linkNotChecked` for
 *     `insider.in`. "Ask the team to check" answers the server's system line
 *     and `team.state: waiting`; pressed again while it is open, it answers
 *     the line already there, as the API does.
 *   - `trigo-reply-link-ended`: as `trigo-reply-link`, and the hand-off is
 *     `409 conflict`, the chat having ended.
 *
 * The hand-off is session only under every Trigo scenario; another chat's id
 * or a `messageId` not in the chat is `404`, as in the API.
 */

type TrigoMessage = components["schemas"]["TrigoMessage"];
type TrigoCard = components["schemas"]["TrigoCard"];
type TrigoTeam = components["schemas"]["TrigoTeam"];

export const TRIGO_REPLY_SCENARIOS: readonly string[] = [
  "trigo-reply-cards",
  "trigo-reply-link",
  "trigo-reply-link-ended",
];

const LINK_SCENARIOS = new Set(TRIGO_REPLY_SCENARIOS.slice(1));

export const HANDOFF_LINE =
  "The Yuvoy team will reply here within 2 hours, between 10am and 8pm.";

const CARDS: TrigoCard[] = [
  {
    cardId: "exp:try-dive-nemo-reef",
    kind: "experience",
    available: true,
    title: "Try dive at Nemo Reef",
    placeName: "Havelock",
    whenText: "Sat 8 Nov, 7am",
    price: { amountMinor: 450000, currency: "INR" },
    priceText: "per person",
    checkLabel: "Checked by Yuvoy · 2 Nov",
    sourceName: null,
    href: "/e/try-dive-nemo-reef",
  },
  {
    cardId: "evt:sunset-jazz",
    kind: "event",
    available: true,
    title: "Sunset jazz on the jetty",
    placeName: "Port Blair",
    whenText: "Fri 7 Nov, 6pm",
    price: null,
    priceText: "Free",
    checkLabel: "Found by Trigo · not checked yet · insider.in",
    sourceName: "insider.in",
    href: "/f/0b9a3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
  },
  {
    cardId: "exp:sea-walk-north-bay",
    kind: "experience",
    available: false,
    title: "Sea walk at North Bay",
    placeName: "Port Blair",
    whenText: null,
    price: null,
    priceText: null,
    checkLabel: "Andaman Sea Walkers",
    sourceName: null,
    href: "/e/sea-walk-north-bay",
  },
];

/** What a reply carries under these scenarios; the rest of the reply is unchanged. */
export function replyExtrasFor(
  scenario: string,
): Pick<TrigoMessage, "cards" | "linkNotChecked"> {
  return {
    cards: scenario === "trigo-reply-cards" ? CARDS.map((c) => ({ ...c })) : [],
    linkNotChecked: LINK_SCENARIOS.has(scenario)
      ? { domain: "insider.in" }
      : null,
  };
}

export interface ReplyMockDeps {
  url: (path: string) => string;
  scenarioOf: (request: Request) => string;
  sessionOf: (request: Request) => string | Response;
  envelope: (code: string, message: string, status: number) => Response;
  headers: () => Record<string, string>;
  /** Whether a scenario opens Trigo at all. */
  isTrigo: (scenario: string) => boolean;
  /** The open chat, and a way to add the system line and set the team. */
  chatOf: (
    request: Request,
    auth: string,
  ) => {
    conversationId: string | null;
    messages: TrigoMessage[];
    team: TrigoTeam;
    handOff: (text: string, team: TrigoTeam) => TrigoMessage;
  };
}

export function trigoReplyHandlers(deps: ReplyMockDeps) {
  const { url, scenarioOf, sessionOf, envelope, headers, isTrigo, chatOf } =
    deps;
  return [
    http.post(
      url("/trigo/conversations/:id/handoff"),
      async ({ request, params }) => {
        const scenario = scenarioOf(request);
        if (!isTrigo(scenario)) return undefined;
        const auth = sessionOf(request);
        if (auth instanceof Response) return auth;
        const chat = chatOf(request, auth);
        if (!chat.conversationId || chat.conversationId !== params.id) {
          return envelope("not_found", "That chat was not found.", 404);
        }
        const body = (await request.json().catch(() => ({}))) as {
          messageId?: string | null;
        };
        if (
          body.messageId &&
          !chat.messages.some((m) => m.id === body.messageId)
        ) {
          return envelope("not_found", "That message was not found.", 404);
        }
        if (scenario === "trigo-reply-link-ended") {
          return envelope(
            "conflict",
            "This chat has ended. Start a new one to ask the team.",
            409,
          );
        }
        const open = chat.team.state !== "none";
        const line = open
          ? chat.messages.findLast(
              (m) => m.role === "system" && m.text === HANDOFF_LINE,
            )
          : undefined;
        const team: TrigoTeam = open
          ? chat.team
          : {
              state: "waiting",
              openNow: true,
              replyBy: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
            };
        const message = line ?? chat.handOff(HANDOFF_LINE, team);
        return HttpResponse.json({ message, team }, { headers: headers() });
      },
    ),
  ];
}
