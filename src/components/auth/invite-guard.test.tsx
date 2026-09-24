import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { EXPERIENCES } from "../../../mocks/fixtures";
import { server } from "../../../mocks/server";
import {
  __resetAppRouteMocks,
  __signInAppRouteMock,
} from "../../../mocks/app-route-handlers";
import { MOCK_INVITE_CODES } from "../../../mocks/booking-handlers";
import { http, HttpResponse } from "msw";

/**
 * The gate over a page that is already open: a Save tapped by somebody who is
 * not in (yuvoy-api#195).
 *
 * The card under test is the REAL feed card, not a stand-in, because the
 * property that matters most here is one a stand-in cannot have: the save is
 * held while the visitor signs in, and signing in moves saving from this
 * device onto the account. A gate holding the callback the tap closed over
 * would write the save where nobody will ever see it.
 */

const idb = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.store.get(k),
  set: async (k: string, v: unknown) => {
    idb.store.set(k, v);
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const EXPERIENCE = EXPERIENCES.find((e) => e.heroMedia)!;

/** Every `/me/saved` call the app made, so "where did it land" is answerable. */
let calls: string[] = [];
function record({ request }: { request: Request }) {
  const url = new URL(request.url);
  if (url.href.startsWith(BASE) && url.pathname.includes("/me/saved")) {
    calls.push(`${request.method} ${url.pathname.replace(/^\/v1/, "")}`);
  }
}

/** `GET /me` for a signed-in number, saying whether it is in. */
function meSays(admitted: boolean | undefined) {
  server.use(
    http.get(`${BASE}/me`, () =>
      HttpResponse.json({
        phone: "+919000003210",
        name: "Asha Menon",
        email: null,
        interests: [],
        onboardingRequired: false,
        memberSince: "2026-07-02T04:30:00Z",
        trips: { total: 0, upcoming: 0, completed: 0 },
        reviews: { count: 0 },
        support: { whatsappE164: null, hours: "9am to 7pm" },
        ...(admitted === undefined ? {} : { admitted }),
      }),
    ),
  );
}

/** The card behind the gate, with the switch in the state this case needs. */
async function card(inviteOnly: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_INVITE_ONLY", inviteOnly);
  const { InviteGuard } = await import("./invite-guard");
  const { ExperienceCard } = await import("@/components/feed/experience-card");

  renderWithQuery(
    <InviteGuard>
      <ExperienceCard
        experience={EXPERIENCE}
        media={EXPERIENCE.heroMedia}
        index={0}
        total={1}
        active
        mounted={false}
        muted
        autoplayAllowed={false}
      />
    </InviteGuard>,
  );

  return {
    user: userEvent.setup(),
    save: await screen.findByRole("button", { name: /^Save / }),
  };
}

const sheet = () => screen.queryByRole("dialog");

beforeEach(() => {
  idb.store.clear();
  vi.stubGlobal("indexedDB", {});
  calls = [];
  server.events.on("request:start", record);
});

afterEach(() => {
  server.events.removeListener("request:start", record);
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("with the switch off", () => {
  it("saves on the tap, and there is no gate to open", async () => {
    const { user, save } = await card("false");

    await user.click(save);

    expect(sheet()).toBeNull();
    expect(save).toHaveAttribute("aria-pressed", "true");
    await waitFor(async () => {
      const { deviceSavedStore } = await import("@/lib/feed/saved-store");
      expect(await deviceSavedStore.listSavedIds()).toEqual([EXPERIENCE.id]);
    });
  });
});

describe("with the switch on", () => {
  it("asks for the invitation instead of saving, for a visitor who is not in", async () => {
    const { user, save } = await card("true");

    await user.click(save);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Yuvoy is by invitation for now" }),
    ).toBeInTheDocument();
    // Not saved, and the bookmark does not claim otherwise.
    expect(save).toHaveAttribute("aria-pressed", "false");
    const { deviceSavedStore } = await import("@/lib/feed/saved-store");
    expect(await deviceSavedStore.listSavedIds()).toEqual([]);
  });

  it("saves without a gate for a number that is in", async () => {
    __signInAppRouteMock("sess_919000003210");
    meSays(true);
    const { user, save } = await card("true");

    // The standing has to be KNOWN before the tap, or the sheet opens on
    // `checking` while it is fetched, which is a different case.
    await waitFor(() => expect(save).toHaveAttribute("aria-pressed", "false"));
    await waitFor(() => expect(calls).toContain("GET /me/saved/ids"));
    await user.click(save);

    expect(sheet()).toBeNull();
    await waitFor(() => expect(calls).toContain("POST /me/saved"));
  });

  it("saves when GET /me could not be read, rather than refusing", async () => {
    /*
      Failing OPEN, deliberately and in step with the server side. Saving is a
      posture; the one thing that must be refused, a booking, is refused by
      the API itself. A traveller on island signal must not lose a bookmark to
      a read that missed.
    */
    __signInAppRouteMock("sess_919000003210");
    const { user, save } = await card("true");
    server.use(
      http.get(`${BASE}/me`, () => HttpResponse.json({}, { status: 503 })),
    );

    await waitFor(() => expect(calls).toContain("GET /me/saved/ids"));
    await user.click(save);

    await waitFor(() => expect(sheet()).toBeNull());
    await waitFor(() => expect(calls).toContain("POST /me/saved"));
  });

  it("holds the save through signing in and a code, then puts it on the ACCOUNT", async () => {
    /*
      THE WHOLE WAY THROUGH, and the one assertion a stand-in card cannot
      make. The tap happened while this device was signed out, so saving went
      to the device store; by the time the save actually runs, the traveller
      has signed in and saving belongs to the account. A gate that ran the
      callback the tap closed over would write to IndexedDB, where the account
      list will never show it, and every screen would look right.
    */
    meSays(false);
    const { user, save } = await card("true");

    await user.click(save);
    await screen.findByRole("dialog");

    await user.type(
      screen.getByLabelText("Your WhatsApp number"),
      "9000003210",
    );
    await user.click(screen.getByRole("button", { name: "Send me a code" }));
    await user.type(await screen.findByLabelText("The code we sent"), "123456");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    // Signed in, and this number is not admitted: the code screen, in place.
    const code = await screen.findByLabelText("Invite code");
    meSays(true);
    await user.type(code, MOCK_INVITE_CODES.valid);
    await user.click(screen.getByRole("button", { name: "Use this code" }));

    // In. The save is still waiting, and one tap does it.
    const go = await screen.findByRole("button", { name: "Continue" });
    await user.click(go);

    await waitFor(() => expect(sheet()).toBeNull());
    await waitFor(() => expect(calls).toContain("POST /me/saved"));
    const { deviceSavedStore } = await import("@/lib/feed/saved-store");
    expect(await deviceSavedStore.listSavedIds()).toEqual([]);
  });

  it("closes without saving when the gate is dismissed", async () => {
    const { user, save } = await card("true");

    await user.click(save);
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(sheet()).toBeNull());
    expect(save).toHaveAttribute("aria-pressed", "false");
    const { deviceSavedStore } = await import("@/lib/feed/saved-store");
    expect(await deviceSavedStore.listSavedIds()).toEqual([]);
  });
});

afterEach(() => __resetAppRouteMocks());
