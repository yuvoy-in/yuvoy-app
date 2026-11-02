import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { renderWithQuery } from "@/test/render";
import { clubOrganiserInput, clubPageForm } from "@/lib/organisers/organisers";
import type { Organiser } from "@/lib/organisers/types";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { OrganiserGate } from "./organiser-gate";
import { EditOrganiserForm, NewOrganiserForm } from "./organiser-form";
import { clearLinked, linkedLine } from "./organiser-form-parts";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { __resetOrganiserMocks } from "../../../mocks/organiser-handlers";
import {
  CLUBS_HELD,
  ORG_CLOSED,
  ORG_HELPER_OF,
  ORG_IDS,
  ORG_PENDING,
  ORG_VERIFIED,
} from "../../../mocks/organiser-fixtures";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn() }),
  usePathname: () => "/organiser/new",
}));

function envelope(code: string, message: string, status: number, details = {}) {
  return HttpResponse.json(
    { error: { code, message, details, requestId: "req_t" } },
    { status },
  );
}

function newForm() {
  return renderWithQuery(
    <OrganiserGate>
      <NewOrganiserForm />
    </OrganiserGate>,
  );
}

function editForm(id: string) {
  return renderWithQuery(
    <OrganiserGate>
      <EditOrganiserForm id={id} />
    </OrganiserGate>,
  );
}

/** Fills the new form with a page the API takes. */
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(W.name), "Sample Tide Pool Club");
  await user.click(await screen.findByRole("button", { name: "Port Blair" }));
  await user.click(screen.getByRole("button", { name: "Adventure" }));
  await user.click(screen.getByLabelText(W.runsIt));
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

/** Straight to the mock API, in a scenario, as the signed-in session. */
function asked(path: string, scenario: string, init: RequestInit = {}) {
  return fetch(`${BASE}${path}?__scenario=${scenario}`, {
    ...init,
    headers: {
      Authorization: "Bearer sess_test",
      "Content-Type": "application/json",
    },
  });
}

beforeEach(() => {
  __resetOrganiserMocks();
  __signInAppRouteMock("sess_test");
  nav.replace.mockReset();
  nav.push.mockReset();
  nav.search = "";
});
afterEach(cleanup);

