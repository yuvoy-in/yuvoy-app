import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { ReportSheet, REPORT_WORDS, referenceLine } from "./report-sheet";

/**
 * Report a problem (yuvoy-app#179; the API's R2-T2).
 *
 * What is pinned is what the contract and the R2-T4 note decide rather than
 * how the sheet looks: the body is `reason` and `note` and nothing else, the
 * two kinds of 429 say different things, a 404 says the card is gone, a
 * failure keeps the form, and the card leaves this device's lists exactly
 * when the API says to.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const ID = "5b0c3c1e-9a4f-4f7e-8f6a-1d2e3f4a5b6c";

const device = vi.hoisted(() => ({ hidden: [] as string[] }));
vi.mock("@/lib/found/device-store", () => ({
  hideCard: vi.fn(async (id: string) => {
    device.hidden.push(id);
  }),
  hiddenCardIds: vi.fn(async () => new Set(device.hidden)),
  leaveNoticeOff: vi.fn(async () => false),
  setLeaveNoticeOff: vi.fn(async () => {}),
  HIDDEN_CARDS_CHANGED: "yv:hidden-cards-changed",
}));

const outcomes = vi.hoisted(() => ({ recorded: [] as unknown[][] }));
vi.mock("@/lib/found/found-outcomes", () => ({
  recordFound: vi.fn((...args: unknown[]) => {
    outcomes.recorded.push(args);
  }),
}));

beforeEach(() => {
  device.hidden = [];
  outcomes.recorded = [];
});

/** Answers the report, and keeps what was sent and how. */
function answerReports(answer: () => Response): {
  bodies: unknown[];
  auth: (string | null)[];
} {
  const seen = { bodies: [] as unknown[], auth: [] as (string | null)[] };
  server.use(
    http.post(`${BASE}/events/:id/reports`, async ({ request }) => {
      seen.bodies.push(await request.json());
      seen.auth.push(request.headers.get("authorization"));
      return answer();
    }),
  );
  return seen;
}

function receipt(
  hidden: "you" | "everyone",
  reference?: string,
): () => Response {
  return () =>
    HttpResponse.json(
      {
        hidden,
        ...(reference ? { reference } : {}),
        message: "Thanks. A person at Yuvoy will look at this card.",
      },
      { status: 202 },
    );
}

function open(signedIn: boolean) {
  const onHidden = vi.fn();
  const onOpenChange = vi.fn();
  renderWithQuery(
    <ReportSheet
      itemId={ID}
      open
      onOpenChange={onOpenChange}
      signedIn={signedIn}
      onHidden={onHidden}
    />,
  );
  return { onHidden, onOpenChange, user: userEvent.setup() };
}

const sendButton = () =>
  screen.getByRole("button", { name: REPORT_WORDS.send });

describe("the form", () => {
  it("offers the seven reasons, and Send waits for one", () => {
    open(false);
    expect(screen.getAllByRole("radio")).toHaveLength(7);
    for (const label of [
      "The date or time is wrong",
      "It's in a different place",
      "The price is wrong",
      "It's cancelled or has ended",
      "The link doesn't work",
      "It shouldn't be on Yuvoy",
      "Something else",
    ]) {
      expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
    }
    expect(sendButton()).toBeDisabled();
  });

  it("needs a note for Something else, and says so without asking the API", async () => {
    const seen = answerReports(receipt("you"));
    const { user } = open(false);

    await user.click(screen.getByRole("radio", { name: "Something else" }));
    await user.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tell us what's wrong.",
    );
    expect(seen.bodies).toEqual([]);

    await user.type(
      screen.getByLabelText("Anything else we should know?"),
      "  Wrong venue  ",
    );
    await user.click(sendButton());
    await screen.findByRole("status");
    expect(seen.bodies).toEqual([{ reason: "other", note: "Wrong venue" }]);
  });
});

describe("signed out", () => {
  it("sends the reason alone, straight to the API, and hides the card here", async () => {
    const seen = answerReports(receipt("you"));
    const { user, onHidden } = open(false);

    await user.click(screen.getByRole("radio", { name: "The price is wrong" }));
    await user.click(sendButton());

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Thanks. A person at Yuvoy will look at this card.",
    );
    // `reason` and `note` only: never an id of the device, and no empty note.
    expect(seen.bodies).toEqual([{ reason: "wrong_price" }]);
    expect(seen.auth).toEqual([null]);
    expect(device.hidden).toEqual([ID]);
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(outcomes.recorded).toEqual([
      ["problem_reported", ID, "found_detail"],
    ]);
    // No reference, so no line about one.
    expect(screen.queryByText(/Your reference is/)).toBeNull();
  });

  it("hides the card on every signed-out receipt, whatever `hidden` says", async () => {
    answerReports(receipt("everyone"));
    const { user, onHidden } = open(false);

    await user.click(
      screen.getByRole("radio", { name: "The link doesn't work" }),
    );
    await user.click(sendButton());

    await screen.findByRole("status");
    expect(device.hidden).toEqual([ID]);
    expect(onHidden).toHaveBeenCalledTimes(1);
  });
});

