import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { renderWithQuery } from "@/test/render";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { OrganiserGate } from "./organiser-gate";
import { EditOrganiserForm, NewOrganiserForm } from "./organiser-form";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { __resetOrganiserMocks } from "../../../mocks/organiser-handlers";
import {
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
  await user.type(
    await screen.findByLabelText(W.name),
    "Sample Tide Pool Club",
  );
  await user.click(await screen.findByRole("button", { name: "Port Blair" }));
  await user.click(screen.getByRole("button", { name: "Adventure" }));
  await user.click(screen.getByLabelText(W.runsIt));
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
    await user.type(
      screen.getByLabelText(W.linkUrl),
      "http://plain.example.com",
    );
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

  it("puts a link's sentence under its own row when a blank row was not sent", async () => {
    let sent: Record<string, unknown> | null = null;
    const line = "That site cannot be linked.";
    server.use(
      http.post(`${BASE}/organisers`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return envelope("invalid_input", line, 400, { "links.0": line });
      }),
    );
    const user = userEvent.setup();
    newForm();
    await fill(user);
    await user.click(screen.getByRole("button", { name: W.addLink }));
    await user.click(screen.getByRole("button", { name: W.addLink }));
    const second = screen.getAllByLabelText(W.linkUrl)[1] as HTMLInputElement;
    await user.type(second, "https://blocked.example.com");
    await user.click(screen.getByRole("button", { name: W.send }));

    const row = await screen.findByTestId("organiser-form-link-1");
    expect(await within(row).findByText(line)).toBeTruthy();
    expect(
      within(screen.getByTestId("organiser-form-link-0")).queryByText(line),
    ).toBeNull();
    expect(sent).toMatchObject({
      links: [{ kind: "website", url: "https://blocked.example.com" }],
    });
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
    await waitFor(() =>
      expect(send.getAttribute("aria-disabled")).toBe("true"),
    );
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

  it("reads the page again after a 409, so a page closed meanwhile shows closed", async () => {
    const user = userEvent.setup();
    editForm(ORG_IDS.verified);
    await screen.findByLabelText(W.name);
    // Staff close the page while the form is open.
    server.use(
      http.get(`${BASE}/organisers/:id`, () =>
        HttpResponse.json({ ...ORG_VERIFIED, state: "closed" }),
      ),
      http.patch(`${BASE}/organisers/:id`, () =>
        envelope("conflict", "This organiser page is closed.", 409, {
          state: "closed",
        }),
      ),
    );
    await user.click(screen.getByRole("button", { name: W.save }));

    expect(await screen.findByTestId("organiser-edit-closed")).toBeTruthy();
    expect(screen.queryByTestId("organiser-form")).toBeNull();
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
