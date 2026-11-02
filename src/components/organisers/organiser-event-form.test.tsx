import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { OrganiserGate } from "./organiser-gate";
import {
  EditOrganiserEvent,
  NewOrganiserEvent,
} from "./organiser-event-form";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { __resetOrganiserMocks } from "../../../mocks/organiser-handlers";
import { EVENT_IDS, ORG_IDS } from "../../../mocks/organiser-fixtures";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => nav,
  usePathname: () => "/organiser",
}));

const PAUSED = {
  error: {
    code: "organisers_paused",
    message: W.paused,
    details: {},
    requestId: "req_p",
  },
};

function postOn(id: string) {
  return renderWithQuery(
    <OrganiserGate>
      <NewOrganiserEvent id={id} />
    </OrganiserGate>,
  );
}

function editOf(id: string, postId: string) {
  return renderWithQuery(
    <OrganiserGate>
      <EditOrganiserEvent id={id} postId={postId} />
    </OrganiserGate>,
  );
}

/** Everything the API needs for a post, typed the way a person would. */
async function fillIn() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(W.eventTitle), "Sunrise walk");
  await user.click(
    await screen.findByRole("radio", { name: "Nature and wildlife" }),
  );
  fireEvent.change(screen.getByLabelText(W.eventStart), {
    target: { value: "2026-11-20T06:30" },
  });
  await user.type(screen.getByLabelText(W.eventVenue), "Forest Gate");
  await user.type(
    screen.getByLabelText(W.eventLink),
    "https://walkers.example.com",
  );
  return user;
}

beforeEach(() => {
  __resetOrganiserMocks();
  __signInAppRouteMock("sess_test");
  nav.replace.mockClear();
});
afterEach(() => {
  server.events.removeAllListeners();
  cleanup();
});

describe("NewOrganiserEvent", () => {
  it("sends for checking, then opens the event with its state", async () => {
    let sent: Record<string, unknown> | null = null;
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST" && request.url.endsWith("/events")) {
        void request
          .clone()
          .json()
          .then((body: Record<string, unknown>) => {
            sent = body;
          });
      }
    });
    postOn(ORG_IDS.verified);
    const user = await fillIn();
    await user.click(screen.getByRole("button", { name: W.sendEvent(false) }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1));
    expect(nav.replace.mock.calls[0]?.[0]).toMatch(
      new RegExp(`^/organiser/${ORG_IDS.verified}/events/[^/?]+\\?sent=in_checking$`),
    );
    expect(sent).toMatchObject({
      title: "Sunrise walk",
      department: "nature_wildlife",
      startsAt: "2026-11-20T06:30:00+05:30",
      destinationKey: "andaman/havelock",
      venueName: "Forest Gate",
      free: true,
      link: "https://walkers.example.com",
    });
  });

  it("says Post with self-publish, and the event comes back live", async () => {
    postOn(ORG_IDS.helperOf);
    const user = await fillIn();
    await user.click(screen.getByRole("button", { name: W.sendEvent(true) }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1));
    expect(nav.replace.mock.calls[0]?.[0]).toMatch(/\?sent=live$/);
  });

  it("marks a start it cannot read under its box and sends nothing", async () => {
    const user = userEvent.setup();
    postOn(ORG_IDS.verified);
    await user.click(
      await screen.findByRole("button", { name: W.sendEvent(false) }),
    );
    expect(await screen.findByText(W.needStart)).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("puts the server's sentences under their fields and keeps what was typed", async () => {
    const user = userEvent.setup();
    postOn(ORG_IDS.verified);
    fireEvent.change(await screen.findByLabelText(W.eventStart), {
      target: { value: "2026-11-20T06:30" },
    });
    await user.type(screen.getByLabelText(W.eventAddress), "Sample Road");
    await user.click(screen.getByRole("button", { name: W.sendEvent(false) }));
    expect(await screen.findByText("Give the event a name.")).toBeInTheDocument();
    expect(screen.getByText("Choose a kind of event.")).toBeInTheDocument();
    expect(screen.getByText("Give the place it is at.")).toBeInTheDocument();
    expect(screen.getByLabelText(W.eventStart)).toHaveValue("2026-11-20T06:30");
    expect(screen.getByLabelText(W.eventAddress)).toHaveValue("Sample Road");
    expect(nav.replace).not.toHaveBeenCalled();

    // Typing in a marked box takes its sentence away.
    await user.type(screen.getByLabelText(W.eventTitle), "Walk");
    expect(screen.queryByText("Give the event a name.")).toBeNull();
  });

  it("shows the price box only when paid, and sends the price in rupees", async () => {
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.post(
        `${BASE}/organisers/:id/events`,
        async ({ request }) => {
          sent = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(
            {
              error: {
                code: "conflict",
                message: "This organiser page cannot do that now.",
                details: {},
                requestId: "req_c",
              },
            },
            { status: 409 },
          );
        },
        { once: true },
      ),
    );
    postOn(ORG_IDS.verified);
    const user = await fillIn();
    expect(screen.queryByLabelText(W.eventPrice)).toBeNull();
    await user.click(screen.getByRole("radio", { name: W.eventPaid }));
    await user.type(screen.getByLabelText(W.eventPrice), "300");
    await user.click(screen.getByRole("button", { name: W.sendEvent(false) }));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toMatchObject({ free: false, priceFromRupees: 300 });
  });

  it("says paused with Try again, and Try again sends what was typed", async () => {
    server.use(
      http.post(
        `${BASE}/organisers/:id/events`,
        () => HttpResponse.json(PAUSED, { status: 503 }),
        { once: true },
      ),
    );
    postOn(ORG_IDS.verified);
    const user = await fillIn();
    await user.click(screen.getByRole("button", { name: W.sendEvent(false) }));
    expect(await screen.findByText(W.paused)).toBeInTheDocument();
    expect(screen.getByLabelText(W.eventTitle)).toHaveValue("Sunrise walk");
    await user.click(screen.getByRole("button", { name: W.tryAgain }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1));
  });

  it("shows no form on a suspended organiser", async () => {
    postOn(ORG_IDS.suspended);
    expect(await screen.findByText(W.suspended)).toBeInTheDocument();
    expect(screen.queryByTestId("organiser-event-form")).toBeNull();
  });
});

