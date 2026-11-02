import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { StrictMode } from "react";
import { renderWithQuery } from "@/test/render";
import { BIRTH_YEAR_WORDS, indiaYear } from "@/lib/auth/confirm-age";
import { clockOffsetMs } from "@/lib/booking/clock";
import { doorTime } from "@/lib/organisers/check-in";
import { DOOR_WORDS as D } from "@/lib/organisers/door-words";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { DoorScreen } from "./door-screen";
import { OrganiserGate } from "./organiser-gate";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { __resetOrganiserMocks } from "../../../mocks/organiser-handlers";
import { DOOR_USED_AT } from "../../../mocks/organiser-door";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const CHECK_INS = `${BASE}/organiser-check-ins`;

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/door",
}));

interface Sent {
  code: string;
  via: string;
}

/** Keeps every body the door sends, and answers each with `reply`. */
function counted(reply: (n: number) => Response): Sent[] {
  const sent: Sent[] = [];
  server.use(
    http.post(CHECK_INS, async ({ request }) => {
      sent.push((await request.json()) as Sent);
      return reply(sent.length);
    }),
  );
  return sent;
}

function asha(already = false) {
  return HttpResponse.json({
    firstName: "Asha",
    eventTitle: "Sample Sunday Run",
    checkedInAt: "2026-11-02T09:30:00Z",
    alreadyCheckedIn: already,
  });
}

function refusal(code: string, message: string, status: number) {
  return HttpResponse.json(
    { error: { code, message, details: {}, requestId: "req_door" } },
    { status },
  );
}

function door(strict = false) {
  const ui = (
    <OrganiserGate>
      <DoorScreen />
    </OrganiserGate>
  );
  return renderWithQuery(strict ? <StrictMode>{ui}</StrictMode> : ui);
}

async function field() {
  return (await screen.findByLabelText(D.field)) as HTMLInputElement;
}

function checkInButton() {
  return screen.getByRole("button", { name: D.button }) as HTMLButtonElement;
}

beforeEach(() => {
  __resetOrganiserMocks();
  __signInAppRouteMock("sess_test");
  window.history.replaceState(null, "", "/door");
});
afterEach(cleanup);

