import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import type { OrganiserEventState } from "@/lib/organisers/types";
import { OrganiserGate } from "./organiser-gate";
import { OrganiserEventScreen, eventIn } from "./organiser-event-screen";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { __resetOrganiserMocks } from "../../../mocks/organiser-handlers";
import {
  EVENT_IDS,
  ORG_IDS,
  VERIFIED_EVENTS,
  liveNumbers,
} from "../../../mocks/organiser-fixtures";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organiser",
}));

function open(
  id: string,
  postId: string,
  more: { sent?: OrganiserEventState; saved?: boolean } = {},
) {
  return renderWithQuery(
    <OrganiserGate>
      <OrganiserEventScreen id={id} postId={postId} {...more} />
    </OrganiserGate>,
  );
}

function live() {
  const event = VERIFIED_EVENTS.find((e) => e.id === EVENT_IDS.live);
  if (!event) throw new Error("the live fixture is missing");
  return event;
}

beforeEach(() => {
  __resetOrganiserMocks();
  __signInAppRouteMock("sess_test");
});
afterEach(cleanup);

describe("eventIn", () => {
  it("finds an event by its post id in any case", () => {
    expect(eventIn(VERIFIED_EVENTS, EVENT_IDS.live.toUpperCase())?.id).toBe(
      EVENT_IDS.live,
    );
    expect(eventIn(undefined, EVENT_IDS.live)).toBeUndefined();
  });
});

describe("OrganiserEventScreen", () => {
  it("shows the state, what was posted, and the card and change links", async () => {
    open(ORG_IDS.verified, EVENT_IDS.live);
    expect(
      await screen.findByRole("heading", { name: live().title }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("organiser-event-state")).toHaveTextContent(
      W.eventStateLabel("live"),
    );
    const posted = screen.getByTestId("organiser-event-posted");
    expect(posted).toHaveTextContent("Sample Forest Gate");
    expect(posted).toHaveTextContent("Tea and a guide included");
    expect(
      within(posted).getByRole("link", {
        name: "https://walkers.example.com/walks",
      }),
    ).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(screen.getByRole("link", { name: W.openCard })).toHaveAttribute(
      "href",
      `/f/${live().eventId}`,
    );
    expect(screen.getByRole("link", { name: W.change })).toHaveAttribute(
      "href",
      `/organiser/${ORG_IDS.verified}/events/${EVENT_IDS.live}/edit`,
    );
  });

  it("gives the desk's reason on a not accepted event, with no change and no cancel", async () => {
    open(ORG_IDS.verified, EVENT_IDS.notAccepted);
    expect(
      await screen.findByTestId("organiser-event-state"),
    ).toHaveTextContent("It does not look like a real event");
    expect(screen.getByTestId("organiser-event-no-change")).toHaveTextContent(
      W.notAcceptedNoChange,
    );
    expect(screen.queryByRole("button", { name: W.cancelEvent })).toBeNull();
    expect(screen.queryByRole("link", { name: W.openCard })).toBeNull();
  });

  it("says an ended event can no longer be changed", async () => {
    open(ORG_IDS.verified, EVENT_IDS.ended);
    expect(
      await screen.findByTestId("organiser-event-no-change"),
    ).toHaveTextContent(W.endedNoChange);
    expect(screen.queryByRole("link", { name: W.change })).toBeNull();
  });

  it("says a suspended organiser cannot change its events, but can still cancel one", async () => {
    server.use(
      http.get(`${BASE}/organisers/${ORG_IDS.suspended}/events`, () =>
        HttpResponse.json({ items: VERIFIED_EVENTS }),
      ),
    );
    open(ORG_IDS.suspended, EVENT_IDS.live);
    expect(
      await screen.findByTestId("organiser-event-no-change"),
    ).toHaveTextContent(W.suspended);
    expect(screen.queryByRole("link", { name: W.change })).toBeNull();
    expect(
      screen.getByRole("button", { name: W.cancelEvent }),
    ).toBeInTheDocument();
  });

  it("cancels only after the confirm, then shows the event as cancelled", async () => {
    const user = userEvent.setup();
    open(ORG_IDS.verified, EVENT_IDS.inChecking);
    await user.click(
      await screen.findByRole("button", { name: W.cancelEvent }),
    );
    const sheet = await screen.findByRole("dialog", {
      name: W.cancelConfirmTitle,
    });
    await user.click(within(sheet).getByRole("button", { name: W.keepEvent }));
    expect(screen.getByTestId("organiser-event-state")).toHaveTextContent(
      W.eventStateLabel("in_checking"),
    );

    await user.click(
      await screen.findByRole("button", { name: W.cancelEvent }),
    );
    const again = await screen.findByRole("dialog", {
      name: W.cancelConfirmTitle,
    });
    await user.click(
      within(again).getByRole("button", { name: W.cancelEventYes }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("organiser-event-state")).toHaveTextContent(
        W.eventStateLabel("cancelled"),
      ),
    );
    expect(screen.getByTestId("organiser-event-no-change")).toHaveTextContent(
      W.cancelledNoChange,
    );
  });

  it("shows the current date's numbers, counts only", async () => {
    open(ORG_IDS.verified, EVENT_IDS.live);
    const block = await screen.findByTestId("organiser-event-numbers-block");
    expect(block).toHaveTextContent(W.numbers(liveNumbers(null)));
    // The series starts on this date, so there is no week before it.
    expect(screen.getAllByTestId("organiser-event-numbers-block")).toHaveLength(
      1,
    );
  });

  it("adds last week's numbers for a weekly event that has had a date before", async () => {
    const started = live();
    const twoWeeksEarlier = new Date(
      Date.parse(started.startsAt) - 14 * 86_400_000,
    )
      .toISOString()
      .replace(".000Z", "Z");
    server.use(
      http.get(`${BASE}/organisers/${ORG_IDS.verified}/events`, () =>
        HttpResponse.json({
          items: VERIFIED_EVENTS.map((e) =>
            e.id === EVENT_IDS.live ? { ...e, startsAt: twoWeeksEarlier } : e,
          ),
        }),
      ),
    );
    open(ORG_IDS.verified, EVENT_IDS.live);
    await waitFor(() =>
      expect(
        screen.getAllByTestId("organiser-event-numbers-block"),
      ).toHaveLength(2),
    );
    const [now, last] = screen.getAllByTestId("organiser-event-numbers-block");
    const thisWeek = liveNumbers(null);
    const weekBefore = new Date(
      Date.parse(`${thisWeek.on}T00:00:00Z`) - 7 * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    expect(now).toHaveTextContent(W.numbers(thisWeek));
    expect(last).toHaveTextContent(W.numbers(liveNumbers(weekBefore)));
  });

  it("thanks after a post by the state it came back in", async () => {
    open(ORG_IDS.verified, EVENT_IDS.inChecking, { sent: "in_checking" });
    expect(await screen.findByTestId("organiser-event-done")).toHaveTextContent(
      W.eventSent("in_checking"),
    );
  });

  it("says Saved after a change", async () => {
    open(ORG_IDS.verified, EVENT_IDS.live, { saved: true });
    expect(await screen.findByTestId("organiser-event-done")).toHaveTextContent(
      W.saved,
    );
  });

  it("says an event that is not on the list cannot be found", async () => {
    open(ORG_IDS.verified, "9a3e5c20-0000-4000-8000-000000000000");
    expect(
      await screen.findByTestId("organiser-event-missing"),
    ).toHaveTextContent(W.eventNotFound);
  });
});
