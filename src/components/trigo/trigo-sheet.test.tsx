import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import type { TrigoFailure, TrigoMessage } from "@/lib/trigo/api";
import { readDraft } from "@/lib/trigo/keys";
import {
  ACCEPT,
  AGE_LINE,
  ASK_THE_TEAM,
  CHIPS_GENERAL,
  CHIPS_LISTING,
  FAILURE_LINE,
  GREETING,
  IN_PROGRESS_LINE,
  LIMIT_LINE,
  NOT_RELEASED_LINE,
  OFFLINE_LINE,
  SIGNED_OUT_LINE,
  TRY_AGAIN,
  TURN_OFF,
  remainingLine,
} from "@/lib/trigo/words";
import { TrigoSheet } from "./trigo-sheet";
import { COMPOSER_LABEL, SEND, SIGN_IN } from "./ui-words";

/**
 * The Trigo sheet's states (yuvoy-app#223, R5-T5): signed out, closed,
 * the notice, the greeting with its chips, a reply, the day's limit, every
 * failure kind `classifyTrigoError` names, and offline.
 *
 * The data layer is mocked whole: what is pinned here is which state each
 * answer puts the sheet in, and what a send carries. The hooks themselves,
 * and the API's answers, are `src/lib/trigo/api.test.ts`'s and the e2e's.
 * A failure is handed over as the error itself (`{ failure }`), so the screen
 * is tested against the kinds and never against message text.
 */

const s = vi.hoisted(() => ({
  signedIn: true as boolean | undefined,
  release: { open: true, pending: false, stage: "all" },
  consent: {
    data: {
      accepted: true,
      noticeVersion: "v3",
      noticeText: "Trigo answers from Yuvoy's listings.\nIt can be wrong.",
    } as { accepted: boolean; noticeVersion: string; noticeText: string },
    isPending: false,
    isLoadingError: false,
    error: null as unknown,
    refetch: () => Promise.resolve(),
  },
  messages: [] as TrigoMessage[],
  remainingToday: 20 as number | null,
  resetsAt: "2026-11-02T18:30:00Z" as string | null,
  sending: false,
  sent: [] as {
    key: string;
    text: string;
    aboutCardId?: string;
    conversationId?: string;
  }[],
  answer: null as
    | null
    | ((vars: {
        key: string;
        text: string;
      }) => { ok: Record<string, unknown> } | { failure: TrigoFailure }),
  accepted: [] as unknown[],
  withdrawn: 0,
  marked: [] as number[],
}));

vi.mock("@/lib/site/use-release", () => ({
  useRelease: () => s.release,
}));

vi.mock("@/lib/auth/use-traveller", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/use-traveller")>()),
  useTravellerSession: () => ({ signedIn: s.signedIn }),
}));

vi.mock("@/lib/observability/report", () => ({ captureEvent: vi.fn() }));

vi.mock("@/lib/trigo/api", () => {
  const idle = { isPending: false, error: null };
  return {
    classifyTrigoError: (e: { failure?: TrigoFailure }) =>
      e?.failure ?? { kind: "failure" },
    classifyAgeError: () => ({ kind: "failure" }),
    useTrigoConsent: () => s.consent,
    useAcceptTrigoConsent: () => ({
      ...idle,
      mutate: (vars: unknown) => s.accepted.push(vars),
    }),
    useWithdrawTrigoConsent: () => ({
      ...idle,
      mutate: () => {
        s.withdrawn += 1;
      },
    }),
    useTrigoConversations: () => ({
      data: [],
      isPending: false,
      isLoadingError: false,
      refetch: () => Promise.resolve(),
    }),
    useTrigoChat: (id: string | null) => ({
      messages: id ? s.messages : [],
      conversation: null,
      remainingToday: s.remainingToday,
      resetsAt: s.resetsAt,
      pollAfterSeconds: 0,
      isPending: false,
      error: null,
      notFound: false,
    }),
    useMarkTrigoRead: () => ({ mutate: (seq: number) => s.marked.push(seq) }),
    useConfirmAge: () => ({ ...idle, mutate: vi.fn() }),
    useSendTrigoTurn: () => ({
      isPending: s.sending,
      mutate: (
        vars: {
          key: string;
          text: string;
          aboutCardId?: string;
          conversationId?: string;
        },
        opts: {
          onSuccess?: (
            r: unknown,
            v: unknown,
            start: { startedAt: number },
          ) => void;
          onError?: (e: unknown) => void;
          onSettled?: () => void;
        },
      ) => {
        s.sent.push(vars);
        const out = s.answer?.(vars);
        if (!out) return;
        if ("ok" in out) {
          opts.onSuccess?.(out.ok, vars, { startedAt: Date.now() });
        } else opts.onError?.({ failure: out.failure });
        opts.onSettled?.();
      },
    }),
  };
});

