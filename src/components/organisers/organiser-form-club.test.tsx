import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { YuvoyError } from "@/lib/api/errors";
import {
  clubOrganiserInput,
  clubPageForm,
} from "@/lib/organisers/organisers-club";
import type { Organiser } from "@/lib/organisers/types";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { OrganiserGate } from "./organiser-gate";
import { clubOfferChanged } from "./organiser-club-parts";
import { EditOrganiserForm, NewOrganiserForm } from "./organiser-form";
import { clearLinked, linkedLine } from "./organiser-form-parts";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { __resetOrganiserMocks } from "../../../mocks/organiser-handlers";
import { CLUB_IDS, CLUBS_HELD } from "../../../mocks/organiser-fixtures";

/**
 * A group's organiser form (yuvoy-app#225): first its own cases, then the
 * ones its review asked for: a group set up already opens its page, a create
 * the API refuses for the group reads the hub's list again, the plain setup
 * is unchanged for a person who holds groups, and a 400 on the place shows
 * under the place line. The plain page's cases are in
 * `organiser-form.test.tsx`.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn() }),
  usePathname: () => "/organiser/new",
}));

const [runners, quiz] = CLUBS_HELD;

/** A group the API has hidden: still offered by a stale list, 404 on create. */
const HIDDEN = {
  clubId: "3d8b6f10-6c7d-4e8f-a0b1-4e5f6a7b8c04",
  name: "Sample Hidden Walkers",
  destinationKey: "andaman/port_blair",
  category: null,
};

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

/** A request without `__scenario` is asked again with it, as e2e picks one. */
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

/** Sets up the runners' organiser in `organisers-club`, as a second tab. */
async function setUpRunners(): Promise<Organiser> {
  const made = await asked("/organisers", "organisers-club", {
    method: "POST",
    body: JSON.stringify(
      clubOrganiserInput(clubPageForm(runners), runners.clubId),
    ),
  });
  return (await made.json()) as Organiser;
}

/** The hub's list offering one group, counting each read of it. */
function offering(club: typeof HIDDEN): { reads: number } {
  const seen = { reads: 0 };
  server.use(
    http.get(`${BASE}/me/organisers`, () => {
      seen.reads += 1;
      return HttpResponse.json({ items: [], clubsToLink: [club] });
    }),
  );
  return seen;
}

beforeEach(() => {
  __resetOrganiserMocks();
  __signInAppRouteMock("sess_test");
  nav.replace.mockReset();
  nav.push.mockReset();
  nav.search = "";
});
afterEach(cleanup);

