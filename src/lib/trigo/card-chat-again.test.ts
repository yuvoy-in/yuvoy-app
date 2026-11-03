import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query/policy";
import { readCardChatAgain, type TrigoActionCard } from "./actions";
import type { TrigoChatData, TrigoMessage } from "./api";

/**
 * After a reservation from a card's checkout (yuvoy-app#223 part 2): the
 * chat that has the card is read again, so the card reads Booked back in
 * the chat; other chats are left alone.
 */

const WITH_CARD = "6f1c2d3e-4a5b-4c6d-8e7f-8091a2b3c4d5";
const OTHER = "7a2d3e4f-5b6c-4d7e-8f90-91a2b3c4d5e6";
const ACTION = "2b7e4c1a-9d3f-4e5a-8b6c-7d8e9f0a1b2c";

const CARD: TrigoActionCard = {
  actionId: ACTION,
  kind: "book",
  state: "confirmed",
  expiresAt: "2026-11-02T05:00:00Z",
  heading: "Book Try-dive at Nemo Reef",
  lines: ["Saturday, 07:00", "2 people"],
  confirmLabel: "Book",
  declineLabel: "Not now",
};

function chat(actionCard: TrigoActionCard | null): TrigoChatData {
  const message: TrigoMessage = {
    id: "00000000-0000-4000-8000-000000000002",
    seq: 2,
    role: "trigo",
    text: "Here.",
    createdAt: "2026-11-02T04:30:00Z",
    cards: [],
    handoffOffer: false,
    removed: false,
    actionCard,
  };
  return {
    conversation: null,
    messages: [message],
    remainingToday: 18,
    resetsAt: null,
    pollAfterSeconds: 0,
  };
}

function stale(qc: QueryClient, key: readonly unknown[]): boolean {
  return qc.getQueryState(key)?.isInvalidated ?? false;
}

describe("readCardChatAgain", () => {
  it("reads again the chat that has the card, and the chats list", () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.trigoConversation(WITH_CARD), chat(CARD));
    qc.setQueryData(qk.trigoConversation(OTHER), chat(null));
    qc.setQueryData(qk.trigoConversations(), { conversations: [] });

    readCardChatAgain(qc, ACTION);

    expect(stale(qc, qk.trigoConversation(WITH_CARD))).toBe(true);
    expect(stale(qc, qk.trigoConversation(OTHER))).toBe(false);
    expect(stale(qc, qk.trigoConversations())).toBe(true);
  });

  it("does nothing to a chat when no chat held has the card", () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.trigoConversation(OTHER), chat(null));

    readCardChatAgain(qc, ACTION);

    expect(stale(qc, qk.trigoConversation(OTHER))).toBe(false);
  });
});
