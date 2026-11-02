import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import {
  CLUB_REPORT_WORDS as W,
  PEOPLE_ERROR_WORDS,
} from "@/lib/groups/club-words";
import { PEOPLE_CLOSED_LINE } from "@/lib/groups/clubs";
import { ClubReportSheet } from "./club-report-sheet";
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
 * Something wrong? Tell us (yuvoy-mobile#386). Nothing goes until a reason
 * is picked, and "Something else" goes only with a note.
 */

function refusal(status: number, code: string, message: string) {
  return HttpResponse.json(
    { error: { code, message, requestId: "01JTEST" } },
    { status },
  );
}

/** Keeps each body sent, and answers with `respond`. */
function reports(
  respond: () => Response = () =>
    HttpResponse.json({ message: M.reportThanks }, { status: 202 }),
) {
  const bodies: unknown[] = [];
  server.use(
    http.post(`${BASE}/clubs/:clubId/reports`, async ({ request }) => {
      bodies.push(await request.json());
      return respond();
    }),
  );
  return bodies;
}

function open() {
  const onClose = vi.fn();
  const onLeave = vi.fn();
  __signInAppRouteMock();
  renderWithQuery(
    <ClubReportSheet
      clubId={CLUB_IDS.reefRunners}
      name="Havelock Reef Runners"
      onClose={onClose}
      onLeave={onLeave}
    />,
  );
  return { onClose, onLeave };
}

const sendButton = () => screen.getByRole("button", { name: W.send });

afterEach(() => {
  server.events.removeAllListeners();
  cleanup();
});

describe("reporting a group", () => {
  it("holds Send until a reason is picked, and marks the one picked", async () => {
    reports();
    const user = userEvent.setup();
    open();

    expect(sendButton()).toBeDisabled();
    const wrong = screen.getByRole("button", { name: "The details are wrong" });
    expect(wrong).toHaveAttribute("aria-pressed", "false");

    await user.click(wrong);
    expect(wrong).toHaveAttribute("aria-pressed", "true");
    expect(sendButton()).toBeEnabled();
  });

  it("asks for the note when it is Something else, and sends nothing", async () => {
    const bodies = reports();
    const user = userEvent.setup();
    open();

    // Not scolded before a press.
    await user.click(screen.getByRole("button", { name: "Something else" }));
    expect(screen.getByLabelText(W.noteRequired)).toBeRequired();
    expect(screen.queryByText(W.noteMissing)).toBeNull();

    await user.click(sendButton());
    expect(await screen.findByText(W.noteMissing)).toBeInTheDocument();
    expect(screen.getByLabelText(W.noteRequired)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(bodies).toEqual([]);
  });

  it("sends the reason and the note, trimmed, and shows the answer", async () => {
    const bodies = reports();
    const user = userEvent.setup();
    const { onClose } = open();

    await user.click(screen.getByRole("button", { name: "Something else" }));
    await user.type(
      screen.getByLabelText(W.noteRequired),
      "  It meets on Saturdays now.  ",
    );
    await user.click(sendButton());

    expect(await screen.findByText(M.reportThanks)).toBeInTheDocument();
    expect(bodies).toEqual([
      { reason: "other", note: "It meets on Saturdays now." },
    ]);
    await user.click(screen.getByRole("button", { name: W.done }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sends the reason alone when no note is typed", async () => {
    const bodies = reports();
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "It's offensive" }));
    await user.click(sendButton());

    await waitFor(() => expect(bodies).toEqual([{ reason: "offensive" }]));
  });

  it("says when People needs a first name first, and holds Send", async () => {
    reports(() => refusal(409, "name_required", M.needsName));
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "It isn't a real group" }));
    await user.click(sendButton());

    expect(
      await screen.findByText(PEOPLE_ERROR_WORDS.name),
    ).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });

  it("says when People needs the age first, and holds Send", async () => {
    reports(() => refusal(403, "adult_confirmation_required", M.adultsOnly));
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "It isn't a real group" }));
    await user.click(sendButton());

    expect(await screen.findByText(PEOPLE_ERROR_WORDS.age)).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });

  it("says People closed, never sent, when a 404 finds the release closed", async () => {
    people("off");
    reports(() => refusal(404, "not_found", M.notOpen));
    const user = userEvent.setup();
    const { onLeave } = open();

    await user.click(screen.getByRole("button", { name: "It isn't a real group" }));
    await user.click(sendButton());

    expect(await screen.findByText(PEOPLE_CLOSED_LINE)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: W.done }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("ends with Done back to the directory when the group is gone", async () => {
    people("all");
    reports(() => refusal(404, "not_found", M.notFound));
    const user = userEvent.setup();
    const { onClose, onLeave } = open();

    await user.click(screen.getByRole("button", { name: "It isn't a real group" }));
    await user.click(sendButton());

    expect(await screen.findByText(M.notFound)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: W.done }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
