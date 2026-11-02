import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { renderWithQuery } from "@/test/render";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { OrganiserGate } from "./organiser-gate";
import { OrganiserHelpers } from "./organiser-helpers";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { __resetOrganiserMocks } from "../../../mocks/organiser-handlers";
import {
  HELPER_OF_HELPERS,
  ORG_IDS,
  VERIFIED_HELPERS,
} from "../../../mocks/organiser-fixtures";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organiser/x/helpers",
}));

function open(id: string) {
  return renderWithQuery(
    <OrganiserGate>
      <OrganiserHelpers id={id} />
    </OrganiserGate>,
  );
}

function names() {
  const list = screen.getByTestId("organiser-helpers-list");
  return within(list)
    .getAllByTestId("organiser-helper")
    .map((row) => row.firstChild?.textContent);
}

beforeEach(() => {
  __resetOrganiserMocks();
  __signInAppRouteMock("sess_test");
});
afterEach(cleanup);

describe("OrganiserHelpers", () => {
  it("lists an owner's helpers and adds one by email", async () => {
    const user = userEvent.setup();
    open(ORG_IDS.verified);
    await screen.findByTestId("organiser-helpers-list");
    expect(names()).toEqual(VERIFIED_HELPERS.map((h) => h.firstName));

    await user.type(screen.getByLabelText(W.helperEmail), "nisha@example.com");
    await user.click(screen.getByRole("button", { name: W.addHelper }));

    expect(await screen.findByText(W.helperAdded("Nisha"))).toBeTruthy();
    await waitFor(() =>
      expect(names()).toEqual([
        ...VERIFIED_HELPERS.map((h) => h.firstName),
        "Nisha",
      ]),
    );
    expect(
      (screen.getByLabelText(W.helperEmail) as HTMLInputElement).value,
    ).toBe("");
  });

  it("asks for the email before sending", async () => {
    let posts = 0;
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST" && request.url.includes("/helpers")) {
        posts += 1;
      }
    });
    const user = userEvent.setup();
    open(ORG_IDS.verified);
    await user.click(await screen.findByRole("button", { name: W.addHelper }));
    expect(screen.getByText(W.needHelperEmail)).toBeTruthy();
    expect(posts).toBe(0);
    server.events.removeAllListeners();
  });

  it("shows the API's sentence under the email and keeps it", async () => {
    const user = userEvent.setup();
    open(ORG_IDS.verified);
    await user.type(
      await screen.findByLabelText(W.helperEmail),
      "stranger@example.com",
    );
    await user.click(screen.getByRole("button", { name: W.addHelper }));
    expect(
      await screen.findByText(
        "Nobody has signed in to Yuvoy with that email yet. Ask them to sign in once with it first.",
      ),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText(W.helperEmail) as HTMLInputElement).value,
    ).toBe("stranger@example.com");
  });

  it("removes a helper", async () => {
    const user = userEvent.setup();
    open(ORG_IDS.verified);
    const meera = VERIFIED_HELPERS[1]?.firstName ?? "missing";
    await user.click(
      await screen.findByRole("button", { name: W.removeHelperLabel(meera) }),
    );
    await waitFor(() =>
      expect(names()).toEqual([VERIFIED_HELPERS[0]?.firstName]),
    );
  });

  it("keeps Add helper off before the page is checked, with the sentence why", async () => {
    let posts = 0;
    server.use(
      http.post(`${BASE}/organisers/:id/helpers`, () => {
        posts += 1;
        return new Response(null, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    open(ORG_IDS.pending);
    const add = await screen.findByRole("button", { name: W.addHelper });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("organiser-helpers-off").textContent).toBe(
      W.helpersAfterCheck,
    );
    expect(
      (screen.getByLabelText(W.helperEmail) as HTMLInputElement).disabled,
    ).toBe(true);
    await user.click(add);
    expect(posts).toBe(0);
    expect(await screen.findByText(W.noHelpers)).toBeTruthy();
  });

  it("shows a helper the names only, with nothing to add or remove", async () => {
    open(ORG_IDS.helperOf);
    await screen.findByTestId("organiser-helpers-list");
    expect(names()).toEqual(HELPER_OF_HELPERS.map((h) => h.firstName));
    expect(screen.getByText(W.helpersRead)).toBeTruthy();
    expect(screen.queryByTestId("organiser-helpers-form")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^Remove/ }),
    ).toBeNull();
  });
});