describe("DoorScreen", () => {
  it("checks in a typed code, then clears the field and keeps the cursor in it", async () => {
    const sent = counted(() => asha());
    const user = userEvent.setup();
    door();
    expect(
      await screen.findByRole("heading", { level: 1, name: D.title }),
    ).toBeTruthy();
    const input = await field();
    await user.type(input, "asha-2345");
    await user.click(checkInButton());

    const done = await screen.findByTestId("door-done");
    expect(done.textContent).toContain(D.checkedIn("Asha"));
    expect(done.textContent).toContain("Sample Sunday Run");
    expect(sent).toEqual([{ code: "ASHA2345", via: "typed" }]);
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
  });

  it("says a code used before calmly, with the first time", async () => {
    const user = userEvent.setup();
    door();
    await user.type(await field(), "USED2345");
    await user.click(checkInButton());
    const done = await screen.findByTestId("door-done");
    expect(done.textContent).toContain(D.already(doorTime(DOOR_USED_AT)));
    expect(done.hasAttribute("data-already")).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps Check in off until the field holds a code", async () => {
    const user = userEvent.setup();
    door();
    const input = await field();
    expect(checkInButton().disabled).toBe(true);
    await user.type(input, "ASHA234");
    expect(checkInButton().disabled).toBe(true);
    await user.type(input, "5");
    expect(checkInButton().disabled).toBe(false);
  });

  it("sends one request for a double tap", async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sent: Sent[] = [];
    server.use(
      http.post(CHECK_INS, async ({ request }) => {
        sent.push((await request.json()) as Sent);
        await held;
        return asha();
      }),
    );
    const user = userEvent.setup();
    door();
    const input = await field();
    await user.type(input, "ASHA2345");
    const form = input.closest("form");
    if (!form) throw new Error("no form");
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(sent).toHaveLength(1));
    release?.();
    expect(await screen.findByTestId("door-done")).toBeTruthy();
    expect(sent).toHaveLength(1);
  });

  it("keeps the code and says why when it is not for one of their events", async () => {
    const user = userEvent.setup();
    door();
    const input = await field();
    await user.type(input, "ZZZZ9999");
    await user.click(checkInButton());
    expect(await screen.findByText(D.notFound)).toBeTruthy();
    expect(input.value).toBe("ZZZZ9999");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByTestId("door-done")).toBeNull();
  });

  it("says a person cannot check themselves in", async () => {
    const user = userEvent.setup();
    door();
    await user.type(await field(), "MYNE2345");
    await user.click(checkInButton());
    expect(await screen.findByText(D.ownCode)).toBeTruthy();
  });

  it("shows the pause with Try again, which sends the same code", async () => {
    const sent = counted((n) =>
      n === 1 ? refusal("organisers_paused", D.paused, 503) : asha(),
    );
    const user = userEvent.setup();
    door();
    const input = await field();
    await user.type(input, "ASHA2345");
    await user.click(checkInButton());
    const paused = await screen.findByTestId("door-paused");
    expect(paused.textContent).toContain(D.paused);
    expect(input.value).toBe("ASHA2345");
    await user.click(screen.getByRole("button", { name: D.tryAgain }));
    expect(await screen.findByTestId("door-done")).toBeTruthy();
    expect(sent).toEqual([
      { code: "ASHA2345", via: "typed" },
      { code: "ASHA2345", via: "typed" },
    ]);
  });

  it("says when there is no signal, keeps the code and queues nothing", async () => {
    server.use(
      http.post("*/api/v1/organiser-check-ins", () => HttpResponse.error()),
    );
    const user = userEvent.setup();
    door();
    const input = await field();
    await user.type(input, "ASHA2345");
    await user.click(checkInButton());
    const offline = await screen.findByTestId("door-offline");
    expect(offline.textContent).toContain(D.offline);
    expect(screen.getByRole("button", { name: D.tryAgain })).toBeTruthy();
    expect(input.value).toBe("ASHA2345");
  });

  it("says a fault on our side with Try again", async () => {
    const user = userEvent.setup();
    door();
    await user.type(await field(), "BRKE2345");
    await user.click(checkInButton());
    const broken = await screen.findByTestId("door-broken");
    expect(broken.textContent).toContain(D.broken);
    expect(screen.getByRole("button", { name: D.tryAgain })).toBeTruthy();
  });

  it("asks to sign in again, back to the door, when the sign-in has ended", async () => {
    counted(() => refusal("unauthorized", D.signIn, 401));
    const user = userEvent.setup();
    door();
    await user.type(await field(), "ASHA2345");
    await user.click(checkInButton());
    const link = await screen.findByRole("link", { name: W.signInButton });
    expect(link.getAttribute("href")).toBe(
      `/account?next=${encodeURIComponent("/door")}`,
    );
  });

  it("asks the age, then sends the same code the same way once more", async () => {
    server.use(
      http.put(`${BASE}/me/age`, () => HttpResponse.json({ ageConfirmed: true })),
    );
    const sent = counted((n) =>
      n === 1
        ? refusal("adult_confirmation_required", D.adultsOnly, 403)
        : asha(),
    );
    const user = userEvent.setup();
    door();
    await user.type(await field(), "asha 2345");
    await user.click(checkInButton());

    await user.type(
      await screen.findByLabelText(BIRTH_YEAR_WORDS.label),
      String(indiaYear(Date.now() + clockOffsetMs()) - 30),
    );
    await user.click(screen.getByRole("button", { name: BIRTH_YEAR_WORDS.send }));

    expect(await screen.findByTestId("door-done")).toBeTruthy();
    expect(sent).toEqual([
      { code: "ASHA2345", via: "typed" },
      { code: "ASHA2345", via: "typed" },
    ]);
  });

  it("checks in the code in the address once, as the card's link, and clears it", async () => {
    window.history.replaceState(null, "", "/door#asha-2345");
    const sent = counted(() => asha());
    door(true);
    const done = await screen.findByTestId("door-done");
    expect(done.textContent).toContain(D.checkedIn("Asha"));
    expect(sent).toEqual([{ code: "ASHA2345", via: "portal_link" }]);
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/door");
    expect((await field()).value).toBe("");
  });

  it("sends nothing for an address part that is not a code, and says so", async () => {
    window.history.replaceState(null, "", "/door#top");
    const sent = counted(() => asha());
    door();
    expect(await field()).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(sent).toHaveLength(0);
    expect(checkInButton().disabled).toBe(true);
    expect(screen.getByText(D.badLink)).toBeTruthy();
    await userEvent.setup().type(await field(), "A");
    expect(screen.queryByText(D.badLink)).toBeNull();
  });

  it("keeps Check in off for a code with a look-alike, and says why", async () => {
    const user = userEvent.setup();
    door();
    const input = await field();
    await user.type(input, "ASHA234");
    expect(screen.queryByText(D.lookalike)).toBeNull();
    await user.type(input, "0");
    expect(screen.getByText(D.lookalike)).toBeTruthy();
    expect(checkInButton().disabled).toBe(true);
    await user.clear(input);
    await user.type(input, "ASHA23456");
    expect(screen.queryByText(D.lookalike)).toBeNull();
    expect(checkInButton().disabled).toBe(true);
  });

  it("takes the problem away on typing, so Check in sends the new code", async () => {
    server.use(
      http.post("*/api/v1/organiser-check-ins", () => HttpResponse.error(), {
        once: true,
      }),
    );
    const sent = counted(() => asha());
    const user = userEvent.setup();
    door();
    const input = await field();
    await user.type(input, "ASHA2345");
    await user.click(checkInButton());
    expect(await screen.findByTestId("door-offline")).toBeTruthy();
    await user.clear(input);
    await user.type(input, "NAME2345");
    expect(screen.queryByTestId("door-offline")).toBeNull();
    await user.click(checkInButton());
    expect(await screen.findByTestId("door-done")).toBeTruthy();
    expect(sent).toEqual([{ code: "NAME2345", via: "typed" }]);
  });

  it("says which day a code is for", async () => {
    const user = userEvent.setup();
    door();
    await user.type(await field(), "WAKE2345");
    await user.click(checkInButton());
    expect(await screen.findByText(D.notToday("Sun 8 Nov"))).toBeTruthy();
  });

  it("says the API's line for a body it could not read", async () => {
    counted(() => refusal("invalid_input", D.badCode, 400));
    const user = userEvent.setup();
    door();
    const input = await field();
    await user.type(input, "ASHA2345");
    await user.click(checkInButton());
    expect(await screen.findByText(D.badCode)).toBeTruthy();
    expect(input.value).toBe("ASHA2345");
  });

  it("says the API's line when too many codes missed", async () => {
    const user = userEvent.setup();
    door();
    await user.type(await field(), "FAST2345");
    await user.click(checkInButton());
    expect(await screen.findByText(D.tooManyMisses)).toBeTruthy();
    expect(screen.queryByTestId("door-done")).toBeNull();
  });
});
