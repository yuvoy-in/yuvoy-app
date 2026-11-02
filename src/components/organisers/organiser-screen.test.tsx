import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { DOOR_WORDS } from "@/lib/organisers/door-words";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { OrganiserGate } from "./organiser-gate";
import { OrganiserScreen } from "./organiser-screen";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { __resetOrganiserMocks } from "../../../mocks/organiser-handlers";
import {
  HELPER_OF_EVENTS,
  ORG_IDS,
  ORG_PENDING,
  ORG_VERIFIED,
  VERIFIED_EVENTS,
} from "../../../mocks/organiser-fixtures";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const search = vi.hoisted(() => ({ value: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search.value),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organiser/x",
}));

function open(id: string) {
  return renderWithQuery(
    <OrganiserGate>
      <OrganiserScreen id={id} />
    </OrganiserGate>,
  );
}

function linkTo(name: string) {
  return screen.queryByRole("link", { name });
}

beforeEach(() => {
  __resetOrganiserMocks();
  __signInAppRouteMock("sess_test");
  search.value = "";
});
afterEach(cleanup);

describe("OrganiserScreen", () => {
  it("gives a verified owner every action, and the events in the API's order", async () => {
    open(ORG_IDS.verified);
    expect(
      await screen.findByRole("heading", { level: 1, name: ORG_VERIFIED.name }),
    ).toBeTruthy();
    const card = screen.getByTestId("organiser-state-card");
    expect(card.textContent).toContain(W.verifiedLine(ORG_VERIFIED.name));
    expect(screen.queryByTestId("organiser-code")).toBeNull();

    const base = `/organiser/${ORG_IDS.verified}`;
    expect(linkTo(W.postEvent)?.getAttribute("href")).toBe(`${base}/events/new`);
    expect(linkTo(W.editPage)?.getAttribute("href")).toBe(`${base}/edit`);
    expect(linkTo(W.helpers)?.getAttribute("href")).toBe(`${base}/helpers`);

    const list = await screen.findByTestId("organiser-events");
    const rows = within(list).getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual(
      VERIFIED_EVENTS.map((event) => `${base}/events/${event.id}`),
    );
    const first = VERIFIED_EVENTS[0];
    expect(rows[0]?.textContent).toContain(first?.title ?? "missing");
    expect(rows[0]?.textContent).toContain(
      W.eventStateLabel(first?.state ?? "live", first?.notAcceptedReason),
    );
  });

  it("shows a pending page's code large, and copies it", async () => {
    const user = userEvent.setup();
    open(ORG_IDS.pending);
    const code = await screen.findByTestId("organiser-code");
    expect(code.textContent).toBe(ORG_PENDING.verificationCode);
    await user.click(screen.getByRole("button", { name: W.copyCode }));
    expect(await screen.findByText(W.copied)).toBeTruthy();
    expect(await navigator.clipboard.readText()).toBe(
      ORG_PENDING.verificationCode,
    );
  });

  it("says so when the code cannot be copied", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("denied"),
    );
    open(ORG_IDS.pending);
    await user.click(await screen.findByRole("button", { name: W.copyCode }));
    expect(await screen.findByText(W.copyFailed)).toBeTruthy();
  });

  it("gives a helper the events and Post an event, never Edit page or Helpers", async () => {
    open(ORG_IDS.helperOf);
    const list = await screen.findByTestId("organiser-events");
    expect(within(list).getAllByRole("link")).toHaveLength(
      HELPER_OF_EVENTS.length,
    );
    expect(linkTo(W.postEvent)).toBeTruthy();
    expect(linkTo(W.editPage)).toBeNull();
    expect(linkTo(W.helpers)).toBeNull();
  });

  it("leaves out Post an event on a suspended page", async () => {
    open(ORG_IDS.suspended);
    expect(await screen.findByText(W.suspended)).toBeTruthy();
    expect(linkTo(W.postEvent)).toBeNull();
    expect(linkTo(W.helpers)).toBeTruthy();
  });

  it("offers Check people in on a verified page, to its owner", async () => {
    server.use(
      http.get(`${BASE}/organisers/:id`, () => HttpResponse.json(ORG_VERIFIED)),
    );
    open(ORG_IDS.verified);
    await screen.findByRole("heading", { level: 1, name: ORG_VERIFIED.name });
    expect(linkTo(DOOR_WORDS.entry)?.getAttribute("href")).toBe("/door");
  });

  it("offers Check people in to a helper of a verified page too", async () => {
    open(ORG_IDS.helperOf);
    await screen.findByTestId("organiser-events");
    expect(linkTo(DOOR_WORDS.entry)?.getAttribute("href")).toBe("/door");
  });

  it("leaves out Check people in on a page still waiting for its check", async () => {
    server.use(
      http.get(`${BASE}/organisers/:id`, () => HttpResponse.json(ORG_PENDING)),
    );
    open(ORG_IDS.pending);
    await screen.findByRole("heading", { level: 1, name: ORG_PENDING.name });
    expect(linkTo(DOOR_WORDS.entry)).toBeNull();
  });

  it("says the thanks line after setting up", async () => {
    search.value = "made=1";
    open(ORG_IDS.pending);
    const made = await screen.findByTestId("organiser-made");
    expect(made.textContent).toContain(W.made);
  });

  it("says when there are no events", async () => {
    server.use(
      http.get(`${BASE}/organisers/:id/events`, () =>
        HttpResponse.json({ items: [] }),
      ),
    );
    open(ORG_IDS.verified);
    expect(await screen.findByText(W.noEvents)).toBeTruthy();
  });

  it("says a page the person is not on, with no actions", async () => {
    server.use(
      http.get(`${BASE}/organisers/:id`, () =>
        HttpResponse.json(
          {
            error: {
              code: "not_found",
              message: "",
              details: {},
              requestId: "req_n",
            },
          },
          { status: 404 },
        ),
      ),
    );
    open("6f1c2a10-1b2c-4d3e-8f40-0a1b2c3d4eff");
    expect(await screen.findByText(W.notFound)).toBeTruthy();
    expect(linkTo(W.postEvent)).toBeNull();
  });
});
