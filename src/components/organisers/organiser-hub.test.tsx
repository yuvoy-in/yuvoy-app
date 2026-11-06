import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { DOOR_WORDS } from "@/lib/organisers/door-words";
import {
  clubOrganiserInput,
  clubPageForm,
} from "@/lib/organisers/organisers-club";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { OrganiserGate } from "./organiser-gate";
import { OrganiserHub } from "./organiser-hub";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { __resetOrganiserMocks } from "../../../mocks/organiser-handlers";
import {
  CLUBS_HELD,
  MY_ORGANISERS,
  ORG_IDS,
  ORG_PENDING,
} from "../../../mocks/organiser-fixtures";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organiser",
}));

function hub() {
  return renderWithQuery(
    <OrganiserGate>
      <OrganiserHub />
    </OrganiserGate>,
  );
}

/**
 * A mock scenario, as e2e picks one: a request that reaches the API without
 * `__scenario` is asked again with it, so the scenario's own handlers answer.
 */
function inScenario(scenario: string) {
  server.use(
    http.all(`${BASE}/*`, async ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.has("__scenario")) return undefined;
      url.searchParams.set("__scenario", scenario);
      const reads = request.method === "GET" || request.method === "HEAD";
      return fetch(url, {
        method: request.method,
        headers: request.headers,
        body: reads ? undefined : await request.text(),
      });
    }),
  );
}

function cards() {
  return screen.queryAllByTestId("organiser-club-card");
}

beforeEach(() => {
  __resetOrganiserMocks();
  __signInAppRouteMock("sess_test");
});
afterEach(cleanup);

describe("OrganiserHub", () => {
  it("lists the organisers in the API's order, each with its state and role", async () => {
    hub();
    const list = await screen.findByTestId("organiser-hub-list");
    const rows = within(list).getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual(
      MY_ORGANISERS.map((o) => W.rowLabel(o.name, o.state, o.role)),
    );
    expect(rows[0]?.getAttribute("href")).toBe(
      `/organiser/${ORG_IDS.verified}`,
    );
    expect(rows[0]?.textContent).toContain(
      `${W.stateLabel("verified")} · ${W.roleLabel("owner")}`,
    );
    const helped = rows[rows.length - 1];
    expect(helped?.textContent).toContain(W.roleLabel("helper"));
    expect(
      screen.getByRole("link", { name: W.setUpAnother }).getAttribute("href"),
    ).toBe("/organiser/new");
    // No held group: no cards, the hub as #224 drew it.
    expect(cards()).toHaveLength(0);
  });

  it("asks to set up a page when there is none", async () => {
    server.use(
      http.get(`${BASE}/me/organisers`, () =>
        HttpResponse.json({ items: [], clubsToLink: [] }),
      ),
    );
    hub();
    expect(await screen.findByText(W.empty)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: W.setUp }).getAttribute("href"),
    ).toBe("/organiser/new");
    expect(cards()).toHaveLength(0);
  });

  it("shows the paused state with Try again, never the empty line", async () => {
    server.use(
      http.get(`${BASE}/me/organisers`, () =>
        HttpResponse.json(
          {
            error: {
              code: "organisers_paused",
              message: W.paused,
              details: {},
              requestId: "req_p",
            },
          },
          { status: 503 },
        ),
      ),
    );
    hub();
    expect(await screen.findByText(W.paused)).toBeTruthy();
    expect(screen.getByRole("button", { name: W.tryAgain })).toBeTruthy();
    expect(screen.queryByText(W.empty)).toBeNull();
  });

  it("shows the general line for a refusal with no sentence, never the empty line", async () => {
    server.use(
      http.get(`${BASE}/me/organisers`, () =>
        HttpResponse.json(
          {
            error: {
              code: "forbidden",
              message: "",
              details: {},
              requestId: "req_x",
            },
          },
          { status: 403 },
        ),
      ),
    );
    hub();
    expect(await screen.findByText(W.notNow)).toBeTruthy();
    expect(screen.getByRole("button", { name: W.tryAgain })).toBeTruthy();
    expect(screen.queryByText(W.empty)).toBeNull();
  });

  it("leads with Check people in for a member of a verified organiser", async () => {
    hub();
    await screen.findByTestId("organiser-hub-list");
    const door = screen.getByRole("link", { name: DOOR_WORDS.entry });
    expect(door.getAttribute("href")).toBe("/door");
  });

  it("leaves out Check people in while no organiser is verified", async () => {
    server.use(
      http.get(`${BASE}/me/organisers`, () =>
        HttpResponse.json({ items: [ORG_PENDING], clubsToLink: [] }),
      ),
    );
    hub();
    await screen.findByTestId("organiser-hub-list");
    expect(screen.queryByRole("link", { name: DOOR_WORDS.entry })).toBeNull();
  });

  it("leaves out Check people in for someone with no organiser", async () => {
    server.use(
      http.get(`${BASE}/me/organisers`, () =>
        HttpResponse.json({ items: [], clubsToLink: [] }),
      ),
    );
    hub();
    expect(await screen.findByText(W.empty)).toBeTruthy();
    expect(screen.queryByRole("link", { name: DOOR_WORDS.entry })).toBeNull();
  });

  it("reads nothing while supply is off", async () => {
    const asked: string[] = [];
    server.events.on("request:start", ({ request }) => {
      asked.push(new URL(request.url).pathname);
    });
    server.use(
      http.get(`${BASE}/app-config`, () =>
        HttpResponse.json({
          minimumVersion: { ios: "0.0.0", android: "0.0.0" },
          features: { payments: "coming_soon", inviteOnly: false },
          support: { whatsappE164: null, hours: "" },
          deliveryHost: null,
          releases: { supply: "off" },
        }),
      ),
    );
    hub();
    expect(await screen.findByText(W.notOpen)).toBeTruthy();
    expect(asked.some((p) => p.endsWith("/me/organisers"))).toBe(false);
    server.events.removeAllListeners();
  });
});

