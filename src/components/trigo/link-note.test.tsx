import { describe, it, expect } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { allowedProxyPath } from "@/lib/auth/proxied-paths";
import { qk } from "@/lib/query/policy";
import type { TrigoChatData, TrigoMessage } from "@/lib/trigo/api";
import { withHandoff, type TrigoHandoff } from "@/lib/trigo/handoff";
import {
  ASK_TEAM_FAILED,
  ASK_TEAM_TO_CHECK,
  linkNotCheckedLine,
} from "@/lib/trigo/words";
import { LinkNote } from "./link-note";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";

/**
 * The note under a reply to a message with a link Trigo did not open, and
 * its "Ask the team to check" (yuvoy-app#223 (c)): the tap posts the reply's
 * id to `requestTrigoHandoff`, and the server's line joins the chat.
 */

const HANDOFF = "*/api/v1/trigo/conversations/:id/handoff";
const CHAT = "6f1c2d3e-4a5b-4c6d-8e7f-8091a2b3c4d5";
const ENDED = "This chat has ended. Start a new one to ask the team.";

function msg(seq: number, extra: Partial<TrigoMessage> = {}): TrigoMessage {
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    seq,
    role: seq % 2 === 1 ? "traveller" : "trigo",
    text: `message ${seq}`,
    createdAt: "2026-11-02T04:30:00Z",
    cards: [],
    handoffOffer: false,
    removed: false,
    ...extra,
  };
}

const REPLY = msg(2, { linkNotChecked: { domain: "insider.in" } });

const ANSWER: TrigoHandoff = {
  message: msg(3, {
    role: "system",
    text: "The Yuvoy team will reply here by 11am.",
  }),
  team: { state: "waiting", openNow: true, replyBy: "2026-11-02T05:30:00Z" },
};

function chat(): TrigoChatData {
  return {
    conversation: {
      id: CHAT,
      state: "open",
      startedAt: "2026-11-02T04:00:00Z",
      lastMessageAt: "2026-11-02T04:01:00Z",
      team: { state: "none", openNow: true },
      unread: 0,
      textRemoved: false,
    },
    messages: [msg(1), REPLY],
    remainingToday: 18,
    resetsAt: "2026-11-02T18:30:00.000Z",
    pollAfterSeconds: 0,
  };
}

function askButton() {
  return screen.queryByRole("button", { name: ASK_TEAM_TO_CHECK });
}

describe("LinkNote", () => {
  it("draws nothing on a reply with no link", () => {
    const { container } = renderWithQuery(
      <LinkNote message={msg(2)} conversationId={CHAT} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("names the domain and offers the team", () => {
    renderWithQuery(<LinkNote message={REPLY} conversationId={CHAT} />);
    expect(
      screen.getByText(
        "Trigo doesn't open links, so nothing on insider.in has been checked yet.",
      ),
    ).toBeVisible();
    expect(askButton()).toBeEnabled();
  });

  it("hands the reply to the team and puts the server's line in the chat", async () => {
    __signInAppRouteMock();
    let sent: { id: unknown; body: unknown } | null = null;
    server.use(
      http.post(HANDOFF, async ({ request, params }) => {
        sent = { id: params.id, body: await request.json() };
        return HttpResponse.json(ANSWER);
      }),
    );
    const { client } = renderWithQuery(
      <LinkNote message={REPLY} conversationId={CHAT} />,
    );
    client.setQueryDefaults(qk.trigoConversation(CHAT), { gcTime: Infinity });
    client.setQueryData(qk.trigoConversation(CHAT), chat());

    fireEvent.click(askButton()!);

    await waitFor(() => expect(askButton()).toBeNull());
    expect(sent).toEqual({ id: CHAT, body: { messageId: REPLY.id } });
    const held = client.getQueryData<TrigoChatData>(qk.trigoConversation(CHAT));
    expect(held?.messages.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(held?.conversation?.team.state).toBe("waiting");
    // The note stays: the link was still not opened.
    expect(screen.getByText(linkNotCheckedLine("insider.in"))).toBeVisible();
  });

  it("shows the API's sentence when the chat has ended", async () => {
    __signInAppRouteMock();
    server.use(
      http.post(HANDOFF, () =>
        HttpResponse.json(
          {
            error: {
              code: "conflict",
              message: ENDED,
              requestId: "01JTEST0000HANDOFF",
            },
          },
          { status: 409 },
        ),
      ),
    );
    renderWithQuery(<LinkNote message={REPLY} conversationId={CHAT} />);
    fireEvent.click(askButton()!);
    expect(await screen.findByRole("alert")).toHaveTextContent(ENDED);
    expect(askButton()).toBeVisible();
  });

  it("shows our line when the call gets no answer", async () => {
    __signInAppRouteMock();
    server.use(http.post(HANDOFF, () => HttpResponse.error()));
    renderWithQuery(<LinkNote message={REPLY} conversationId={CHAT} />);
    fireEvent.click(askButton()!);
    expect(await screen.findByRole("alert")).toHaveTextContent(ASK_TEAM_FAILED);
  });
});

describe("withHandoff", () => {
  it("merges the line by seq and takes the answer's team", () => {
    const next = withHandoff(chat(), ANSWER);
    expect(next?.messages.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(next?.conversation?.team).toEqual(ANSWER.team);
  });

  it("leaves a chat not held alone", () => {
    expect(withHandoff(undefined, ANSWER)).toBeUndefined();
  });
});

describe("the proxy allowlist", () => {
  it("forwards the hand-off POST, and nothing else on it", () => {
    expect(
      allowedProxyPath("POST", `/trigo/conversations/${CHAT}/handoff`),
    ).toBe("/trigo/conversations/{id}/handoff");
    expect(
      allowedProxyPath("GET", `/trigo/conversations/${CHAT}/handoff`),
    ).toBeNull();
  });
});
