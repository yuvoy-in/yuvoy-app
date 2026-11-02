import { describe, it, expect } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import type { components } from "@/lib/api/schema.gen";
import { qk } from "@/lib/query/policy";
import {
  useSendTrigoTurn,
  useTrigoChat,
  type SendTurnVars,
  type TrigoChatData,
  type TrigoMessage,
  type TrigoTurnResult,
} from "./api";
import { readDraft, writeDraft } from "./keys";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";

/*
  The vitest stand-in for the app's `/api/v1/*` route forwards only the
  session and the content type, so these cases answer the route itself: the
  header the browser sends is what is under test.
*/
const TURNS = "*/api/v1/trigo/turns";
const CHAT_READ = "*/api/v1/trigo/conversations/:id";

const CHAT = "6f1c2d3e-4a5b-4c6d-8e7f-8091a2b3c4d5";

function msg(seq: number, text: string): TrigoMessage {
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    seq,
    role: seq % 2 === 1 ? "traveller" : "trigo",
    text,
    createdAt: "2026-11-02T04:30:00Z",
    cards: [],
    handoffOffer: false,
    removed: false,
  };
}

const RESULT: TrigoTurnResult = {
  conversationId: CHAT,
  turnId: "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d",
  outcome: "answered",
  messages: [
    msg(3, "Beginner dive Saturday for two"),
    msg(
      4,
      "On Saturday morning the Sunrise Kayak Trip leaves from the beach at six.",
    ),
  ],
  remainingToday: 17,
  resetsAt: "2026-11-02T18:30:00.000Z",
  team: { state: "none", openNow: true },
};

function Send({ vars }: { vars: SendTurnVars }) {
  const send = useSendTrigoTurn();
  return (
    <>
      <button type="button" onClick={() => send.mutate(vars)}>
        Send
      </button>
      <p>{send.status}</p>
    </>
  );
}

/** Sends, then reads the chat the answer names, as the sheet does. */
function SendThenRead({ vars }: { vars: SendTurnVars }) {
  const send = useSendTrigoTurn();
  const chat = useTrigoChat(send.data?.conversationId ?? null, true);
  return (
    <>
      <button type="button" onClick={() => send.mutate(vars)}>
        Send
      </button>
      <p data-testid="seqs">{chat.messages.map((m) => m.seq).join(",")}</p>
    </>
  );
}

function seed(client: ReturnType<typeof renderWithQuery>["client"]) {
  // The render's client drops an entry nobody watches at once.
  client.setQueryDefaults(qk.trigoConversation(CHAT), { gcTime: Infinity });
  const old: TrigoChatData = {
    conversation: {
      id: CHAT,
      state: "open",
      startedAt: "2026-11-02T04:00:00Z",
      lastMessageAt: "2026-11-02T04:01:00Z",
      team: { state: "none", openNow: true },
      unread: 0,
      textRemoved: false,
    },
    messages: [msg(1, "What should I do this weekend?"), msg(2, "A reply")],
    remainingToday: 18,
    resetsAt: "2026-11-02T18:30:00.000Z",
    pollAfterSeconds: 0,
  };
  client.setQueryData(qk.trigoConversation(CHAT), old);
}

