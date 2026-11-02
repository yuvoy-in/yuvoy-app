import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { __seedSavedMock } from "../../../mocks/saved-handlers";
import { EXPERIENCES } from "../../../mocks/fixtures";
import { useRelease } from "@/lib/site/use-release";
import type { LifeEntry } from "@/lib/me/types";
import { MeCounts, MeSection } from "./me-section";
import {
  ASKED_EVENT,
  EVENT_ID,
  PHOTO,
  TRIP_ID,
  badge,
  meRoutes,
  openMe,
  page,
  plan,
  releases,
  trip,
  went,
} from "./me-test-kit";

/**
 * Me on Account (yuvoy-mobile#444): the header row, Did you go?, the life
 * list and its two tabs. The badges have their own file, and so do the two
 * settings. Each case names the issue's test case it covers.
 */

const idb = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.store.get(k),
  set: async (k: string, v: unknown) => {
    idb.store.set(k, v);
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(),
}));

const TOKEN = "sess_919000000000";

beforeEach(() => {
  idb.store.clear();
  vi.stubGlobal("indexedDB", {});
  __signInAppRouteMock(TOKEN);
  openMe();
});

/** The me release as Me reads it, once it is known. */
function ReleaseProbe() {
  const release = useRelease("me");
  return (
    <p data-testid="release">
      {release.pending ? "pending" : `${release.stage} ${release.open ? "open" : "shut"}`}
    </p>
  );
}

const card = (title: string) => screen.findByRole("article", { name: title });

describe("the header row (case 1)", () => {
  it("counts done, the saved list and the badges once both have answered", async () => {
    __seedSavedMock(TOKEN, [EXPERIENCES[0]!.id]);
    meRoutes({ list: page([trip(), went(), plan()], { done: 3 }) });
    renderWithQuery(<MeCounts />);
    expect(
      await screen.findByText("Done 3 · Bucket list 1 · Badges 1"),
    ).toBeInTheDocument();
  });

  it("draws no row of zeros when the list did not load", async () => {
    const at = meRoutes({ list: 500 });
    renderWithQuery(<MeCounts />);
    await waitFor(() => expect(at.list.count).toBeGreaterThan(0));
    await waitFor(() => expect(at.badges.count).toBeGreaterThan(0));
    expect(screen.queryByText(/^Done \d/)).toBeNull();
    // Still nothing once the transport has given up on the list.
    await new Promise((r) => setTimeout(r, 1_500));
    expect(screen.queryByText(/^Done \d/)).toBeNull();
  });
});