const CONVERSATION = "7d1c2a3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

function message(
  seq: number,
  role: TrigoMessage["role"],
  text: string,
  extra: Partial<TrigoMessage> = {},
): TrigoMessage {
  return {
    id: `m-${seq}`,
    seq,
    role,
    text,
    createdAt: "2026-11-02T10:00:00Z",
    cards: [],
    handoffOffer: false,
    removed: false,
    ...extra,
  };
}

/** A turn answered: the cache holds the turn's messages, as the hook does. */
function answered(
  reply: string,
  extra: Partial<TrigoMessage> = {},
  outcome = "answered",
) {
  return (vars: { text: string }) => {
    const turn = [
      message(1, "traveller", vars.text),
      message(2, "trigo", reply, extra),
    ];
    s.messages = turn;
    return {
      ok: {
        conversationId: CONVERSATION,
        turnId: "t-1",
        outcome,
        messages: turn,
        remainingToday: 19,
        resetsAt: s.resetsAt,
        team: { state: "none" },
      },
    };
  };
}

function open(
  aboutCardId: string | null = null,
  conversationId: string | null = null,
) {
  const onConversation = vi.fn();
  renderWithQuery(
    <TrigoSheet
      open
      request={{ conversationId, aboutCardId }}
      destinationKey={null}
      onClose={() => {}}
      onConversation={onConversation}
    />,
  );
  return { onConversation };
}

async function write(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(COMPOSER_LABEL), text);
  return user;
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

beforeEach(() => {
  s.signedIn = true;
  s.release = { open: true, pending: false, stage: "all" };
  s.consent = { ...s.consent, data: { ...s.consent.data, accepted: true } };
  s.messages = [];
  s.remainingToday = 20;
  s.sending = false;
  s.sent = [];
  s.answer = null;
  s.accepted = [];
  s.withdrawn = 0;
  s.marked = [];
  sessionStorage.clear();
  setOnline(true);
});

afterEach(() => setOnline(true));

describe("Trigo sheet: who may chat", () => {
  it("signed out, says why and offers the way in back to this address", () => {
    s.signedIn = false;
    open();
    expect(screen.getByText(SIGNED_OUT_LINE)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: SIGN_IN });
    expect(link.getAttribute("href")).toMatch(/^\/account\?next=/);
    expect(screen.queryByLabelText(COMPOSER_LABEL)).toBeNull();
  });

  it("with the release closed, says so and offers no composer", () => {
    s.release = { open: false, pending: false, stage: "off" };
    open();
    expect(screen.getByText(NOT_RELEASED_LINE)).toBeInTheDocument();
    expect(screen.queryByLabelText(COMPOSER_LABEL)).toBeNull();
  });

  it("shows the notice word for word and accepts the version shown", async () => {
    s.consent = { ...s.consent, data: { ...s.consent.data, accepted: false } };
    open();
    const notice = screen.getByText(/Trigo answers from Yuvoy's listings\./);
    expect(notice.textContent).toBe(s.consent.data.noticeText);
    expect(screen.queryByLabelText(COMPOSER_LABEL)).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: ACCEPT }));
    expect(s.accepted).toEqual([{ noticeVersion: "v3" }]);
  });
});