describe("EditOrganiserEvent", () => {
  it("starts from the event, sends the whole event and opens it with Saved", async () => {
    let sent: Record<string, unknown> | null = null;
    server.events.on("request:start", ({ request }) => {
      if (request.method === "PATCH") {
        void request
          .clone()
          .json()
          .then((body: Record<string, unknown>) => {
            sent = body;
          });
      }
    });
    const user = userEvent.setup();
    editOf(ORG_IDS.verified, EVENT_IDS.live);
    const title = await screen.findByLabelText(W.eventTitle);
    expect(title).toHaveValue("Sample Saturday forest walk");
    expect(screen.getByLabelText(W.eventPrice)).toHaveValue("300");
    await user.clear(title);
    await user.type(title, "Saturday forest walk");
    await user.click(screen.getByRole("button", { name: W.saveEvent }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1));
    expect(nav.replace.mock.calls[0]?.[0]).toBe(
      `/organiser/${ORG_IDS.verified}/events/${EVENT_IDS.live}?saved=1`,
    );
    expect(sent).toMatchObject({
      title: "Saturday forest walk",
      venueName: "Sample Forest Gate",
      free: false,
      priceFromRupees: 300,
      priceNote: "Tea and a guide included",
      link: "https://walkers.example.com/walks",
    });
  });

  it("says why an ended event cannot be changed, with no form", async () => {
    editOf(ORG_IDS.verified, EVENT_IDS.ended);
    expect(await screen.findByText(W.endedNoChange)).toBeInTheDocument();
    expect(screen.queryByTestId("organiser-event-form")).toBeNull();
  });

  it("says an event that is not on the list cannot be found", async () => {
    editOf(ORG_IDS.verified, "9a3e5c20-0000-4000-8000-000000000000");
    expect(await screen.findByText(W.eventNotFound)).toBeInTheDocument();
  });
});
