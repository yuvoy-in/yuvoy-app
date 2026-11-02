import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import {
  CLUB_API_WORDS,
  CLUB_REMOVAL_WORDS as W,
  FORM_GONE_WORDS,
} from "@/lib/groups/club-words";
import { PEOPLE_CLOSED_LINE } from "@/lib/groups/clubs";
import { ClubRemovalSheet } from "./club-removal-sheet";
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
 * Remove this listing (yuvoy-mobile#386). Anyone may ask: signed out it
 * carries no credential, signed in it carries the session. The reason is
 * the whole body.
 */

type Sent = { body: unknown; auth: string | null };

/** Keeps each body sent and its credential, and answers with `respond`. */
function removals(respond: () => Response) {
  const sent: Sent[] = [];
  server.use(
    http.post(
      `${BASE}/clubs/:clubId/removal-requests`,
      async ({ request }) => {
        sent.push({
          body: await request.json(),
          auth: request.headers.get("authorization"),
        });
        return respond();
      },
    ),
  );
  return sent;
}

const receipt = (removed: boolean, message: string) => () =>
  HttpResponse.json({ removed, message }, { status: 202 });

function open() {
  const onClose = vi.fn();
  const onLeave = vi.fn();
  renderWithQuery(
    <ClubRemovalSheet
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

describe("asking for a listing to come down", () => {
  it("holds Send until a reason is picked", () => {
    removals(receipt(false, M.removalQueued));
    open();
    expect(screen.getByText(W.lead("Havelock Reef Runners"))).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });

  it("sends the reason alone, signed out with no credential, and Done closes", async () => {
    const sent = removals(receipt(false, M.removalQueued));
    const user = userEvent.setup();
    const { onClose, onLeave } = open();

    await user.click(screen.getByRole("button", { name: "It isn't a real group" }));
    await user.click(sendButton());

    expect(await screen.findByText(M.removalQueued)).toBeInTheDocument();
    expect(sent).toEqual([{ body: { reason: "not_a_real_group" }, auth: null }]);

    await user.click(screen.getByRole("button", { name: W.done }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("carries the session when signed in", async () => {
    const sent = removals(receipt(false, M.removalQueued));
    __signInAppRouteMock();
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Something else" }));
    await user.click(sendButton());

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toEqual({ reason: "other" });
    expect(sent[0]!.auth).toMatch(/^Bearer sess_/);
  });

  it("says the listing is hidden now, and Done goes back to the directory", async () => {
    removals(receipt(true, M.removedNow));
    const user = userEvent.setup();
    const { onClose, onLeave } = open();

    await user.click(
      screen.getByRole("button", { name: "We run it and want it off Yuvoy" }),
    );
    await user.click(sendButton());

    expect(await screen.findByText(M.removedNow)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: W.done }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says People closed, never sent, when a 404 finds the release closed", async () => {
    people("off");
    removals(() =>
      HttpResponse.json(
        { error: { code: "not_found", message: M.notOpen, requestId: "01JTEST" } },
        { status: 404 },
      ),
    );
    const user = userEvent.setup();
    const { onLeave } = open();

    await user.click(screen.getByRole("button", { name: "Something else" }));
    await user.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      PEOPLE_CLOSED_LINE,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: W.done })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: FORM_GONE_WORDS.back }),
    );
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("says the group is not there, as an alert and not a receipt, when it is gone", async () => {
    people("all");
    removals(() =>
      HttpResponse.json(
        { error: { code: "not_found", message: M.notFound, requestId: "01JTEST" } },
        { status: 404 },
      ),
    );
    const user = userEvent.setup();
    const { onClose, onLeave } = open();

    await user.click(screen.getByRole("button", { name: "Something else" }));
    await user.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      CLUB_API_WORDS.gone,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: W.done })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: FORM_GONE_WORDS.back }),
    );
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says too many requests in the API's words, and holds Send", async () => {
    removals(() =>
      HttpResponse.json(
        {
          error: {
            code: "rate_limited",
            message: M.removalBusy,
            requestId: "01JTEST",
          },
        },
        { status: 429 },
      ),
    );
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Something else" }));
    await user.click(sendButton());

    expect(await screen.findByText(M.removalBusy)).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });
});
