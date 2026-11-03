import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { DOOR_WORDS as D } from "@/lib/organisers/door-words";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import type { Organiser } from "@/lib/organisers/types";
import { DoorScreen } from "./door-screen";
import { OrganiserGate } from "./organiser-gate";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { __resetOrganiserMocks } from "../../../mocks/organiser-handlers";
import { ORG_PENDING, ORG_VERIFIED } from "../../../mocks/organiser-fixtures";

/**
 * Who reaches the door's desk (yuvoy-app#226): only a signed-in member of a
 * verified organiser with `supply` open. Everyone else sends nothing, even
 * from a Going card's `/door#CODE` link.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const CHECK_INS = `${BASE}/organiser-check-ins`;

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/door",
}));

/** Counts every check-in the door sends. */
function counted(): { code: string; via: string }[] {
  const sent: { code: string; via: string }[] = [];
  server.use(
    http.post(CHECK_INS, async ({ request }) => {
      sent.push((await request.json()) as { code: string; via: string });
      return HttpResponse.json({
        firstName: "Asha",
        eventTitle: "Sample Sunday Run",
        checkedInAt: "2026-11-02T09:30:00Z",
        alreadyCheckedIn: false,
      });
    }),
  );
  return sent;
}

function organisers(items: Organiser[]) {
  server.use(
    http.get(`${BASE}/me/organisers`, () =>
      HttpResponse.json({ items, clubsToLink: [] }),
    ),
  );
}

function supplyAt(stage: "off" | "all") {
  server.use(
    http.get(`${BASE}/app-config`, () =>
      HttpResponse.json({
        minimumVersion: { ios: "0.0.0", android: "0.0.0" },
        features: { payments: "coming_soon", inviteOnly: false },
        support: { whatsappE164: null, hours: "" },
        deliveryHost: null,
        releases: { supply: stage },
      }),
    ),
  );
}

function door() {
  return renderWithQuery(
    <OrganiserGate>
      <DoorScreen />
    </OrganiserGate>,
  );
}

beforeEach(() => {
  __resetOrganiserMocks();
  window.history.replaceState(null, "", "/door#ASHA2345");
});
afterEach(cleanup);

describe("DoorScreen, who reaches the desk", () => {
  it("signed out, asks to sign in back to the code and sends nothing", async () => {
    supplyAt("all");
    const sent = counted();
    door();
    const link = await screen.findByRole("link", { name: W.signInButton });
    expect(link.getAttribute("href")).toBe(
      `/account?next=${encodeURIComponent("/door#ASHA2345")}`,
    );
    expect(screen.queryByLabelText(D.field)).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("with supply closed, says it is not open and sends nothing", async () => {
    supplyAt("off");
    __signInAppRouteMock("sess_test");
    const sent = counted();
    door();
    expect(await screen.findByText(W.notOpen)).toBeTruthy();
    expect(screen.queryByLabelText(D.field)).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("for someone in no organiser, says so with no field and sends nothing", async () => {
    __signInAppRouteMock("sess_test");
    organisers([]);
    const sent = counted();
    door();
    const panel = await screen.findByTestId("door-not-member");
    expect(panel.textContent).toContain(D.notMember);
    const hub = within(panel).getByRole("link", { name: W.title });
    expect(hub.getAttribute("href")).toBe("/organiser");
    expect(screen.queryByLabelText(D.field)).toBeNull();
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(sent).toHaveLength(0);
  });

  it("for a member of a pending organiser only, says so too", async () => {
    __signInAppRouteMock("sess_test");
    organisers([ORG_PENDING]);
    const sent = counted();
    door();
    expect(await screen.findByTestId("door-not-member")).toBeTruthy();
    expect(screen.queryByLabelText(D.field)).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("for a member of a verified organiser, checks the code in as before", async () => {
    __signInAppRouteMock("sess_test");
    organisers([ORG_PENDING, ORG_VERIFIED]);
    const sent = counted();
    door();
    expect(await screen.findByTestId("door-done")).toBeTruthy();
    expect(sent).toEqual([{ code: "ASHA2345", via: "portal_link" }]);
    expect(window.location.hash).toBe("");
  });

  it("on a refused read, shows the organiser pages' pause with Try again", async () => {
    __signInAppRouteMock("sess_test");
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
    const sent = counted();
    door();
    expect(await screen.findByText(W.paused)).toBeTruthy();
    expect(screen.getByRole("button", { name: W.tryAgain })).toBeTruthy();
    expect(screen.queryByLabelText(D.field)).toBeNull();
    expect(sent).toHaveLength(0);
  });
});
