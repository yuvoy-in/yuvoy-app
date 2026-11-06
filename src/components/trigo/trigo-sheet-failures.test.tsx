import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import type { TrigoFailure, TrigoMessage } from "@/lib/trigo/api";
import {
  AGE_LINE,
  FAILURE_LINE,
  IN_PROGRESS_LINE,
  LIMIT_LINE,
  NOT_RELEASED_LINE,
  OFFLINE_LINE,
  SIGNED_OUT_LINE,
  TRY_AGAIN,
  TRY_AGAIN_SOON,
} from "@/lib/trigo/words";
import { TrigoSheet } from "./trigo-sheet";
import { COMPOSER_LABEL, SEND } from "./ui-words";

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
 *
 * The mocks and set-up below are a copy of trigo-sheet.test.tsx's, since
 * vitest mocks are per file.
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

afterEach(() => {
  setOnline(true);
  // A test that times out under fake timers never reaches its own
  // useRealTimers, and every test after it would wait on a frozen clock.
  vi.useRealTimers();
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
      // No Retry-After: Try again is on at once, as before.
      expect(screen.getByRole("button", { name: TRY_AGAIN })).toBeEnabled();
      expect(screen.queryByText(TRY_AGAIN_SOON)).not.toBeInTheDocument();
      s.answer = null;
      await user.click(screen.getByRole("button", { name: TRY_AGAIN }));
      expect(s.sent).toHaveLength(2);
      expect(s.sent[1]?.key).toBe(s.sent[0]?.key);
      expect(s.sent[1]?.text).toBe(s.sent[0]?.text);
    },
  );

  /*
    The two Retry-After tests type on the real clock and fake setTimeout only
    from the send on. user-event's calls end on Testing Library's async
    wrapper, which waits for a setTimeout(0) that only Jest's fake timers are
    advanced past, so under vitest's it never returns. The send itself is a
    plain click.
  */
  it("Try again waits out the answer's Retry-After, then sends the same key", async () => {
    s.answer = () => ({
      failure: { kind: "idempotency_in_progress", retryAfterSeconds: 3 },
    });
    open();
    const user = await write("Where to stay in Gokarna?");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(screen.getByRole("button", { name: SEND }));

      const retry = screen.getByRole("button", { name: TRY_AGAIN });
      expect(retry).toBeDisabled();
      expect(retry).toHaveAccessibleDescription(TRY_AGAIN_SOON);
      // Send is held too, so the wait cannot be skipped from the composer.
      expect(screen.getByRole("button", { name: SEND })).toBeDisabled();

      act(() => vi.advanceTimersByTime(2_999));
      expect(screen.getByRole("button", { name: TRY_AGAIN })).toBeDisabled();
      expect(screen.getByRole("button", { name: SEND })).toBeDisabled();

      act(() => vi.advanceTimersByTime(1));
      expect(screen.getByRole("button", { name: TRY_AGAIN })).toBeEnabled();
      expect(screen.getByRole("button", { name: SEND })).toBeEnabled();
      expect(screen.queryByText(TRY_AGAIN_SOON)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }

    s.answer = null;
    await user.click(screen.getByRole("button", { name: TRY_AGAIN }));
    expect(s.sent).toHaveLength(2);
    expect(s.sent[1]?.key).toBe(s.sent[0]?.key);
  });

  it("a rate limit with Retry-After holds Send until it has passed", async () => {
    s.answer = () => ({
      failure: {
        kind: "rate_limited",
        message: "Slow down a little.",
        retryAfterSeconds: 2,
      },
    });
    open();
    await write("Where to stay in Gokarna?");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(screen.getByRole("button", { name: SEND }));

      expect(screen.getByText("Slow down a little.")).toBeInTheDocument();
      expect(screen.getByText(TRY_AGAIN_SOON)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: SEND })).toBeDisabled();

      act(() => vi.advanceTimersByTime(1_999));
      expect(screen.getByRole("button", { name: SEND })).toBeDisabled();

      act(() => vi.advanceTimersByTime(1));
      expect(screen.getByRole("button", { name: SEND })).toBeEnabled();
      expect(screen.queryByText(TRY_AGAIN_SOON)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

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
