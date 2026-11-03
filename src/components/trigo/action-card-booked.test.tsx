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
    server.use(
      ...trigoCardHandlers({
        url: (path) => `*/api/v1${path}`,
        scenarioOf: () => "trigo-card-confirmed",
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
        const after = Number(
          new URL(request.url).searchParams.get("after") ?? 0,
        );
        return HttpResponse.json(page(held.filter((m) => m.seq > after)));
      }),
    );
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