describe("Trigo sheet: the chat", () => {
  it("greets with the general chips, and the listing's from a listing", () => {
    open();
    expect(screen.getByText(GREETING)).toBeInTheDocument();
    for (const chip of CHIPS_GENERAL) {
      expect(screen.getByText(chip)).toBeInTheDocument();
    }
  });

  it("offers the listing's chips when opened about a listing", () => {
    open("exp:scuba-havelock");
    for (const chip of CHIPS_LISTING) {
      expect(screen.getByText(chip)).toBeInTheDocument();
    }
  });

  it("sends the text with its stored key and the card, and shows the reply", async () => {
    s.answer = answered("Havelock has two dive shops listed.", {
      handoffOffer: true,
    });
    const { onConversation } = open("exp:scuba-havelock");
    const user = await write("Is diving safe for beginners?");
    const key = readDraft()?.key;
    await user.keyboard("{Enter}");

    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]).toMatchObject({
      key,
      text: "Is diving safe for beginners?",
      aboutCardId: "exp:scuba-havelock",
    });
    expect(key).toMatch(/^trg-web-/);
    expect(
      screen.getByText("Havelock has two dive shops listed."),
    ).toBeInTheDocument();
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "polite");
    const team = screen.getByRole("link", { name: ASK_THE_TEAM });
    expect(team.getAttribute("href")).toBe("/help");
    expect(onConversation).toHaveBeenCalledWith(CONVERSATION);
    expect(screen.getByLabelText(COMPOSER_LABEL)).toHaveValue("");
    expect(screen.getByLabelText(COMPOSER_LABEL)).toHaveFocus();
  });

  it("marks the chat read up to the newest message on screen", () => {
    s.messages = [message(4, "trigo", "Hello"), message(9, "team", "Hi")];
    renderWithQuery(
      <TrigoSheet
        open
        request={{ conversationId: CONVERSATION, aboutCardId: null }}
        destinationKey={null}
        onClose={() => {}}
        onConversation={() => {}}
      />,
    );
    expect(s.marked).toEqual([9]);
  });

  it("draws a reply's safety answer under it, with the server's label", () => {
    s.messages = [
      message(2, "trigo", "Swim only between the flags.", {
        safetyAnswer: {
          id: "5c4d3e2f-1a0b-4c9d-8e7f-6a5b4c3d2e1f",
          topic: "sea_swimming",
          text: "Lifeguards watch the flagged stretch from 8 to 6.",
          label: "Safety answer checked by the Yuvoy team",
        },
      }),
    ];
    renderWithQuery(
      <TrigoSheet
        open
        request={{ conversationId: CONVERSATION, aboutCardId: null }}
        destinationKey={null}
        onClose={() => {}}
        onConversation={() => {}}
      />,
    );
    const log = screen.getByRole("log");
    expect(
      within(log).getByText("Safety answer checked by the Yuvoy team"),
    ).toBeInTheDocument();
    expect(
      within(log).getByText(
        "Lifeguards watch the flagged stretch from 8 to 6.",
      ),
    ).toBeInTheDocument();
  });

  it("says how many messages are left from 5 down", () => {
    s.remainingToday = 3;
    open();
    expect(screen.getByText(remainingLine(3))).toBeInTheDocument();
  });

  it("at the day's limit, shows the limit and turns Send off", async () => {
    s.remainingToday = 0;
    open();
    expect(screen.getByText(LIMIT_LINE)).toBeInTheDocument();
    await write("one more");
    expect(screen.getByRole("button", { name: SEND })).toBeDisabled();
  });

  it("Try again on a timed-out reply sends the same text with a new key", async () => {
    s.answer = answered("That took too long.", {}, "timed_out");
    open();
    const user = await write("Ferry times to Neil?");
    await user.keyboard("{Enter}");
    s.answer = null;
    await user.click(screen.getByRole("button", { name: TRY_AGAIN }));
    expect(s.sent).toHaveLength(2);
    expect(s.sent[1]?.text).toBe("Ferry times to Neil?");
    expect(s.sent[1]?.key).not.toBe(s.sent[0]?.key);
  });

  it("Turn off Trigo withdraws the consent", async () => {
    open();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: TURN_OFF }));
    expect(s.withdrawn).toBe(1);
  });
});

