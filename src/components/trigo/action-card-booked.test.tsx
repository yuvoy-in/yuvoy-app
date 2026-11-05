import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { useTrigoChat, type TrigoMessage } from "@/lib/trigo/api";
import type { TrigoActionCard } from "@/lib/trigo/actions";
import { readTrigoCheckout } from "@/lib/trigo/checkout-prefill";
import { GO_TO_CHECKOUT, bookedLine } from "@/lib/trigo/words";
import { ActionCard } from "./action-card";
import { CARD_ACTIONS_CLOSED } from "./ui-words";
import { server } from "../../../mocks/server";
import {
  CARD_BOOK_SLUG,
  CARD_REFERENCE,
  trigoCardFor,
  trigoCardHandlers,
} from "../../../mocks/trigo-card-handlers";

/**
 * A confirmed book card booked meanwhile (yuvoy-app#223 part 2): Go to
 * checkout is answered 200 with `state: used` by the mock's own confirm, as
 * the API replays it. The card then reads Booked from the chat read again,
 * no checkout opens and none is kept.
 *
 * And a card whose release closed after it was read: its confirm answers 404,
 * the card reads app-config again and is drawn closed, with Not now. With the
 * release still open the 404 is the API's own, and the card ends.
 *
 * The real hooks and the mock's confirm, on a chat this test holds: the
 * proxy mock does not pass a scenario on, so the mock's deps are handed in
 * here.
 */

const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

const CHAT = "6f1c2d3e-4a5b-4c6d-8e7f-8091a2b3c4d5";
const CHAT_READ = "*/api/v1/trigo/conversations/:id";
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const MADE = Date.parse("2026-11-02T04:30:00Z");

function msg(
  seq: number,
  role: TrigoMessage["role"],
  text: string,
  actionCard: TrigoActionCard | null = null,
): TrigoMessage {
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    seq,
    role,
    text,
    createdAt: "2026-11-02T04:30:00Z",
    cards: [],
    handoffOffer: false,
    removed: false,
    actionCard,
  };
}

function page(messages: TrigoMessage[]) {
  return {
    conversation: {
      id: CHAT,
      state: "open",
      startedAt: "2026-11-02T04:30:00Z",
      lastMessageAt: "2026-11-02T04:31:00Z",
      team: { state: "none", openNow: true },
      unread: 0,
      textRemoved: false,
    },
    messages,
    more: false,
    hasOlder: false,
    remainingToday: 18,
    resetsAt: "2026-11-02T18:30:00Z",
    pollAfterSeconds: 0,
  };
}

/** The mock's card handlers under `scenario`, on the chat `held`. */
function cardMocks(scenario: string, held: TrigoMessage[]) {
  return [
    ...trigoCardHandlers({
      url: (path) => `*/api/v1${path}`,
      scenarioOf: () => scenario,
      sessionOf: () => "Bearer sess_test",
      envelope: (code, message, status, details) =>
        HttpResponse.json(
          { error: { code, message, details, requestId: "01JTEST" } },
          { status },
        ),
      headers: () => ({}),
      chatOf: () => ({
        messages: held,
        say: (text) => {
          const said = msg(held.length + 1, "trigo", text);
          held.push(said);
          return said;
        },
      }),
    }),
    http.get(CHAT_READ, ({ request }) => {
      const after = Number(new URL(request.url).searchParams.get("after") ?? 0);
      return HttpResponse.json(page(held.filter((m) => m.seq > after)));
    }),
  ];
}

/** The card as the chat on screen has it. */
function CardInChat() {
  const chat = useTrigoChat(CHAT, true);
  const card = chat.messages.find((m) => m.actionCard)?.actionCard;
  return card ? <ActionCard card={card} conversationId={CHAT} /> : null;
}

describe("a confirmed book card booked meanwhile", () => {
  it("reads Booked after Go to checkout, and opens and keeps no checkout", async () => {
    const card = trigoCardFor("trigo-card-confirmed", MADE);
    if (!card) throw new Error("no card under trigo-card-confirmed");
    const held: TrigoMessage[] = [
      msg(1, "traveller", "Beginner dive Saturday for two"),
      msg(2, "trigo", "Here.", card),
    ];
    server.use(...cardMocks("trigo-card-confirmed", held));
    renderWithQuery(<CardInChat />);
    const go = await screen.findByRole("button", { name: GO_TO_CHECKOUT });

    // Booked at that checkout in another tab: the server's card is used.
    held[1] = msg(2, "trigo", "Here.", {
      ...card,
      state: "used",
      bookingReference: CARD_REFERENCE,
    });
    await userEvent.setup().click(go);

    expect(
      await screen.findByRole("link", { name: bookedLine(CARD_REFERENCE) }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: GO_TO_CHECKOUT }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(readTrigoCheckout(CARD_BOOK_SLUG, Date.now())).toBeNull();
  });
});

describe("a card whose release closed after it was read", () => {
  it("reads app-config again on a confirm 404 and is drawn closed, with Not now", async () => {
    const card = trigoCardFor("trigo-card-actions-off", MADE);
    if (!card) throw new Error("no card under trigo-card-actions-off");
    const held: TrigoMessage[] = [
      msg(1, "traveller", "Beginner dive Saturday for two"),
      msg(2, "trigo", "Here.", card),
    ];
    // Open when the card is drawn, closed by the time it is confirmed.
    let stage = "all";
    const reads: string[] = [];
    server.use(
      ...cardMocks("trigo-card-actions-off", held),
      http.get(`${BASE}/app-config`, () => {
        reads.push(stage);
        return HttpResponse.json({
          minimumVersion: { ios: "0.0.0", android: "0.0.0" },
          features: { payments: "coming_soon", inviteOnly: false },
          support: { whatsappE164: null, hours: "" },
          deliveryHost: null,
          releases: { trigoActions: stage },
        });
      }),
    );
    renderWithQuery(<CardInChat />);
    const book = await screen.findByRole("button", { name: card.confirmLabel });

    stage = "off";
    await userEvent.setup().click(book);

    expect(await screen.findByText(CARD_ACTIONS_CLOSED)).toBeInTheDocument();
    expect(reads).toEqual(["all", "off"]);
    expect(
      screen.queryByRole("button", { name: card.confirmLabel }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: card.declineLabel }),
    ).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("still open, the 404 ends the card", async () => {
    const card = trigoCardFor("trigo-card-actions-off", MADE);
    if (!card) throw new Error("no card under trigo-card-actions-off");
    const held: TrigoMessage[] = [
      msg(1, "traveller", "Beginner dive Saturday for two"),
      msg(2, "trigo", "Here.", card),
    ];
    // The mock's confirm answers 404 under this scenario; the stage stays open.
    const stage = "all";
    const reads: string[] = [];
    server.use(
      ...cardMocks("trigo-card-actions-off", held),
      http.get(`${BASE}/app-config`, () => {
        reads.push(stage);
        return HttpResponse.json({
          minimumVersion: { ios: "0.0.0", android: "0.0.0" },
          features: { payments: "coming_soon", inviteOnly: false },
          support: { whatsappE164: null, hours: "" },
          deliveryHost: null,
          releases: { trigoActions: stage },
        });
      }),
    );
    renderWithQuery(<CardInChat />);
    const book = await screen.findByRole("button", { name: card.confirmLabel });

    await userEvent.setup().click(book);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Trigo isn't open to your account yet.",
    );
    expect(reads).toEqual(["all", "all"]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(CARD_ACTIONS_CLOSED)).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