describe("NewOrganiserForm", () => {
  it("says what is missing before sending anything", async () => {
    let posts = 0;
    server.use(
      http.post(`${BASE}/organisers`, () => {
        posts += 1;
        return envelope("internal", "", 500);
      }),
    );
    const user = userEvent.setup();
    newForm();
    await screen.findByRole("button", { name: "Port Blair" });
    await user.click(screen.getByRole("button", { name: W.send }));
    expect(screen.getByText(W.needName)).toBeTruthy();
    expect(screen.getByText(W.needPlace)).toBeTruthy();
    expect(screen.getByText(W.needDepartments)).toBeTruthy();
    expect(screen.getByText(W.needRunsIt)).toBeTruthy();
    expect(screen.getByText(W.checkFields)).toBeTruthy();
    expect(posts).toBe(0);
  });

  it("sends the page and opens the new organiser with the thanks line", async () => {
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE}/organisers`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { ...ORG_PENDING, id: "org_new_1", name: "Sample Tide Pool Club" },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    newForm();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Food and drink" }));
    await user.click(screen.getByRole("button", { name: W.addLink }));
    await user.type(
      screen.getByLabelText(W.linkUrl),
      "https://tidepools.example.com",
    );
    await user.type(screen.getByLabelText(W.contactEmail), "tide@example.com");
    await user.click(screen.getByRole("button", { name: W.send }));

    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith("/organiser/org_new_1?made=1"),
    );
    expect(sent).toEqual({
      name: "Sample Tide Pool Club",
      destinationKey: "andaman/port_blair",
      departments: ["adventure", "food_drink"],
      runsIt: true,
      links: [{ kind: "website", url: "https://tidepools.example.com" }],
      contactEmail: "tide@example.com",
    });
  });

  it("takes at most three departments", async () => {
    const user = userEvent.setup();
    newForm();
    await screen.findByRole("button", { name: "Port Blair" });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Sports" })).toBeNull(),
    );
    const group = screen.getByTestId("organiser-form-departments");
    await user.click(within(group).getByRole("button", { name: "Adventure" }));
    await user.click(
      within(group).getByRole("button", { name: "Nature and wildlife" }),
    );
    await user.click(
      within(group).getByRole("button", { name: "Food and drink" }),
    );
    const fourth = within(group).getByRole("button", { name: "Wellness" });
    expect((fourth as HTMLButtonElement).disabled).toBe(true);
    expect(
      within(group)
        .getByRole("button", { name: "Adventure" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("shows the API's sentence under the field and keeps what was typed", async () => {
    const user = userEvent.setup();
    newForm();
    await fill(user);
    await user.click(screen.getByRole("button", { name: W.addLink }));
    await user.type(screen.getByLabelText(W.linkUrl), "http://plain.example.com");
    await user.click(screen.getByRole("button", { name: W.send }));

    expect(
      await screen.findByText("Give a link that starts with https://."),
    ).toBeTruthy();
    expect((screen.getByLabelText(W.name) as HTMLInputElement).value).toBe(
      "Sample Tide Pool Club",
    );
    expect((screen.getByLabelText(W.linkUrl) as HTMLInputElement).value).toBe(
      "http://plain.example.com",
    );
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("says the pause with Try again, keeping everything typed", async () => {
    server.use(
      http.post(`${BASE}/organisers`, () =>
        envelope("organisers_paused", W.paused, 503),
      ),
    );
    const user = userEvent.setup();
    newForm();
    await fill(user);
    await user.click(screen.getByRole("button", { name: W.send }));
    expect(await screen.findByText(W.paused)).toBeTruthy();
    expect(screen.getByRole("button", { name: W.tryAgain })).toBeTruthy();
    expect((screen.getByLabelText(W.name) as HTMLInputElement).value).toBe(
      "Sample Tide Pool Club",
    );
    expect(
      screen
        .getByRole("button", { name: "Port Blair" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("keeps the button off while the save is out, and sends once", async () => {
    let posts = 0;
    server.use(
      http.post(`${BASE}/organisers`, async () => {
        posts += 1;
        await delay(200);
        return HttpResponse.json(
          { ...ORG_PENDING, id: "org_new_2" },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    newForm();
    await fill(user);
    const send = screen.getByTestId("organiser-form-send");
    await user.click(send);
    await waitFor(() => expect(send.getAttribute("aria-disabled")).toBe("true"));
    expect(send.textContent).toContain(W.sending);
    await user.click(send);
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith("/organiser/org_new_2?made=1"),
    );
    expect(posts).toBe(1);
  });
});

describe("EditOrganiserForm", () => {
  it("sends the whole page back, the contact email with it, and says it saved", async () => {
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.patch(`${BASE}/organisers/:id`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...ORG_VERIFIED, about: "New about." });
      }),
    );
    const user = userEvent.setup();
    editForm(ORG_IDS.verified);
    const name = (await screen.findByLabelText(W.name)) as HTMLInputElement;
    expect(name.value).toBe(ORG_VERIFIED.name);
    expect(screen.queryByLabelText(W.runsIt)).toBeNull();
    const about = screen.getByLabelText(W.about);
    await user.clear(about);
    await user.type(about, "New about.");
    await user.click(screen.getByRole("button", { name: W.save }));

    expect(await screen.findByText(W.saved)).toBeTruthy();
    expect(sent).toEqual({
      name: ORG_VERIFIED.name,
      destinationKey: ORG_VERIFIED.destinationKey,
      departments: ORG_VERIFIED.departments,
      runsIt: true,
      about: "New about.",
      links: ORG_VERIFIED.links,
      contactEmail: "walkers@example.com",
    });
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("is an owner's only", async () => {
    editForm(ORG_IDS.helperOf);
    expect(await screen.findByText(W.notOwner)).toBeTruthy();
    expect(screen.queryByTestId("organiser-form")).toBeNull();
    expect(ORG_HELPER_OF.role).toBe("helper");
  });

  it("says a closed page cannot be edited", async () => {
    editForm(ORG_IDS.closed);
    expect(await screen.findByText(W.closed)).toBeTruthy();
    expect(screen.queryByTestId("organiser-form")).toBeNull();
    expect(ORG_CLOSED.state).toBe("closed");
  });
});

describe("A group's organiser page (yuvoy-app#225)", () => {
  const [runners, quiz] = CLUBS_HELD;

  it("shows the group's name and place fixed, ticks its category, and opens the verified page", async () => {
    inScenario("organisers-club");
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE}/organisers`, async ({ request }) => {
        sent = (await request.clone().json()) as Record<string, unknown>;
        return undefined;
      }),
    );
    nav.search = `club=${runners.clubId}`;
    const user = userEvent.setup();
    newForm();

    expect(
      (await screen.findByTestId("organiser-form-fixed-name")).textContent,
    ).toBe(runners.name);
    expect(
      (await screen.findByTestId("organiser-form-fixed-place")).textContent,
    ).toBe("Havelock (Swaraj Dweep)");
    expect(screen.getByText(W.clubFixed)).toBeTruthy();
    expect(screen.queryByLabelText(W.name)).toBeNull();
    expect(screen.queryByRole("button", { name: "Port Blair" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Sports" }).getAttribute("aria-pressed"),
    ).toBe("true");

    await user.click(screen.getByLabelText(W.runsIt));
    await user.click(screen.getByRole("button", { name: W.clubCardButton }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1));
    const to = String(nav.replace.mock.calls[0]?.[0]);
    expect(to).toMatch(/^\/organiser\/[^/?]+\?made=club$/);
    expect(sent).toEqual({
      clubId: runners.clubId,
      departments: ["sports"],
      runsIt: true,
    });

    // 201 verified with no code, and the card is gone on the next read.
    const mine = (await (
      await asked("/me/organisers", "organisers-club")
    ).json()) as { items: Organiser[]; clubsToLink: { clubId: string }[] };
    const made = mine.items[0];
    expect(to).toBe(`/organiser/${made?.id}?made=club`);
    expect(made?.state).toBe("verified");
    expect(made?.clubId).toBe(runners.clubId);
    expect(made?.verificationCode ?? null).toBeNull();
    expect(mine.clubsToLink.map((club) => club.clubId)).toEqual([quiz.clubId]);
  });

  it("opens the first page, with the API's sentence, when the group already has one", async () => {
    inScenario("organisers-club");
    nav.search = `club=${runners.clubId}`;
    const user = userEvent.setup();
    newForm();
    await user.click(await screen.findByLabelText(W.runsIt));
    const send = screen.getByRole("button", { name: W.clubCardButton });
    await user.click(send);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1));
    const first = String(nav.replace.mock.calls[0]?.[0]).split("?")[0];

    // The form stays (the move is mocked): the same group is sent again.
    expect(screen.getByTestId("organiser-form-fixed-name").textContent).toBe(
      runners.name,
    );
    await user.click(send);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(2));
    expect(nav.replace.mock.calls[1]?.[0]).toBe(first);
    const id = first?.replace("/organiser/", "") ?? "";
    expect(linkedLine(id)).toBe(W.clubLinked);
    clearLinked(id);
  });

  it("says a group no longer offered cannot be found, with the way back", async () => {
    inScenario("organisers-club");
    nav.search = "club=3d8b6f10-6c7d-4e8f-a0b1-4e5f6a7b8c09";
    newForm();
    const gone = await screen.findByTestId("organiser-club-gone");
    expect(gone.textContent).toContain(W.noClub);
    expect(
      within(gone).getByRole("link", { name: W.title }).getAttribute("href"),
    ).toBe("/organiser");
    expect(screen.queryByTestId("organiser-form")).toBeNull();
  });

  it("shows the API's sentence for a forced setup while People is paused", async () => {
    inScenario("organisers-club-paused");
    // The hub would offer nothing here: the offer is forced, the write is the scenario's.
    server.use(
      http.get(`${BASE}/me/organisers`, () =>
        HttpResponse.json({ items: [], clubsToLink: CLUBS_HELD }),
      ),
    );
    nav.search = `club=${quiz.clubId}`;
    const user = userEvent.setup();
    newForm();
    await user.click(await screen.findByRole("button", { name: "Adventure" }));
    await user.click(screen.getByLabelText(W.runsIt));
    await user.click(screen.getByRole("button", { name: W.clubCardButton }));
    expect(
      (await screen.findByTestId("organiser-write-error")).textContent,
    ).toContain("Your use of People is paused");
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("sends a group's name and place back as read, and shows a refused change under them", async () => {
    const made = (await (
      await asked("/organisers", "organisers-club", {
        method: "POST",
        body: JSON.stringify(
          clubOrganiserInput(clubPageForm(runners), runners.clubId),
        ),
      })
    ).json()) as Organiser;
    inScenario("organisers-club");
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.patch(`${BASE}/organisers/:id`, async ({ request }) => {
        sent = (await request.clone().json()) as Record<string, unknown>;
        return undefined;
      }),
    );
    const user = userEvent.setup();
    editForm(made.id);

    expect(
      (await screen.findByTestId("organiser-form-fixed-name")).textContent,
    ).toBe(runners.name);
    expect(screen.queryByLabelText(W.name)).toBeNull();
    await user.type(screen.getByLabelText(W.about), "Runs at dawn.");
    await user.click(screen.getByRole("button", { name: W.save }));
    expect(await screen.findByText(W.saved)).toBeTruthy();
    expect(sent).toMatchObject({
      name: runners.name,
      destinationKey: runners.destinationKey,
      about: "Runs at dawn.",
    });

    server.use(
      http.patch(`${BASE}/organisers/:id`, () =>
        envelope(
          "invalid_input",
          "A group's organiser keeps the group's name.",
          400,
          { name: "A group's organiser keeps the group's name." },
        ),
      ),
    );
    await user.click(screen.getByRole("button", { name: W.save }));
    expect(
      (await screen.findByTestId("organiser-form-fixed-name-error"))
        .textContent,
    ).toBe("A group's organiser keeps the group's name.");
  });
});
