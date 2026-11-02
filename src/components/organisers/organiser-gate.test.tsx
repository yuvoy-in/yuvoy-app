import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { renderWithQuery } from "@/test/render";
import {
  BIRTH_YEAR_WORDS,
  CONFIRM_AGE_WORDS,
  indiaYear,
} from "@/lib/auth/confirm-age";
import { clockOffsetMs } from "@/lib/booking/clock";
import type { OrganiserRefusal } from "@/lib/organisers/refusal";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import {
  OrganiserGate,
  OrganiserRefusalBlock,
  OrganiserWriteError,
} from "./organiser-gate";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { __resetOrganiserMocks } from "../../../mocks/organiser-handlers";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organiser/abc",
}));

function supplyAt(stage: "off" | "staff" | "early" | "all") {
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

function adultYear(): string {
  return String(indiaYear(Date.now() + clockOffsetMs()) - 30);
}

function Inside() {
  return <p>Inside the gate</p>;
}

beforeEach(() => {
  __resetOrganiserMocks();
});
afterEach(cleanup);

describe("OrganiserGate", () => {
  it("asks a signed-out person to sign in, back to the same page", async () => {
    supplyAt("all");
    renderWithQuery(
      <OrganiserGate>
        <Inside />
      </OrganiserGate>,
    );
    const link = await screen.findByRole("link", { name: W.signInButton });
    expect(link.getAttribute("href")).toBe(
      `/account?next=${encodeURIComponent("/organiser/abc")}`,
    );
    expect(screen.getByText(W.signIn)).toBeTruthy();
    expect(screen.queryByText("Inside the gate")).toBeNull();
  });

  it("asks to sign in at early, where the cohort decides", async () => {
    supplyAt("early");
    renderWithQuery(
      <OrganiserGate>
        <Inside />
      </OrganiserGate>,
    );
    expect(
      await screen.findByRole("link", { name: W.signInButton }),
    ).toBeTruthy();
  });

  it("says it is not open while supply is off, signed in or not", async () => {
    supplyAt("off");
    const { unmount } = renderWithQuery(
      <OrganiserGate>
        <Inside />
      </OrganiserGate>,
    );
    expect(await screen.findByText(W.notOpen)).toBeTruthy();
    unmount();

    __signInAppRouteMock("sess_test");
    renderWithQuery(
      <OrganiserGate>
        <Inside />
      </OrganiserGate>,
    );
    expect(await screen.findByText(W.notOpen)).toBeTruthy();
    expect(screen.queryByText("Inside the gate")).toBeNull();
  });

  it("renders the children signed in with supply open", async () => {
    supplyAt("all");
    __signInAppRouteMock("sess_test");
    renderWithQuery(
      <OrganiserGate>
        <Inside />
      </OrganiserGate>,
    );
    expect(await screen.findByText("Inside the gate")).toBeTruthy();
    expect(screen.queryByText(W.notOpen)).toBeNull();
  });
});

describe("OrganiserRefusalBlock", () => {
  it("shows the paused sentence with Try again", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithQuery(
      <OrganiserRefusalBlock
        refusal={{ kind: "paused", message: W.paused }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText(W.paused)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: W.tryAgain }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows the API's sentence alone for not a member, not found and not owner", () => {
    for (const refusal of [
      { kind: "notMember", message: W.notMember },
      { kind: "notFound", message: W.notFound },
      { kind: "notOwner", message: W.notOwner },
    ] as const) {
      const { unmount } = renderWithQuery(
        <OrganiserRefusalBlock refusal={refusal} onRetry={() => {}} />,
      );
      expect(screen.getByRole("alert").textContent).toContain(refusal.message);
      expect(screen.queryByRole("button")).toBeNull();
      unmount();
    }
  });

  it("shows the general error with Try again for a network failure", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithQuery(
      <OrganiserRefusalBlock refusal={{ kind: "network" }} onRetry={onRetry} />,
    );
    expect(screen.getByText(W.notNow)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: W.tryAgain }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("says the sign-in has ended, with the way back in", () => {
    renderWithQuery(
      <OrganiserRefusalBlock refusal={{ kind: "signedOut" }} onRetry={() => {}} />,
    );
    expect(screen.getByRole("alert").textContent).toContain(W.signIn);
    expect(screen.getByRole("link", { name: W.signInButton })).toBeTruthy();
  });

  it("opens the age step in the gate, then reads again", async () => {
    supplyAt("all");
    __signInAppRouteMock("sess_test");
    server.use(
      http.put(`${BASE}/me/age`, () =>
        HttpResponse.json({ ageConfirmed: true }),
      ),
    );
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithQuery(
      <OrganiserGate>
        <OrganiserRefusalBlock
          refusal={{ kind: "age", message: W.adultsOnly }}
          onRetry={onRetry}
        />
      </OrganiserGate>,
    );
    await user.type(
      await screen.findByLabelText(BIRTH_YEAR_WORDS.label),
      adultYear(),
    );
    await user.click(
      screen.getByRole("button", { name: BIRTH_YEAR_WORDS.send }),
    );
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText(BIRTH_YEAR_WORDS.label)).toBeNull();
    // Back on the screen, the step is not opened again by itself.
    expect(
      screen.getByRole("button", { name: CONFIRM_AGE_WORDS.title }),
    ).toBeTruthy();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps the closed sentence on screen after an under-18 answer signs out", async () => {
    supplyAt("all");
    __signInAppRouteMock("sess_test");
    server.use(
      http.put(`${BASE}/me/age`, () =>
        HttpResponse.json(
          {
            error: {
              code: "under_age_sign_up",
              message: "We have closed this account.",
              details: {},
              requestId: "req_age",
            },
          },
          { status: 403 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(
      <OrganiserGate>
        <OrganiserRefusalBlock
          refusal={{ kind: "age", message: W.adultsOnly }}
          onRetry={() => {}}
        />
      </OrganiserGate>,
    );
    await user.type(
      await screen.findByLabelText(BIRTH_YEAR_WORDS.label),
      String(indiaYear(Date.now() + clockOffsetMs()) - 10),
    );
    await user.click(
      screen.getByRole("button", { name: BIRTH_YEAR_WORDS.send }),
    );
    expect(
      await screen.findByRole("heading", { name: CONFIRM_AGE_WORDS.closedTitle }),
    ).toBeTruthy();
    // Signed out now, and still the closed sentence, never the sign-in prompt.
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: W.signInButton })).toBeNull(),
    );
    expect(
      screen.getByRole("heading", { name: CONFIRM_AGE_WORDS.closedTitle }),
    ).toBeTruthy();
  });
});

/** A form under the gate: one field, and the write's last refusal. */
function Form({
  first,
  onSend,
}: {
  first: OrganiserRefusal;
  onSend: () => void;
}) {
  const [name, setName] = useState("");
  const [refusal, setRefusal] = useState<OrganiserRefusal | null>(null);
  return (
    <form>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <OrganiserWriteError refusal={refusal} onRetry={onSend} />
      <button type="button" onClick={() => setRefusal(first)}>
        Send
      </button>
    </form>
  );
}

describe("OrganiserWriteError", () => {
  it("shows nothing for one field, and the line for several", () => {
    const { rerender } = renderWithQuery(
      <OrganiserWriteError
        refusal={{
          kind: "fields",
          fields: { name: "Too short." },
          message: "Too short.",
        }}
        onRetry={() => {}}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(
      <OrganiserWriteError
        refusal={{
          kind: "fields",
          fields: { name: "Too short.", runsIt: "Tick it." },
          message: W.checkFields,
        }}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe(W.checkFields);
  });

  it("shows only the API's sentence when an email is needed", () => {
    renderWithQuery(
      <OrganiserWriteError
        refusal={{ kind: "emailRequired", message: W.needEmail }}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe(W.needEmail);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says a network failure did not go through and does not send it again", () => {
    const onRetry = vi.fn();
    renderWithQuery(
      <OrganiserWriteError refusal={{ kind: "network" }} onRetry={onRetry} />,
    );
    expect(screen.getByRole("alert").textContent).toBe(W.notNow);
    expect(screen.queryByRole("button")).toBeNull();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("shows nothing with no refusal", () => {
    const { container } = renderWithQuery(
      <OrganiserWriteError refusal={null} onRetry={() => {}} />,
    );
    expect(container.textContent).toBe("");
  });

  it("asks the age, keeps what was typed and sends the same write once more", async () => {
    supplyAt("all");
    __signInAppRouteMock("sess_test");
    server.use(
      http.put(`${BASE}/me/age`, () =>
        HttpResponse.json({ ageConfirmed: true }),
      ),
    );
    const user = userEvent.setup();
    const onSend = vi.fn();
    renderWithQuery(
      <OrganiserGate>
        <Form first={{ kind: "age", message: W.adultsOnly }} onSend={onSend} />
      </OrganiserGate>,
    );
    await user.type(await screen.findByLabelText("Name"), "Island Walkers");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await user.type(
      await screen.findByLabelText(BIRTH_YEAR_WORDS.label),
      adultYear(),
    );
    await user.click(
      screen.getByRole("button", { name: BIRTH_YEAR_WORDS.send }),
    );
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(
      (screen.getByLabelText("Name") as HTMLInputElement).value,
    ).toBe("Island Walkers");
  });
});
