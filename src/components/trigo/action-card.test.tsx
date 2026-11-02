import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { YuvoyError } from "@/lib/api/errors";
import type {
  CardActionVars,
  TrigoActionCard,
  TrigoActionConfirmation,
} from "@/lib/trigo/actions";
import {
  CARD_CHECKING,
  CARD_EXPIRED_LINE,
  DATE_ALERT_DONE,
  GO_TO_CHECKOUT,
  SIGNED_OUT_LINE,
  TRIP_DRAFT_DONE,
  bookedLine,
} from "@/lib/trigo/words";
import { ActionCard, TRIPS_PATH } from "./action-card";
import {
  CARD_DECLINED,
  CARD_FAILURE,
  CARD_LABEL,
  CARD_NOT_ON_WEB,
  CARD_SUPERSEDED,
} from "./ui-words";

/**
 * A Trigo confirm card (yuvoy-app#223 part 2): drawn as the server sends it,
 * a state line for each state, and what each answer or failure does to it.
 *
 * The hooks are mocked: a tap is handed to `s.confirm` or `s.decline`, which
 * answer with a result or an error. The cache work behind them is
 * `src/lib/trigo/actions.test.tsx`'s. `classifyCardError` is the real one, so
 * failures are drawn from status and code, never from message text.
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

function refusal(status: number, code: string, message: string, reason = "") {
  return new YuvoyError({
    status,
    code,
    message,
    details: reason ? { reason } : undefined,
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
});

describe("ActionCard, drawn as sent", () => {
  it("shows the server's heading, lines and labels, named for readers", () => {
    draw(card());
    const group = screen.getByRole("group", {
      name: `${CARD_LABEL}: Check before I book`,
    });
    expect(group).toHaveAttribute("data-state", "proposed");
    const lines = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(lines).toEqual(["Saturday, 07:00", "2 people", "Rs 9,000 in all"]);
    expect(screen.getByRole("button", { name: "Book" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Not now" })).toBeEnabled();
  });

  it("draws eight lines at most", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`);
    draw(card({ lines }));
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
  });

  it("offers only Not now on a change card, which has no web screen", () => {
    draw(card({ kind: "move_booking", confirmLabel: "Move it" }));
    expect(screen.queryByRole("button", { name: "Move it" })).toBeNull();
    expect(screen.getByRole("button", { name: "Not now" })).toBeEnabled();
    expect(screen.getByText(CARD_NOT_ON_WEB)).toBeInTheDocument();
  });
});

describe("ActionCard, a line for each state", () => {
  it.each([
    ["expired", "book", CARD_EXPIRED_LINE],
    ["declined", "book", CARD_DECLINED],
    ["superseded", "book", CARD_SUPERSEDED],
    ["used", "date_alert", DATE_ALERT_DONE],
    ["used", "trip_draft", TRIP_DRAFT_DONE],
  ] as const)("%s %s: %s, no buttons", (state, kind, line) => {
    draw(card({ state, kind }));
    expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("fades a superseded card", () => {
    draw(card({ state: "superseded" }));
    expect(screen.getByTestId("trigo-action-card")).toHaveClass("opacity-60");
  });

  it("links a used book card's reference to the traveller's trips", () => {
    draw(card({ state: "used", bookingReference: "YV-7Q2K" }));
    const link = screen.getByRole("link", { name: bookedLine("YV-7Q2K") });
    expect(link).toHaveAttribute("href", TRIPS_PATH);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers Go to checkout again on a confirmed book card", async () => {
    s.confirm = () => ({ ok: checkout() });
    draw(card({ state: "confirmed" }));
    expect(screen.queryByRole("button", { name: "Book" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: GO_TO_CHECKOUT }));
    expect(s.push).toHaveBeenCalledWith(
      "/e/try-dive/book?date=2026-11-07&slot=slot_a&guests=2",
    );
  });
});

function checkout(): TrigoActionConfirmation {
  return {
    actionId: ACTION,
    state: "confirmed",
    next: {
      checkout: {
        experienceSlug: "try-dive",
        slotId: "slot_a",
        localDate: "2026-11-07",
        guests: 2,
        expectTotalPaise: 900000,
        idempotencyKey: "trg_2b7e4c1a9d3f4e5a8b6c7d8e9f0a1b2c",
      },
    },
  };
}

describe("ActionCard, a tap", () => {
  it("confirms once and opens the card's checkout", async () => {
    s.confirm = () => ({ ok: checkout() });
    draw(card());
    await userEvent.click(screen.getByRole("button", { name: "Book" }));
    expect(s.confirmed).toEqual([
      { actionId: ACTION, kind: "book", conversationId: CHAT },
    ] satisfies CardActionVars[]);
    expect(s.push).toHaveBeenCalledWith(
      "/e/try-dive/book?date=2026-11-07&slot=slot_a&guests=2",
    );
  });

  it("does not open checkout when the card was booked already", async () => {
    s.confirm = () => ({ ok: { ...checkout(), state: "used" } });
    draw(card({ state: "confirmed" }));
    await userEvent.click(screen.getByRole("button", { name: GO_TO_CHECKOUT }));
    expect(s.confirmed).toHaveLength(1);
    expect(s.push).not.toHaveBeenCalled();
  });

  it("does not move on a date alert's done", async () => {
    s.confirm = () => ({
      ok: { actionId: ACTION, state: "used", next: { done: {} } },
    });
    draw(card({ kind: "date_alert", confirmLabel: "One tap" }));
    await userEvent.click(screen.getByRole("button", { name: "One tap" }));
    expect(s.confirmed).toHaveLength(1);
    expect(s.push).not.toHaveBeenCalled();
  });

  it("says it is checking and turns both buttons off while out", () => {
    s.confirmPending = true;
    draw(card());
    expect(screen.getByRole("status")).toHaveTextContent(CARD_CHECKING);
    expect(screen.getByRole("button", { name: "Book" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Not now" })).toBeDisabled();
  });

  it("takes one tap while the first is out", async () => {
    draw(card()); // s.confirm is null: the first tap never settles
    const book = screen.getByRole("button", { name: "Book" });
    await userEvent.click(book);
    await userEvent.click(book);
    expect(s.confirmed).toHaveLength(1);
  });

  it("declines with the card's id", async () => {
    s.decline = () => ({ ok: { message: {} } });
    draw(card());
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(s.declined).toEqual([
      { actionId: ACTION, kind: "book", conversationId: CHAT },
    ]);
    expect(s.confirmed).toHaveLength(0);
  });
});

describe("ActionCard, a failure", () => {
  it.each([
    ["sold out", refusal(409, "action_changed", "Changed.", "sold_out")],
    ["price moved", refusal(409, "action_changed", "Moved.", "price_moved")],
    ["expired", refusal(409, "action_expired", "Expired.")],
    ["not found", refusal(404, "not_found", "No card.")],
  ])("%s: the API's sentence, and the card ends", async (_, error) => {
    s.confirm = () => ({ error });
    draw(card());
    await userEvent.click(screen.getByRole("button", { name: "Book" }));
    expect(screen.getByRole("alert")).toHaveTextContent(error.message);
    expect(screen.queryByRole("button")).toBeNull();
    expect(s.push).not.toHaveBeenCalled();
  });

  it("signed out: the sign-in line, and the card ends", async () => {
    s.confirm = () => ({ error: refusal(401, "unauthorized", "x") });
    draw(card());
    await userEvent.click(screen.getByRole("button", { name: "Book" }));
    expect(screen.getByRole("alert")).toHaveTextContent(SIGNED_OUT_LINE);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each([
    ["alerts full", refusal(409, "date_alerts_full", "Fifty waiting.")],
    ["rate limited", refusal(429, "rate_limited", "Slow down.")],
    ["off", refusal(503, "unavailable", "Cards are off.")],
  ])("%s: the API's sentence, and a tap again", async (_, error) => {
    s.confirm = () => ({ error });
    draw(card());
    await userEvent.click(screen.getByRole("button", { name: "Book" }));
    expect(screen.getByRole("alert")).toHaveTextContent(error.message);
    expect(screen.getByRole("button", { name: "Book" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Book" }));
    expect(s.confirmed).toHaveLength(2);
  });

  it("anything else: our general line, and a tap again", async () => {
    s.confirm = () => ({ error: refusal(500, "internal", "Raw text.") });
    draw(card());
    await userEvent.click(screen.getByRole("button", { name: "Book" }));
    expect(screen.getByRole("alert")).toHaveTextContent(CARD_FAILURE);
    expect(screen.queryByText("Raw text.")).toBeNull();
    expect(screen.getByRole("button", { name: "Book" })).toBeEnabled();
  });
});