describe("Trigo sheet: when a message does not go", () => {
  async function failWith(failure: TrigoFailure) {
    s.answer = () => ({ failure });
    open();
    const user = await write("Where to stay in Gokarna?");
    await user.keyboard("{Enter}");
    return user;
  }

  it("a failure says so, keeps the text, and Try again reuses the key", async () => {
    const user = await failWith({ kind: "failure" });
    expect(screen.getByText(FAILURE_LINE)).toBeInTheDocument();
    expect(screen.getByLabelText(COMPOSER_LABEL)).toHaveValue(
      "Where to stay in Gokarna?",
    );
    s.answer = null;
    await user.click(screen.getByRole("button", { name: TRY_AGAIN }));
    expect(s.sent[1]?.key).toBe(s.sent[0]?.key);
  });

  it("a refusal the same send would get again keeps the text and offers no Try again", async () => {
    await failWith({ kind: "rejected" });
    expect(screen.getByText(FAILURE_LINE)).toBeInTheDocument();
    expect(screen.getByLabelText(COMPOSER_LABEL)).toHaveValue(
      "Where to stay in Gokarna?",
    );
    expect(
      screen.queryByRole("button", { name: TRY_AGAIN }),
    ).not.toBeInTheDocument();
  });

  it.each([
    [{ kind: "busy", message: "Trigo is busy. Try again in a minute." }],
    [{ kind: "rate_limited", message: "Slow down a little." }],
  ] as [TrigoFailure & { message: string }][])(
    "%o shows the API's own sentence",
    async (failure) => {
      await failWith(failure);
      expect(screen.getByText(failure.message)).toBeInTheDocument();
    },
  );

  it.each([
    [{ kind: "in_progress" }],
    [{ kind: "idempotency_in_progress" }],
  ] as [TrigoFailure][])(
    "%o says the last message is still being answered, and Try again sends the same key",
    async (failure) => {
      const user = await failWith(failure);
      expect(screen.getByText(IN_PROGRESS_LINE)).toBeInTheDocument();
      s.answer = null;
      await user.click(screen.getByRole("button", { name: TRY_AGAIN }));
      expect(s.sent).toHaveLength(2);
      expect(s.sent[1]?.key).toBe(s.sent[0]?.key);
      expect(s.sent[1]?.text).toBe(s.sent[0]?.text);
    },
  );

  it("the day's limit shows the limit panel and turns Send off", async () => {
    await failWith({
      kind: "limit",
      resetsAt: "2026-11-02T18:30:00Z",
      message: "That's today's 20.",
    });
    expect(screen.getByText(LIMIT_LINE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: SEND })).toBeDisabled();
  });

  it("signed out on a send shows the way back in", async () => {
    await failWith({ kind: "signed_out" });
    expect(screen.getByText(SIGNED_OUT_LINE)).toBeInTheDocument();
  });

  it("not released on a send says so", async () => {
    await failWith({ kind: "not_released", message: "Not found." });
    expect(screen.getByText(NOT_RELEASED_LINE)).toBeInTheDocument();
    expect(s.sent).toHaveLength(1);
  });

  it("a 404 on a send to a chat that is gone starts a new chat once, with a new key", async () => {
    const NEW_CHAT = "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";
    const reply = answered("Try the beach huts near Om Beach.");
    s.answer = (vars) =>
      s.sent.length === 1
        ? { failure: { kind: "not_released", message: "Not found." } }
        : { ok: { ...reply(vars).ok, conversationId: NEW_CHAT } };
    const { onConversation } = open(null, CONVERSATION);
    const user = await write("Where to stay in Gokarna?");
    await user.keyboard("{Enter}");
    expect(s.sent).toHaveLength(2);
    expect(s.sent[0]?.conversationId).toBe(CONVERSATION);
    expect(s.sent[1]?.conversationId).toBeUndefined();
    expect(s.sent[1]?.text).toBe("Where to stay in Gokarna?");
    expect(s.sent[1]?.key).not.toBe(s.sent[0]?.key);
    expect(screen.queryByText(NOT_RELEASED_LINE)).toBeNull();
    expect(
      await screen.findByText("Try the beach huts near Om Beach."),
    ).toBeInTheDocument();
    expect(onConversation).toHaveBeenCalledWith(NEW_CHAT);
  });

  it("a 404 again on the new chat says not released, with no third send", async () => {
    s.answer = () => ({
      failure: { kind: "not_released", message: "Not found." },
    });
    open(null, CONVERSATION);
    const user = await write("Where to stay in Gokarna?");
    await user.keyboard("{Enter}");
    expect(s.sent).toHaveLength(2);
    expect(screen.getByText(NOT_RELEASED_LINE)).toBeInTheDocument();
  });

  it("consent needed again brings the notice back with no resend", async () => {
    await failWith({ kind: "consent", noticeVersion: "v4" });
    expect(
      screen.getByText(/Trigo answers from Yuvoy's listings\./),
    ).toBeInTheDocument();
    expect(s.sent).toHaveLength(1);
  });

  it("age needed asks for the birth year", async () => {
    await failWith({ kind: "age" });
    expect(screen.getByText(AGE_LINE)).toBeInTheDocument();
  });

  it("offline on a send says so", async () => {
    await failWith({ kind: "offline" });
    expect(screen.getByText(OFFLINE_LINE)).toBeInTheDocument();
  });
});

describe("Trigo sheet: offline", () => {
  it("says so, keeps the text and turns Send off until back online", async () => {
    open();
    await write("Is the ferry running?");
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText(OFFLINE_LINE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: SEND })).toBeDisabled();
    expect(screen.getByLabelText(COMPOSER_LABEL)).toHaveValue(
      "Is the ferry running?",
    );
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText(OFFLINE_LINE)).toBeNull();
    expect(screen.getByRole("button", { name: SEND })).toBeEnabled();
  });
});