describe("useSendTrigoTurn", () => {
  it("sends the draft's key and merges the answer into the chat's cache", async () => {
    __signInAppRouteMock();
    let sentKey: string | null = null;
    let sentBody: unknown = null;
    server.use(
      http.post(TURNS, async ({ request }) => {
        sentKey = request.headers.get("idempotency-key");
        sentBody = await request.json();
        // The turn's own copy of an earlier message, as a replay sends it.
        return HttpResponse.json({
          ...RESULT,
          messages: [msg(2, "A reply"), ...RESULT.messages],
        });
      }),
    );
    const draft = writeDraft("Beginner dive Saturday for two");
    expect(draft).not.toBeNull();

    const { client } = renderWithQuery(
      <Send
        vars={{
          key: draft!.key,
          text: draft!.text,
          conversationId: CHAT,
        }}
      />,
    );
    seed(client);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(screen.getByText("success")).toBeInTheDocument(),
    );

    expect(sentKey).toBe(draft!.key);
    expect(sentBody).toEqual({
      text: "Beginner dive Saturday for two",
      conversationId: CHAT,
    });
    const chat = client.getQueryData<TrigoChatData>(qk.trigoConversation(CHAT));
    expect(chat?.messages.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
    expect(chat?.remainingToday).toBe(17);
    expect(chat?.resetsAt).toBe(RESULT.resetsAt);
    expect(chat?.conversation?.id).toBe(CHAT);
    // The draft just answered is gone, so the box is empty after a reload.
    expect(readDraft()).toBeNull();
  });

  it("starts the cache of a new chat from the answer", async () => {
    __signInAppRouteMock();
    server.use(http.post(TURNS, () => HttpResponse.json(RESULT)));
    const { client } = renderWithQuery(
      <Send vars={{ key: "trg-web-aaaaaaaaaaaaaaaaaaaaaaaa", text: "Hi" }} />,
    );
    client.setQueryDefaults(qk.trigoConversation(CHAT), { gcTime: Infinity });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(screen.getByText("success")).toBeInTheDocument(),
    );

    const chat = client.getQueryData<TrigoChatData>(qk.trigoConversation(CHAT));
    expect(chat?.messages.map((m) => m.seq)).toEqual([3, 4]);
    expect(chat?.remainingToday).toBe(17);
  });

  it("reads in full a chat the server continued under a new id", async () => {
    __signInAppRouteMock();
    // The traveller's own closed chat: the server continues the open one.
    const NEW = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
    const held = [msg(1, "Kayaks near Calangute?"), msg(2, "Two shops")];
    const page = [...held, ...RESULT.messages];
    const reads: (string | null)[] = [];
    server.use(
      http.post(TURNS, () =>
        HttpResponse.json({ ...RESULT, conversationId: NEW }),
      ),
      http.get(CHAT_READ, ({ request }) => {
        const after = new URL(request.url).searchParams.get("after");
        reads.push(after);
        const body: components["schemas"]["TrigoConversationPage"] = {
          conversation: {
            id: NEW,
            state: "open",
            startedAt: "2026-11-02T04:00:00Z",
            lastMessageAt: "2026-11-02T04:31:00Z",
            team: { state: "none", openNow: true },
            unread: 0,
            textRemoved: false,
          },
          messages: page.filter((m) => m.seq > Number(after ?? 0)),
          more: false,
          hasOlder: false,
          remainingToday: 17,
          resetsAt: RESULT.resetsAt,
          pollAfterSeconds: 0,
        };
        return HttpResponse.json(body);
      }),
    );
    const { client } = renderWithQuery(
      <SendThenRead
        vars={{
          key: "trg-web-bbbbbbbbbbbbbbbbbbbbbbbb",
          text: "Beginner dive Saturday for two",
          conversationId: CHAT,
        }}
      />,
    );
    seed(client);
    client.setQueryDefaults(qk.trigoConversation(NEW), { gcTime: Infinity });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(screen.getByTestId("seqs")).toHaveTextContent("1,2,3,4"),
    );
    // The answer alone is not the chat: the first read asks for all of it.
    expect(reads[0]).toBeNull();
  });

  it("keeps the draft and is not retried when the send fails", async () => {
    __signInAppRouteMock();
    let calls = 0;
    server.use(
      http.post(TURNS, () => {
        calls += 1;
        return HttpResponse.json(
          {
            error: {
              code: "unavailable",
              message: "Trigo is busy. Try again in a moment.",
              requestId: "01JTEST",
            },
          },
          { status: 503 },
        );
      }),
    );
    const draft = writeDraft("Sunset on the water");
    renderWithQuery(<Send vars={{ key: draft!.key, text: draft!.text }} />);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByText("error")).toBeInTheDocument());

    expect(calls).toBe(1);
    expect(readDraft()).toEqual(draft);
  });
});
