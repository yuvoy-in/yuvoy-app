import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { YuvoyError } from "@/lib/api/errors";
import type {
  TrigoActionCard,
  TrigoActionConfirmation,
} from "@/lib/trigo/actions";
import { GO_TO_CHECKOUT, TRY_AGAIN_SOON } from "@/lib/trigo/words";
import { ActionCard } from "./action-card";
import { CARD_ACTIONS_CLOSED } from "./ui-words";

/**
 * A Trigo confirm card's buttons under a failure that sends Retry-After
 * (yuvoy-app#223): held for the wait, with the wait line beside them, then
 * a tap again. The rest of the card is action-card.test.tsx's; the mocked
 * hooks and release below are a copy of its own, since vitest mocks are per
 * file.
 */

type Answer =
  | { ok: TrigoActionConfirmation | { message: unknown } }
  | { error: unknown }
  | null;

const s = vi.hoisted(() => ({
  push: vi.fn(),
  confirmPending: false,
  declinePending: false,
  confirm: null as null | ((vars: unknown) => unknown),
  decline: null as null | ((vars: unknown) => unknown),
  confirmed: [] as unknown[],
  declined: [] as unknown[],
  release: { open: true, pending: false, stage: "all" },
}));

vi.mock("@/lib/site/use-release", () => ({
  useRelease: () => s.release,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: s.push, replace: vi.fn(), prefetch: vi.fn() }),
}));

interface Callbacks {
  onSuccess?: (result: unknown) => void;
  onError?: (error: unknown) => void;
  onSettled?: () => void;
}

function settle(answer: Answer, cb: Callbacks | undefined) {
  if (!answer) return; // still out
  if ("ok" in answer) cb?.onSuccess?.(answer.ok);
  else cb?.onError?.(answer.error);
  cb?.onSettled?.();
}

vi.mock("@/lib/trigo/actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/trigo/actions")>()),
  useConfirmTrigoAction: () => ({
    isPending: s.confirmPending,
    mutate: (vars: unknown, cb?: Callbacks) => {
      s.confirmed.push(vars);
      settle(s.confirm?.(vars) as Answer, cb);
    },
  }),
  useDeclineTrigoAction: () => ({
    isPending: s.declinePending,
    mutate: (vars: unknown, cb?: Callbacks) => {
      s.declined.push(vars);
      settle(s.decline?.(vars) as Answer, cb);
    },
  }),
}));

const ACTION = "2b7e4c1a-9d3f-4e5a-8b6c-7d8e9f0a1b2c";
const CHAT = "6f1c2d3e-4a5b-4c6d-8e7f-8091a2b3c4d5";

function card(over: Partial<TrigoActionCard> = {}): TrigoActionCard {
  return {
    actionId: ACTION,
    kind: "book",
    state: "proposed",
    expiresAt: "2026-11-02T05:00:00Z",
    heading: "Check before I book",
    lines: ["Saturday, 07:00", "2 people", "Rs 9,000 in all"],
    confirmLabel: "Book",
    declineLabel: "Not now",
    ...over,
  };
}

function draw(c: TrigoActionCard) {
  return renderWithQuery(<ActionCard card={c} conversationId={CHAT} />);
}

function refusal(
  status: number,
  code: string,
  message: string,
  reason = "",
  retryAfterSeconds?: number,
) {
  return new YuvoyError({
    status,
    code,
    message,
    details: reason ? { reason } : undefined,
    retryAfterSeconds,
  });
}

beforeEach(() => {
  s.push.mockReset();
  s.confirmPending = false;
  s.declinePending = false;
  s.confirm = null;
  s.decline = null;
  s.confirmed = [];
  s.declined = [];
  s.release = { open: true, pending: false, stage: "all" };
});

/*
  The card's buttons wait out the answer's Retry-After, as the chat's Try
  again does. The taps are plain clicks under a faked setTimeout: user-event
  never returns under vitest's fake timers (trigo-sheet.test.tsx says why).
*/
describe("a failure that sends Retry-After", () => {
  function heldFor(seconds: number, buttons: string[]) {
    for (const name of buttons) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(TRY_AGAIN_SOON);
    }
    act(() => vi.advanceTimersByTime(seconds * 1000 - 1));
    for (const name of buttons) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    act(() => vi.advanceTimersByTime(1));
    for (const name of buttons) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
    expect(screen.queryByText(TRY_AGAIN_SOON)).toBeNull();
  }

  it("a 429 holds Book and Not now for it, then a tap again", () => {
    s.confirm = () => ({
      error: refusal(429, "rate_limited", "Slow down.", "", 3),
    });
    draw(card());
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(screen.getByRole("button", { name: "Book" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Slow down.");
      heldFor(3, ["Book", "Not now"]);
    } finally {
      vi.useRealTimers();
    }
    s.confirm = null;
    fireEvent.click(screen.getByRole("button", { name: "Book" }));
    expect(s.confirmed).toHaveLength(2);
  });

  it("a decline answered 429 holds both buttons too", () => {
    s.decline = () => ({
      error: refusal(429, "rate_limited", "Slow down.", "", 2),
    });
    draw(card());
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(screen.getByRole("button", { name: "Not now" }));
      heldFor(2, ["Book", "Not now"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Go to checkout on a confirmed card waits the same way", () => {
    s.confirm = () => ({
      error: refusal(503, "unavailable", "Cards are off.", "", 2),
    });
    draw(card({ state: "confirmed" }));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(screen.getByRole("button", { name: GO_TO_CHECKOUT }));
      expect(screen.getByRole("alert")).toHaveTextContent("Cards are off.");
      heldFor(2, [GO_TO_CHECKOUT]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("no wait line once the release closes under a held Go to checkout", () => {
    s.confirm = () => ({
      error: refusal(429, "rate_limited", "Slow down.", "", 5),
    });
    const { rerender } = draw(card({ state: "confirmed" }));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(screen.getByRole("button", { name: GO_TO_CHECKOUT }));
      expect(screen.getByText(TRY_AGAIN_SOON)).toBeInTheDocument();
      s.release = { open: false, pending: false, stage: "off" };
      rerender(
        <ActionCard
          card={card({ state: "confirmed" })}
          conversationId={CHAT}
        />,
      );
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.queryByText(TRY_AGAIN_SOON)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a proposed card keeps the wait line beside a held Not now when the release closes", () => {
    s.confirm = () => ({
      error: refusal(429, "rate_limited", "Slow down.", "", 5),
    });
    const { rerender } = draw(card());
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(screen.getByRole("button", { name: "Book" }));
      s.release = { open: false, pending: false, stage: "off" };
      rerender(<ActionCard card={card()} conversationId={CHAT} />);
      expect(screen.getByText(CARD_ACTIONS_CLOSED)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Book" })).toBeNull();
      heldFor(5, ["Not now"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("with no Retry-After nothing is held", async () => {
    s.confirm = () => ({ error: refusal(429, "rate_limited", "Slow down.") });
    draw(card());
    await userEvent.click(screen.getByRole("button", { name: "Book" }));
    expect(screen.getByRole("button", { name: "Book" })).toBeEnabled();
    expect(screen.queryByText(TRY_AGAIN_SOON)).toBeNull();
  });
});