describe("the Done tab (cases 2, 3, 4, 5)", () => {
  it("shows each entry with its date, place, proof, stars and cheers", async () => {
    meRoutes({ list: page([trip(), went(), plan()]) });
    renderWithQuery(<MeSection />);

    const dive = await card("Try-dive at Nemo Reef");
    expect(
      within(dive).getByRole("link", { name: "Try-dive at Nemo Reef" }),
    ).toHaveAttribute("href", "/e/try-dive-nemo-reef");
    expect(within(dive).getByText("Booked with Yuvoy · Checked in by the crew")).toBeInTheDocument();
    expect(within(dive).getByRole("img", { name: "4 out of 5" })).toBeInTheDocument();
    // The place comes from the places list, by the entry's destination.
    expect(
      await within(dive).findByText("16 Sep 2026 · Havelock (Swaraj Dweep)"),
    ).toBeInTheDocument();

    const jazz = await card("Jazz at the Fort");
    expect(
      within(jazz).getByRole("link", { name: "Jazz at the Fort" }),
    ).toHaveAttribute("href", `/f/${EVENT_ID}`);
    expect(within(jazz).getByText("You said you went")).toBeInTheDocument();
    expect(within(jazz).getByText("1 cheer")).toBeInTheDocument();
    expect(within(jazz).queryByRole("img")).toBeNull();

    // A plan opens nothing and says it is the owner's alone.
    const crew = await card("Sunday breakfast crew");
    expect(within(crew).queryByRole("link")).toBeNull();
    expect(within(crew).getByText("Only you see plans")).toBeInTheDocument();
    expect(within(crew).queryByRole("radio")).toBeNull();
    expect(within(crew).queryByText(/cheer/)).toBeNull();
  });

  it("names who cheered at a tap on the cheers (case 3)", async () => {
    const user = userEvent.setup();
    meRoutes({ list: page([trip()]) });
    renderWithQuery(<MeSection />);
    const dive = await card("Try-dive at Nemo Reef");
    const cheers = within(dive).getByRole("button", { name: "2 cheers" });
    expect(cheers).toHaveAttribute("aria-expanded", "false");
    expect(within(dive).getByText("Priya S., Ravi K.")).not.toBeVisible();
    await user.click(cheers);
    expect(cheers).toHaveAttribute("aria-expanded", "true");
    expect(within(dive).getByText("Priya S., Ravi K.")).toBeVisible();
  });

  it("says what Done is for when it is empty", async () => {
    meRoutes({ list: page([]), badges: { earned: [], inProgress: [] } });
    renderWithQuery(<MeSection />);
    expect(
      await screen.findByText(
        "Nothing here yet. Things you book, go to and do with friends show up here after they happen.",
      ),
    ).toBeInTheDocument();
  });

  it("reads the next page at Show more, from the cursor", async () => {
    const user = userEvent.setup();
    const second = trip({ entryId: "trip:66666666-6666-4666-8666-666666666666", title: "Kayak at dawn" });
    const at = meRoutes({
      list: (request: Request) =>
        HttpResponse.json(
          new URL(request.url).searchParams.get("cursor") === "c1"
            ? page([second])
            : page([trip()], { nextCursor: "c1" }),
        ),
    });
    renderWithQuery(<MeSection />);
    await card("Try-dive at Nemo Reef");
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(await card("Kayak at dawn")).toBeInTheDocument();
    expect(new URL(at.list.urls.at(-1)!).searchParams.get("cursor")).toBe("c1");
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("reads page after page and stops where nextCursor is null", async () => {
    const user = userEvent.setup();
    const kayak = trip({ entryId: "trip:66666666-6666-4666-8666-666666666666", title: "Kayak at dawn" });
    const snorkel = trip({ entryId: "trip:77777777-7777-4777-8777-777777777777", title: "Snorkel at noon" });
    const at = meRoutes({
      list: (request: Request) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        return HttpResponse.json(
          cursor === "c2"
            ? page([snorkel])
            : cursor === "c1"
              ? page([kayak], { nextCursor: "c2" })
              : page([trip()], { nextCursor: "c1" }),
        );
      },
    });
    renderWithQuery(<MeSection />);
    await card("Try-dive at Nemo Reef");
    await user.click(screen.getByRole("button", { name: "Show more" }));
    await card("Kayak at dawn");
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(await card("Snorkel at noon")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    expect(at.list.urls.map((u) => new URL(u).searchParams.get("cursor"))).toEqual([null, "c1", "c2"]);
  });

  it("never draws an entry it has no proof line for", async () => {
    const odd = trip({
      entryId: "trip:88888888-8888-4888-8888-888888888888",
      title: "Something new",
      proof: "a_proof_from_later" as LifeEntry["proof"],
    });
    meRoutes({ list: page([trip(), odd]) });
    renderWithQuery(<MeSection />);
    await card("Try-dive at Nemo Reef");
    expect(screen.queryByRole("article", { name: "Something new" })).toBeNull();
    expect(screen.queryByText("Something new")).toBeNull();
  });

  it("keeps the first page and says so when the next one fails", async () => {
    const user = userEvent.setup();
    meRoutes({
      list: (request: Request) =>
        new URL(request.url).searchParams.get("cursor")
          ? HttpResponse.json({ error: { code: "unavailable", message: "No." } }, { status: 503 })
          : HttpResponse.json(page([trip()], { nextCursor: "c1" })),
    });
    renderWithQuery(<MeSection />);
    await card("Try-dive at Nemo Reef");
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(
      // The transport's own backoff on a failed read runs first.
      await screen.findByText("That page did not load. Try again.", undefined, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Try-dive at Nemo Reef" })).toBeInTheDocument();
  });
});

describe("who sees an entry (case 6)", () => {
  it("sends Only me for a trip on its own route, and shows it at once", async () => {
    const user = userEvent.setup();
    const at = meRoutes({ list: page([trip()]) });
    renderWithQuery(<MeSection />);
    const who = within(await card("Try-dive at Nemo Reef")).getByRole("group", {
      name: "Who sees Try-dive at Nemo Reef",
    });
    expect(within(who).getByRole("radio", { name: "Friends" })).toBeChecked();
    await user.click(within(who).getByRole("radio", { name: "Only me" }));
    await waitFor(() =>
      expect(within(who).getByRole("radio", { name: "Only me" })).toBeChecked(),
    );
    await waitFor(() => expect(at.patchEntry.bodies).toEqual([{ visibility: "only_me" }]));
    expect(at.patchEntry.urls[0]).toContain(`/me/life-list/${encodeURIComponent(TRIP_ID)}`);
    expect(at.patchWent.count).toBe(0);
  });

  it("changes a went entry by its event, never the life list route", async () => {
    const user = userEvent.setup();
    const at = meRoutes({ list: page([went()]) });
    renderWithQuery(<MeSection />);
    const jazz = await card("Jazz at the Fort");
    await user.click(within(jazz).getByRole("radio", { name: "Only me" }));
    await waitFor(() => expect(at.patchWent.bodies).toEqual([{ visibility: "only_me" }]));
    expect(at.patchWent.urls[0]).toContain(`/me/went/${EVENT_ID}`);
    expect(at.patchEntry.count).toBe(0);
  });

  it("goes back and says so when the change does not go through", async () => {
    const user = userEvent.setup();
    meRoutes({ list: page([trip()]), patchEntry: 503 });
    renderWithQuery(<MeSection />);
    const dive = await card("Try-dive at Nemo Reef");
    await user.click(within(dive).getByRole("radio", { name: "Only me" }));
    expect(
      await within(dive).findByText("We could not change that just now. Try again."),
    ).toBeInTheDocument();
    expect(within(dive).getByRole("radio", { name: "Friends" })).toBeChecked();
  });
});

describe("the photo (case 7)", () => {
  it("shows the art and reads the list again when the photo link has run out", async () => {
    const at = meRoutes({ list: page([trip({ photoUrl: PHOTO })]) });
    renderWithQuery(<MeSection />);
    const dive = await card("Try-dive at Nemo Reef");
    const photo = within(dive).getByTestId("life-photo");
    expect(photo).toHaveAttribute("src", PHOTO);
    expect(photo).toHaveAttribute("alt", "");
    const before = at.list.count;
    fireEvent.error(photo);
    expect(within(dive).getByTestId("life-art")).toBeInTheDocument();
    await waitFor(() => expect(at.list.count).toBeGreaterThan(before));
  });

  it("shows the department's art when there is no photo", async () => {
    meRoutes({ list: page([trip()]) });
    renderWithQuery(<MeSection />);
    const dive = await card("Try-dive at Nemo Reef");
    expect(within(dive).queryByTestId("life-photo")).toBeNull();
    expect(within(dive).getByTestId("life-art")).toBeInTheDocument();
  });
});

describe("Did you go? (case 8)", () => {
  const asked = {
    didYouGo: [{ eventId: ASKED_EVENT, title: "Open mic night", startsAt: "2026-10-30T13:30:00Z" }],
  };

  it("answers Yes on the went route and the question goes", async () => {
    const user = userEvent.setup();
    const at = meRoutes({ list: page([trip()], asked) });
    renderWithQuery(<MeSection />);
    expect(await screen.findByText("Did you go to Open mic night?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes, I went to Open mic night" }));
    await waitFor(() =>
      expect(screen.queryByText("Did you go to Open mic night?")).toBeNull(),
    );
    await waitFor(() =>
      expect(at.answer.bodies).toEqual([{ went: true, via: "trips_card" }]),
    );
    expect(at.answer.urls[0]).toContain(`/me/went/${ASKED_EVENT}`);
  });

  it("sends No the same way", async () => {
    const user = userEvent.setup();
    const at = meRoutes({ list: page([trip()], asked) });
    renderWithQuery(<MeSection />);
    await user.click(
      await screen.findByRole("button", { name: "No, I did not go to Open mic night" }),
    );
    await waitFor(() =>
      expect(at.answer.bodies).toEqual([{ went: false, via: "trips_card" }]),
    );
  });

  it("brings the question back with a line when the answer is refused", async () => {
    const user = userEvent.setup();
    meRoutes({ list: page([trip()], asked), answer: 409 });
    renderWithQuery(<MeSection />);
    await user.click(
      await screen.findByRole("button", { name: "Yes, I went to Open mic night" }),
    );
    expect(
      await screen.findByText("We could not change that just now. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByText("Did you go to Open mic night?")).toBeInTheDocument();
  });
});

describe("the Bucket list tab (case 10)", () => {
  it("is the saved list, each row opening its listing", async () => {
    const user = userEvent.setup();
    const saved = EXPERIENCES[0]!;
    __seedSavedMock(TOKEN, [saved.id]);
    meRoutes({ list: page([trip()]) });
    renderWithQuery(<MeSection />);
    const tabs = await screen.findByRole("tablist", { name: "Done or bucket list" });
    await user.click(within(tabs).getByRole("tab", { name: "Bucket list" }));
    expect(within(tabs).getByRole("tab", { name: "Bucket list" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const panel = screen.getByRole("tabpanel");
    expect(
      await within(panel).findByRole("link", { name: new RegExp(saved.title) }),
    ).toHaveAttribute("href", `/e/${saved.slug}`);
  });

  it("says how to fill it when nothing is saved", async () => {
    const user = userEvent.setup();
    meRoutes({ list: page([trip()]) });
    renderWithQuery(<MeSection />);
    await user.click(await screen.findByRole("tab", { name: "Bucket list" }));
    expect(
      await screen.findByText("Your bucket list is everything you save. Tap the bookmark on any card."),
    ).toBeInTheDocument();
  });

  it("moves between the tabs with the arrow keys", async () => {
    const user = userEvent.setup();
    meRoutes({ list: page([trip()]) });
    renderWithQuery(<MeSection />);
    const done = await screen.findByRole("tab", { name: "Done" });
    done.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Bucket list" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Bucket list" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("when a read fails or Me is closed (cases 11, 15)", () => {
  it("says so once and still draws the badges", async () => {
    meRoutes({ list: 500 });
    renderWithQuery(<MeSection />);
    expect(
      await screen.findByText(
        "We couldn't load your life list just now. Everything else here still works.",
        undefined,
        // The transport's own backoff on a failed read runs first.
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Badges" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("draws nothing when the API says Me is not open to them (404)", async () => {
    const at = meRoutes({ list: 404, badges: 404 });
    const { container } = renderWithQuery(<MeSection />);
    await waitFor(() => expect(at.list.count).toBeGreaterThan(0));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks nothing while the me release is off", async () => {
    releases({});
    const at = meRoutes({ badges: { earned: [badge()], inProgress: [] } });
    renderWithQuery(
      <>
        <ReleaseProbe />
        <div data-testid="me">
          <MeCounts />
          <MeSection />
        </div>
      </>,
    );
    // The config has answered, and Me is off.
    await waitFor(() =>
      expect(screen.getByTestId("release")).toHaveTextContent("off shut"),
    );
    expect(screen.getByTestId("me")).toBeEmptyDOMElement();
    expect(at.list.count + at.badges.count).toBe(0);
  });
});