describe("signed in", () => {
  it("goes through the proxy with the session, and shows the reference", async () => {
    __signInAppRouteMock("sess_919000000000");
    const seen = answerReports(receipt("everyone", "SR-3F9A12C0"));
    const { user, onHidden } = open(true);

    await user.click(
      screen.getByRole("radio", { name: "The date or time is wrong" }),
    );
    await user.type(
      screen.getByLabelText("Anything else we should know? (optional)"),
      "It starts at 8",
    );
    await user.click(sendButton());

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      "Thanks. A person at Yuvoy will look at this card.",
    );
    expect(status).toHaveTextContent(referenceLine("SR-3F9A12C0"));
    expect(seen.auth).toEqual(["Bearer sess_919000000000"]);
    expect(seen.bodies).toEqual([
      { reason: "wrong_date", note: "It starts at 8" },
    ]);
    // Taken out of view for everyone by the API: nothing to hide here.
    expect(device.hidden).toEqual([]);
    expect(onHidden).not.toHaveBeenCalled();
  });

  it("hides the card here when the API says `hidden: you`", async () => {
    __signInAppRouteMock();
    answerReports(receipt("you", "SR-1"));
    const { user, onHidden } = open(true);

    await user.click(
      screen.getByRole("radio", { name: "It shouldn't be on Yuvoy" }),
    );
    await user.click(sendButton());

    await screen.findByRole("status");
    expect(device.hidden).toEqual([ID]);
    expect(onHidden).toHaveBeenCalledTimes(1);
  });
});

describe("when it does not go", () => {
  const rateLimited = (headers?: Record<string, string>) => () =>
    HttpResponse.json(
      { error: { code: "rate_limited", message: "too many problem reports" } },
      { status: 429, headers },
    );

  it("says a day's limit, with Retry-After, and holds Send", async () => {
    answerReports(rateLimited({ "Retry-After": "40000" }));
    const { user } = open(false);

    await user.click(screen.getByRole("radio", { name: "The price is wrong" }));
    await user.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You've sent a lot of reports today. Try again tomorrow.",
    );
    expect(sendButton()).toBeDisabled();
    expect(device.hidden).toEqual([]);
  });

  it("says too fast without Retry-After, and Send rests three seconds", async () => {
    const seen = answerReports(rateLimited());
    const { user } = open(false);

    await user.click(screen.getByRole("radio", { name: "The price is wrong" }));
    await user.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many requests. Try again shortly.",
    );
    expect(sendButton()).toBeDisabled();
    await waitFor(() => expect(sendButton()).toBeEnabled(), {
      timeout: 5_000,
    });
    // The same report, still there to send again.
    expect(
      screen.getByRole("radio", { name: "The price is wrong" }),
    ).toBeChecked();
    expect(seen.bodies).toHaveLength(1);
  }, 10_000);

  it("says the card is no longer showing on a 404", async () => {
    answerReports(() =>
      HttpResponse.json(
        { error: { code: "not_found", message: "not found" } },
        { status: 404 },
      ),
    );
    const { user } = open(false);

    await user.click(screen.getByRole("radio", { name: "The price is wrong" }));
    await user.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This card is no longer showing.",
    );
    expect(device.hidden).toEqual([]);
    expect(outcomes.recorded).toEqual([]);
  });

  it("keeps the reason and the note when nothing answered", async () => {
    answerReports(() => HttpResponse.error());
    const { user } = open(false);

    await user.click(screen.getByRole("radio", { name: "Something else" }));
    await user.type(
      screen.getByLabelText("Anything else we should know?"),
      "The venue closed",
    );
    await user.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That didn't send. Check your connection and try again.",
    );
    expect(screen.getByRole("radio", { name: "Something else" })).toBeChecked();
    expect(screen.getByLabelText("Anything else we should know?")).toHaveValue(
      "The venue closed",
    );
    expect(sendButton()).toBeEnabled();
    expect(device.hidden).toEqual([]);
  });
});
