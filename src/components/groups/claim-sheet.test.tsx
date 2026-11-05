import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import {
  CLAIM_FIELD_WORDS,
  CLAIM_WORDS as W,
  CLUB_API_WORDS,
  FORM_GONE_WORDS,
  PEOPLE_ERROR_WORDS,
} from "@/lib/groups/club-words";
import { PEOPLE_CLOSED_LINE } from "@/lib/groups/clubs";
import { ClaimSheet } from "./claim-sheet";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { CLUB_IDS, CLUB_MESSAGES as M } from "../../../mocks/club-fixtures";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/** `GET /app-config` with People at `stage`: what reading the release again after a 404 finds. */
function people(stage: "all" | "off") {
  server.use(
    http.get(`${BASE}/app-config`, () =>
      HttpResponse.json({ releases: { people: stage } }),
    ),
  );
}

/**
 * Claim it (yuvoy-mobile#386). What matters is what is sent: nothing while a
 * required field is empty, the fields trimmed with the optional two left out
 * when empty, and one claim however often Send claim is pressed.
 */

function refusal(status: number, code: string, message: string) {
  return HttpResponse.json(
    { error: { code, message, requestId: "01JTEST" } },
    { status },
  );
}

/** Keeps each body sent, and answers with `respond`. */
function claims(
  respond: () => Response | Promise<Response> = () =>
    HttpResponse.json(
      {
        claimId: "c1a10000-0000-4000-8000-000000000001",
        message: M.claimReceived,
      },
      { status: 202 },
    ),
) {
  const bodies: unknown[] = [];
  server.use(
    http.post(`${BASE}/clubs/:clubId/claims`, async ({ request }) => {
      bodies.push(await request.json());
      return respond();
    }),
  );
  return bodies;
}

function open() {
  const onClose = vi.fn();
  const onLeave = vi.fn();
  const onClaimed = vi.fn();
  __signInAppRouteMock();
  renderWithQuery(
    <ClaimSheet
      clubId={CLUB_IDS.reefRunners}
      name="Havelock Reef Runners"
      onClose={onClose}
      onLeave={onLeave}
      onClaimed={onClaimed}
    />,
  );
  return { onClose, onLeave, onClaimed };
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText(W.roleText),
    "  I run the Sunday route  ",
  );
  await user.type(
    screen.getByLabelText(W.contactEmail),
    "  runner@example.com ",
  );
}

const sendButton = () => screen.getByRole("button", { name: W.send });

afterEach(() => {
  server.events.removeAllListeners();
  cleanup();
});

describe("claiming a group", () => {
  it("asks for the two required fields on each, and sends nothing", async () => {
    const bodies = claims();
    const user = userEvent.setup();
    open();

    await user.click(sendButton());

    expect(
      await screen.findByText(CLAIM_FIELD_WORDS.roleText),
    ).toBeInTheDocument();
    expect(
      screen.getByText(CLAIM_FIELD_WORDS.contactEmail),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(W.roleText)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(bodies).toEqual([]);
  });

  it("sends the fields trimmed, leaves out the empty two, and shows the answer", async () => {
    const bodies = claims();
    const user = userEvent.setup();
    const { onClose, onLeave } = open();

    await fill(user);
    await user.click(sendButton());

    expect(await screen.findByText(M.claimReceived)).toBeInTheDocument();
    expect(bodies).toEqual([
      {
        roleText: "I run the Sunday route",
        contactEmail: "runner@example.com",
      },
    ]);

    await user.click(screen.getByRole("button", { name: W.done }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("sends one claim however often Send claim is pressed", async () => {
    let answer: (r: Response) => void = () => {};
    const bodies = claims(
      () => new Promise<Response>((resolve) => (answer = resolve)),
    );
    const user = userEvent.setup();
    open();

    await fill(user);
    await user.click(sendButton());
    await waitFor(() => expect(bodies).toHaveLength(1));
    // While it works the button reads "Sending", and a press does nothing.
    const busy = screen.getByRole("button", { name: W.sending });
    await user.click(busy);
    await user.click(busy);

    answer(
      HttpResponse.json(
        {
          claimId: "c1a10000-0000-4000-8000-000000000002",
          message: M.claimReceived,
        },
        { status: 202 },
      ),
    );
    expect(await screen.findByText(M.claimReceived)).toBeInTheDocument();
    expect(bodies).toHaveLength(1);
  });

  it("says when People needs the age first, and holds Send claim", async () => {
    claims(() => refusal(403, "adult_confirmation_required", M.adultsOnly));
    const user = userEvent.setup();
    open();

    await fill(user);
    await user.click(sendButton());

    expect(await screen.findByText(PEOPLE_ERROR_WORDS.age)).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });

  it("says when People needs a first name first, and holds Send claim", async () => {
    claims(() => refusal(409, "name_required", M.needsName));
    const user = userEvent.setup();
    open();

    await fill(user);
    await user.click(sendButton());

    expect(
      await screen.findByText(PEOPLE_ERROR_WORDS.name),
    ).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });

  it("says a field the API refused on that field", async () => {
    claims(() =>
      HttpResponse.json(
        {
          error: {
            code: "invalid_input",
            message: M.claimWords,
            details: { proofUrl: "an https address, at most 500 characters" },
            requestId: "01JTEST",
          },
        },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();
    open();

    await fill(user);
    await user.type(screen.getByLabelText(W.proofUrl), "http://example.com");
    await user.click(sendButton());

    await waitFor(() =>
      expect(screen.getByLabelText(W.proofUrl)).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
  });

  it("says People closed, never sent, when a 404 finds the release closed", async () => {
    people("off");
    claims(() => refusal(404, "not_found", M.notOpen));
    const user = userEvent.setup();
    const { onLeave } = open();

    await fill(user);
    await user.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      PEOPLE_CLOSED_LINE,
    );
    expect(screen.queryByText(M.claimReceived)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: W.done })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: FORM_GONE_WORDS.back }),
    );
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("says the group is not there, as an alert and not a receipt, when it is gone", async () => {
    people("all");
    claims(() => refusal(404, "not_found", M.notFound));
    const user = userEvent.setup();
    const { onClose, onLeave } = open();

    await fill(user);
    await user.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      CLUB_API_WORDS.gone,
    );
    expect(screen.queryByText(M.claimReceived)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: W.done })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: FORM_GONE_WORDS.back }),
    );
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