describe("OrganiserHub, groups held (yuvoy-app#225)", () => {
  it("draws one card per held group, by name, with its place, above the setup", async () => {
    inScenario("organisers-club");
    hub();
    expect(
      await screen.findByText(W.clubCard(CLUBS_HELD[0].name)),
    ).toBeTruthy();
    const drawn = cards();
    expect(drawn).toHaveLength(CLUBS_HELD.length);
    CLUBS_HELD.forEach((club, at) => {
      const card = drawn[at];
      expect(card.textContent).toContain(W.clubCard(club.name));
      expect(
        within(card)
          .getByRole("link", { name: W.clubCardButton })
          .getAttribute("href"),
      ).toBe(`/organiser/new?club=${club.clubId}`);
    });
    expect(
      await within(drawn[0]).findByText("Havelock (Swaraj Dweep)"),
    ).toBeTruthy();
    expect(within(drawn[1]).getByText("Port Blair")).toBeTruthy();
    // The plain setup is still there, under the cards.
    expect(
      screen.getByRole("link", { name: W.setUp }).getAttribute("href"),
    ).toBe("/organiser/new");
  });

  it("leaves the other group's card once one is set up, on the next read", async () => {
    const [first, second] = CLUBS_HELD;
    const made = await fetch(`${BASE}/organisers?__scenario=organisers-club`, {
      method: "POST",
      headers: {
        Authorization: "Bearer sess_test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        clubOrganiserInput(clubPageForm(first), first.clubId),
      ),
    });
    expect(made.status).toBe(201);
    inScenario("organisers-club");
    hub();
    const list = await screen.findByTestId("organiser-hub-list");
    expect(within(list).getByText(first.name)).toBeTruthy();
    expect(cards()).toHaveLength(1);
    expect(cards()[0].textContent).toContain(W.clubCard(second.name));
    expect(screen.queryByText(W.clubCard(first.name))).toBeNull();
  });

  it("draws no card while People is paused, and the plain setup", async () => {
    inScenario("organisers-club-paused");
    hub();
    expect(await screen.findByText(W.empty)).toBeTruthy();
    expect(cards()).toHaveLength(0);
  });
});
