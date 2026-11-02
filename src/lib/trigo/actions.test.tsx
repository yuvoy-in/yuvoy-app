import { describe, it, expect, afterEach, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { NetworkError, YuvoyError } from "@/lib/api/errors";
import { StalledError } from "@/lib/api/deadline";
import { qk } from "@/lib/query/policy";
import {
  classifyCardError,
  useConfirmTrigoAction,
  useDeclineTrigoAction,
  type CardActionVars,
  type TrigoActionCard,
  type TrigoActionConfirmation,
} from "./actions";
import type { TrigoChatData, TrigoMessage } from "./api";
import { readTrigoCheckout } from "./checkout-prefill";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";

/**
 * The card's yes and no (yuvoy-app#223 part 2): what each failure means,
 * read by status and code only, and what each answer does to the chat's
 * cache, the checkout prefill and the date alert and trip draft lists.
 */

const CONFIRM = "*/api/v1/trigo/actions/:id/confirm";
const DECLINE = "*/api/v1/trigo/actions/:id/decline";

const CHAT = "6f1c2d3e-4a5b-4c6d-8e7f-8091a2b3c4d5";
const ACTION = "2b7e4c1a-9d3f-4e5a-8b6c-7d8e9f0a1b2c";

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

function apiError(
  status: number,
  code: string,
  message = "A sentence from the API.",
  details?: Record<string, unknown>,
) {
  return new YuvoyError({ status, code, message, details });
}

function envelope(status: number, code: string, message: string) {
  return HttpResponse.json(
    { error: { code, message, requestId: "01JTEST" } },
    { status },
  );
}

function card(kind: TrigoActionCard["kind"] = "book"): TrigoActionCard {
  return {
    actionId: ACTION,
    kind,
    state: "proposed",
    expiresAt: "2026-11-02T05:00:00Z",
    heading: "Book Try-dive at Nemo Reef",
    lines: ["Saturday, 07:00", "2 people"],
    confirmLabel: "Book",
    declineLabel: "Not now",
  };
}

function msg(seq: number, text: string, actionCard?: TrigoActionCard) {
  const m: TrigoMessage = {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    seq,
    role: seq % 2 === 1 ? "traveller" : "trigo",
    text,
    createdAt: "2026-11-02T04:30:00Z",
    cards: [],
    handoffOffer: false,
    removed: false,
    actionCard: actionCard ?? null,
  };
  return m;
}

function seed(
  client: ReturnType<typeof renderWithQuery>["client"],
  kind: TrigoActionCard["kind"] = "book",
) {
  client.setQueryDefaults(qk.trigoConversation(CHAT), { gcTime: Infinity });
  const data: TrigoChatData = {
    conversation: null,
    messages: [
      msg(1, "Beginner dive Saturday for two"),
      msg(2, "Here.", card(kind)),
    ],
    remainingToday: 18,
    resetsAt: null,
    pollAfterSeconds: 0,
  };
  client.setQueryData(qk.trigoConversation(CHAT), data);
}

function chatOf(client: ReturnType<typeof renderWithQuery>["client"]) {
  return client.getQueryData<TrigoChatData>(qk.trigoConversation(CHAT));
}

function Tap({
  which,
  kind = "book",
}: {
  which: "confirm" | "decline";
  kind?: TrigoActionCard["kind"];
}) {
  const confirm = useConfirmTrigoAction();
  const decline = useDeclineTrigoAction();
  const vars: CardActionVars = { actionId: ACTION, kind, conversationId: CHAT };
  const status = which === "confirm" ? confirm.status : decline.status;
  function tap() {
    if (which === "confirm") confirm.mutate(vars);
    else decline.mutate(vars);
  }
  return (
    <>
      <button type="button" onClick={tap}>
        Tap
      </button>
      <p>{status}</p>
    </>
  );
}

const TRG_KEY = `trg_${ACTION.replace(/-/g, "")}`;

const CHECKOUT: TrigoActionConfirmation = {
  actionId: ACTION,
  state: "confirmed",
  next: {
    checkout: {
      experienceSlug: "try-dive-nemo-reef",
      slotId: "slot_try-dive-nemo-reef_a",
      localDate: "2026-08-20",
      guests: 2,
      expectTotalPaise: 900000,
      idempotencyKey: TRG_KEY,
      mode: "allotment",
    },
  },
};

describe("classifyCardError", () => {
  it("reads each refusal by status and code, with the API's sentence", () => {
    expect(
      classifyCardError(
        apiError(409, "action_changed", "Changed.", { reason: "sold_out" }),
      ),
    ).toEqual({ kind: "changed", reason: "sold_out", message: "Changed." });
    for (const reason of [
      "price_moved",
      "time_moved",
      "not_bookable",
      "booking_changed",
    ]) {
      expect(
        classifyCardError(apiError(409, "action_changed", "x", { reason })),
      ).toEqual({ kind: "changed", reason, message: "x" });
    }
    expect(
      classifyCardError(
        apiError(409, "action_changed", "x", { reason: "new_reason" }),
      ),
    ).toEqual({ kind: "changed", reason: null, message: "x" });
    expect(
      classifyCardError(apiError(409, "action_expired", "Expired.")),
    ).toEqual({ kind: "expired", message: "Expired." });
    expect(
      classifyCardError(apiError(409, "date_alerts_full", "Fifty.")),
    ).toEqual({ kind: "alerts_full", message: "Fifty." });
    expect(classifyCardError(apiError(404, "not_found", "No card."))).toEqual({
      kind: "not_found",
      message: "No card.",
    });
    expect(classifyCardError(apiError(401, "unauthorized"))).toEqual({
      kind: "signed_out",
    });
    expect(classifyCardError(apiError(429, "rate_limited", "Slow."))).toEqual(
      { kind: "rate_limited", message: "Slow." },
    );
    expect(classifyCardError(apiError(503, "unavailable", "Off."))).toEqual({
      kind: "unavailable",
      message: "Off.",
    });
  });

  it("reads anything else as a general failure", () => {
    expect(classifyCardError(apiError(409, "conflict"))).toEqual({
      kind: "failure",
    });
    expect(classifyCardError(apiError(500, "internal"))).toEqual({
      kind: "failure",
    });
    expect(classifyCardError(new Error("boom"))).toEqual({ kind: "failure" });
  });

  it("never reads the message text", () => {
    expect(
      classifyCardError(apiError(409, "conflict", "action_expired")),
    ).toEqual({ kind: "failure" });
  });

  it("reads no connection as offline, and a stalled call as a failure", () => {
    expect(classifyCardError(new NetworkError())).toEqual({ kind: "offline" });
    expect(
      classifyCardError(new NetworkError(undefined, new StalledError(30_000))),
    ).toEqual({ kind: "failure" });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(classifyCardError(apiError(503, "unavailable"))).toEqual({
      kind: "offline",
    });
  });
});

describe("useConfirmTrigoAction", () => {
  it("keeps a book card's checkout and marks the card confirmed", async () => {
    __signInAppRouteMock();
    let calls = 0;
    server.use(
      http.post(CONFIRM, ({ params }) => {
        calls += 1;
        expect(params.id).toBe(ACTION);
        return HttpResponse.json(CHECKOUT);
      }),
    );
    const { client } = renderWithQuery(<Tap which="confirm" />);
    seed(client);
    fireEvent.click(screen.getByRole("button", { name: "Tap" }));
    await waitFor(() =>
      expect(screen.getByText("success")).toBeInTheDocument(),
    );

    expect(calls).toBe(1);
    expect(chatOf(client)?.messages[1].actionCard?.state).toBe("confirmed");
    const prefill = readTrigoCheckout("try-dive-nemo-reef", Date.now());
    expect(prefill).toMatchObject({
      actionId: ACTION,
      slotId: "slot_try-dive-nemo-reef_a",
      guests: 2,
      expectTotalPaise: 900000,
      idempotencyKey: TRG_KEY,
    });
  });

  it("marks a date alert card used and reads the alerts again", async () => {
    __signInAppRouteMock();
    server.use(
      http.post(CONFIRM, () =>
        HttpResponse.json({
          actionId: ACTION,
          state: "used",
          next: { done: { alertId: "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" } },
        } satisfies TrigoActionConfirmation),
      ),
    );
    const { client } = renderWithQuery(
      <Tap which="confirm" kind="date_alert" />,
    );
    seed(client, "date_alert");
    client.setQueryDefaults(qk.myDateAlerts(), { gcTime: Infinity });
    client.setQueryDefaults(qk.myTripDrafts(), { gcTime: Infinity });
    client.setQueryData(qk.myDateAlerts(), { alerts: [] });
    client.setQueryData(qk.myTripDrafts(), { drafts: [] });
    fireEvent.click(screen.getByRole("button", { name: "Tap" }));
    await waitFor(() =>
      expect(screen.getByText("success")).toBeInTheDocument(),
    );

    expect(chatOf(client)?.messages[1].actionCard?.state).toBe("used");
    expect(client.getQueryState(qk.myDateAlerts())?.isInvalidated).toBe(true);
    expect(client.getQueryState(qk.myTripDrafts())?.isInvalidated).toBe(false);
  });

  it("reads the trip drafts again after a trip draft card", async () => {
    __signInAppRouteMock();
    server.use(
      http.post(CONFIRM, () =>
        HttpResponse.json({
          actionId: ACTION,
          state: "used",
          next: { done: { draftId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d" } },
        } satisfies TrigoActionConfirmation),
      ),
    );
    const { client } = renderWithQuery(
      <Tap which="confirm" kind="trip_draft" />,
    );
    seed(client, "trip_draft");
    client.setQueryDefaults(qk.myTripDrafts(), { gcTime: Infinity });
    client.setQueryData(qk.myTripDrafts(), { drafts: [] });
    fireEvent.click(screen.getByRole("button", { name: "Tap" }));
    await waitFor(() =>
      expect(screen.getByText("success")).toBeInTheDocument(),
    );

    expect(client.getQueryState(qk.myTripDrafts())?.isInvalidated).toBe(true);
  });

  it("is not retried, and a 401 asks the session again", async () => {
    __signInAppRouteMock();
    let calls = 0;
    server.use(
      http.post(CONFIRM, () => {
        calls += 1;
        return envelope(401, "unauthorized", "Sign in to ask Trigo.");
      }),
    );
    const { client } = renderWithQuery(<Tap which="confirm" />);
    seed(client);
    client.setQueryDefaults(qk.session(), { gcTime: Infinity });
    client.setQueryData(qk.session(), { signedIn: true });
    fireEvent.click(screen.getByRole("button", { name: "Tap" }));
    await waitFor(() => expect(screen.getByText("error")).toBeInTheDocument());

    expect(calls).toBe(1);
    expect(client.getQueryState(qk.session())?.isInvalidated).toBe(true);
    expect(chatOf(client)?.messages[1].actionCard?.state).toBe("proposed");
    expect(readTrigoCheckout("try-dive-nemo-reef", Date.now())).toBeNull();
  });
});

describe("useDeclineTrigoAction", () => {
  it("marks the card declined and adds Trigo's line by its seq", async () => {
    __signInAppRouteMock();
    server.use(
      http.post(DECLINE, () =>
        HttpResponse.json({
          message: msg(3, "No problem. Nothing has been booked or changed."),
        }),
      ),
    );
    const { client } = renderWithQuery(<Tap which="decline" />);
    seed(client);
    fireEvent.click(screen.getByRole("button", { name: "Tap" }));
    await waitFor(() =>
      expect(screen.getByText("success")).toBeInTheDocument(),
    );

    const chat = chatOf(client);
    expect(chat?.messages.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(chat?.messages[1].actionCard?.state).toBe("declined");
    expect(chat?.messages[2].text).toBe(
      "No problem. Nothing has been booked or changed.",
    );
  });
});
