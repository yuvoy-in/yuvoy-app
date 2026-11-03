import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { OrganiserGate } from "./organiser-gate";
import { OrganiserHub } from "./organiser-hub";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { __resetOrganiserMocks } from "../../../mocks/organiser-handlers";
import { MY_ORGANISERS, ORG_IDS } from "../../../mocks/organiser-fixtures";

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