describe("A group's organiser page (yuvoy-app#225)", () => {
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
      screen
        .getByRole("button", { name: "Sports" })
        .getAttribute("aria-pressed"),
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
    const made = mine.items.find((org) => org.clubId === runners.clubId);
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

  it("puts a link's sentence under its own row when a blank row was not sent", async () => {
    inScenario("organisers-club");
    let sent: Record<string, unknown> | null = null;
    const line = "That site cannot be linked.";
    server.use(
      http.post(`${BASE}/organisers`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return envelope("invalid_input", line, 400, { "links.0": line });
      }),
    );
    nav.search = `club=${runners.clubId}`;
    const user = userEvent.setup();
    newForm();
    await user.click(await screen.findByLabelText(W.runsIt));
    await user.click(screen.getByRole("button", { name: W.addLink }));
    await user.click(screen.getByRole("button", { name: W.addLink }));
    const second = screen.getAllByLabelText(W.linkUrl)[1] as HTMLInputElement;
    await user.type(second, "https://blocked.example.com");
    await user.click(screen.getByRole("button", { name: W.clubCardButton }));

    const row = await screen.findByTestId("organiser-form-link-1");
    expect(await within(row).findByText(line)).toBeTruthy();
    expect(
      within(screen.getByTestId("organiser-form-link-0")).queryByText(line),
    ).toBeNull();
    expect(sent).toMatchObject({
      clubId: runners.clubId,
      links: [{ kind: "website", url: "https://blocked.example.com" }],
    });
    expect(nav.replace).not.toHaveBeenCalled();
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

describe("A group's form opened again (yuvoy-app#225, review point 1)", () => {
  it("opens the group's page, by a replace, with the 409's sentence", async () => {
    const made = await setUpRunners();
    inScenario("organisers-club");
    nav.search = `club=${runners.clubId}`;
    newForm();

    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith(`/organiser/${made.id}`),
    );
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.push).not.toHaveBeenCalled();
    expect(linkedLine(made.id)).toBe(W.clubLinked);
    expect(screen.queryByTestId("organiser-club-gone")).toBeNull();
    expect(screen.queryByTestId("organiser-form")).toBeNull();
    clearLinked(made.id);
  });
});

describe("A group's create the API refuses for the group (review points 5 and 7)", () => {
  it("says a hidden group cannot be found, and reads the hub's list again", async () => {
    inScenario("organisers-club");
    const list = offering(HIDDEN);
    nav.search = `club=${HIDDEN.clubId}`;
    const user = userEvent.setup();
    newForm();
    await user.click(await screen.findByRole("button", { name: "Adventure" }));
    await user.click(screen.getByLabelText(W.runsIt));
    const before = list.reads;
    await user.click(screen.getByRole("button", { name: W.clubCardButton }));

    expect(
      (await screen.findByTestId("organiser-write-error")).textContent,
    ).toContain("We could not find that group.");
    await waitFor(() => expect(list.reads).toBeGreaterThan(before));
    // The form stays with the answer: nothing moves the person.
    expect(screen.getByTestId("organiser-form-fixed-name").textContent).toBe(
      HIDDEN.name,
    );
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("reads the hub's list again after 403 not_club_holder", async () => {
    inScenario("organisers-club");
    const list = offering({ ...HIDDEN, clubId: CLUB_IDS.heldByAnother });
    nav.search = `club=${CLUB_IDS.heldByAnother}`;
    const user = userEvent.setup();
    newForm();
    await user.click(await screen.findByRole("button", { name: "Adventure" }));
    await user.click(screen.getByLabelText(W.runsIt));
    const before = list.reads;
    await user.click(screen.getByRole("button", { name: W.clubCardButton }));

    expect(
      (await screen.findByTestId("organiser-write-error")).textContent,
    ).toContain("Only the person who holds this group");
    await waitFor(() => expect(list.reads).toBeGreaterThan(before));
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("names which refusals mean the group is no longer to offer", () => {
    const refused = (status: number, code: string) =>
      new YuvoyError({ code, message: "", status });
    expect(clubOfferChanged(refused(404, "not_found"))).toBe(true);
    expect(clubOfferChanged(refused(403, "not_club_holder"))).toBe(true);
    expect(clubOfferChanged(refused(403, "people_paused"))).toBe(true);
    expect(clubOfferChanged(refused(403, "not_owner"))).toBe(false);
    expect(clubOfferChanged(refused(409, "club_already_linked"))).toBe(false);
    expect(clubOfferChanged(new Error("offline"))).toBe(false);
  });
});

describe("The plain setup for a person who holds groups (review point 7)", () => {
  it("still sends a name and place and gets a pending organiser with a code", async () => {
    inScenario("organisers-club");
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE}/organisers`, async ({ request }) => {
        sent = (await request.clone().json()) as Record<string, unknown>;
        return undefined;
      }),
    );
    const user = userEvent.setup();
    newForm();
    await user.type(
      await screen.findByLabelText(W.name),
      "Sample Tide Pool Club",
    );
    await user.click(await screen.findByRole("button", { name: "Port Blair" }));
    await user.click(screen.getByRole("button", { name: "Adventure" }));
    await user.click(screen.getByLabelText(W.runsIt));
    await user.click(screen.getByRole("button", { name: W.send }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1));
    const to = String(nav.replace.mock.calls[0]?.[0]);
    expect(to).toMatch(/^\/organiser\/[^/?]+\?made=1$/);
    expect(sent).toMatchObject({
      name: "Sample Tide Pool Club",
      destinationKey: "andaman/port_blair",
    });
    expect(sent).not.toHaveProperty("clubId");

    const mine = (await (
      await asked("/me/organisers", "organisers-club")
    ).json()) as { items: Organiser[]; clubsToLink: { clubId: string }[] };
    const made = mine.items.find((org) => to === `/organiser/${org.id}?made=1`);
    expect(made?.state).toBe("pending");
    expect(made?.verificationCode).toBeTruthy();
    expect(made?.clubId ?? null).toBeNull();
    // Both groups are still offered.
    expect(mine.clubsToLink.map((club) => club.clubId)).toEqual([
      runners.clubId,
      quiz.clubId,
    ]);
  });
});

describe("A refused place on a group's edit (review point 7)", () => {
  it("shows the API's sentence under the place line", async () => {
    const made = await setUpRunners();
    inScenario("organisers-club");
    const said = "A group's organiser keeps the group's place.";
    server.use(
      http.patch(`${BASE}/organisers/:id`, () =>
        envelope("invalid_input", said, 400, { destinationKey: said }),
      ),
    );
    const user = userEvent.setup();
    editForm(made.id);

    expect(
      (await screen.findByTestId("organiser-form-fixed-place")).textContent,
    ).toBe("Havelock (Swaraj Dweep)");
    await user.click(screen.getByRole("button", { name: W.save }));

    expect(
      (await screen.findByTestId("organiser-form-fixed-place-error"))
        .textContent,
    ).toBe(said);
    expect(screen.queryByTestId("organiser-form-fixed-name-error")).toBeNull();
    expect(screen.queryByText(W.saved)).toBeNull();
  });
});
