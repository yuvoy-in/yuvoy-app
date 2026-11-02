import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { CLUB_WORDS, PEOPLE_CLOSED_WORDS } from "@/lib/groups/club-words";
import { GroupsScreen } from "./groups-screen";
import { NOT_FOUND_WORDS } from "./form-parts";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import {
  CLUB_MESSAGES as M,
  CLUB_PLACES,
  HAVELOCK_CLUBS,
} from "../../../mocks/club-fixtures";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/** `GET /app-config` with People at `stage`: what reading the release again after a 404 finds. */
function people(stage: "all" | "off") {
  server.use(
    http.get(`${BASE}/app-config`, () =>
      HttpResponse.json({ releases: { people: stage } }),
    ),
  );
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/groups",
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * The groups directory (yuvoy-mobile#386). With no scenario the release is
 * off and the club mocks answer 404, so each case that needs a list answers
 * `GET /clubs` or `GET /me/clubs` itself, from the fixtures.
 */

const HAVELOCK = "Havelock (Swaraj Dweep)";
const NEIL = "Neil (Shaheed Dweep)";

/** A place's groups, as the API lists them. */
function listOf(key: string | null) {
  return { clubs: HAVELOCK_CLUBS.filter((c) => c.destinationKey === key) };
}

/** `GET {path}` answering each place from the fixtures; keeps each place asked. */
function lists(path: "/clubs" | "/me/clubs") {
  const asked: (string | null)[] = [];
  server.use(
    http.get(`${BASE}${path}`, ({ request }) => {
      const key = new URL(request.url).searchParams.get("destinationKey");
      asked.push(key);
      return HttpResponse.json(listOf(key));
    }),
  );
  return asked;
}

function draw(remembered: string | null = null, place: string | null = null) {
  return renderWithQuery(
    <GroupsScreen place={place} remembered={remembered} />,
  );
}

afterEach(() => {
  server.events.removeAllListeners();
  cleanup();
});

describe("the groups directory", () => {
  it("lists a place's groups, signed out, from the public read", async () => {
    const asked = lists("/clubs");
    draw();

    expect(
      await screen.findByText("Havelock Reef Runners"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: CLUB_WORDS.entry }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: HAVELOCK })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText(CLUB_WORDS.intro(HAVELOCK))).toBeInTheDocument();
    const list = screen.getByText("Havelock Reef Runners").closest("ul")!;
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(
      screen.getByText("Havelock Reef Runners").closest("a"),
    ).toHaveAttribute("href", "/groups/havelock-reef-runners");
    expect(screen.getAllByText(CLUB_WORDS.onYuvoy)).toHaveLength(2);
    expect(screen.getAllByText(CLUB_WORDS.notOnYuvoy)).toHaveLength(3);
    expect(screen.getByText(CLUB_WORDS.footer)).toBeInTheDocument();
    // Follow comes with yuvoy-mobile#392.
    expect(screen.queryByRole("button", { name: /follow/i })).toBeNull();
    expect(asked).toEqual([CLUB_PLACES.havelock]);
  });

  it("reads the session's list when signed in, and not the public one", async () => {
    const mine = lists("/me/clubs");
    const open = lists("/clubs");
    __signInAppRouteMock();
    draw();

    expect(await screen.findByText("Havelock Trek Group")).toBeInTheDocument();
    expect(mine).toEqual([CLUB_PLACES.havelock]);
    expect(open).toEqual([]);
  });

  it("opens on the place the feed remembered", async () => {
    const asked = lists("/clubs");
    draw(CLUB_PLACES.empty);

    expect(await screen.findByText(CLUB_WORDS.empty(NEIL))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: NEIL })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(asked).toEqual([CLUB_PLACES.empty]);
  });

  it("says a place has no groups, without the footer", async () => {
    lists("/clubs");
    const user = userEvent.setup();
    draw();

    await screen.findByText("Havelock Reef Runners");
    await user.click(screen.getByRole("button", { name: NEIL }));

    expect(await screen.findByText(CLUB_WORDS.empty(NEIL))).toBeInTheDocument();
    expect(screen.queryByText(CLUB_WORDS.footer)).toBeNull();
    expect(screen.queryByText("Havelock Reef Runners")).toBeNull();
  });

  it("shows an error with a retry, never the empty line, and reads again on Try again", async () => {
    // The client retries a GET on 503 up to three times, so the list stays
    // down until the test lets it up, right before Try again.
    let failing = true;
    let calls = 0;
    server.use(
      http.get(`${BASE}/clubs`, ({ request }) => {
        calls += 1;
        if (failing) {
          return HttpResponse.json(
            {
              error: {
                code: "internal_error",
                message: M.unavailable,
                requestId: "01JTEST",
              },
            },
            { status: 503 },
          );
        }
        const key = new URL(request.url).searchParams.get("destinationKey");
        return HttpResponse.json(listOf(key));
      }),
    );
    const user = userEvent.setup();
    draw();

    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByText(CLUB_WORDS.empty(HAVELOCK))).toBeNull();
    expect(screen.queryByText(CLUB_WORDS.footer)).toBeNull();

    const failed = calls;
    failing = false;
    await user.click(retry);
    expect(
      await screen.findByText("Havelock Reef Runners"),
    ).toBeInTheDocument();
    expect(calls).toBe(failed + 1);
  });

  it("is People closed on a 404 when the release, read again, is closed", async () => {
    // No scenario: the club mocks answer 404 for every place.
    people("off");
    draw();

    expect(
      await screen.findByText(PEOPLE_CLOSED_WORDS.title),
    ).toBeInTheDocument();
    expect(screen.queryByText(NOT_FOUND_WORDS.title)).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByText(CLUB_WORDS.empty(HAVELOCK))).toBeNull();
  });

  it("is the not-found screen on a 404 with People still open", async () => {
    people("all");
    server.use(
      http.get(`${BASE}/clubs`, () =>
        HttpResponse.json(
          {
            error: {
              code: "not_found",
              message: M.notFound,
              requestId: "01JTEST",
            },
          },
          { status: 404 },
        ),
      ),
    );
    draw();

    expect(await screen.findByText(NOT_FOUND_WORDS.title)).toBeInTheDocument();
    expect(screen.queryByText(PEOPLE_CLOSED_WORDS.title)).toBeNull();
    expect(screen.queryByText(CLUB_WORDS.empty(HAVELOCK))).toBeNull();
  });

  it("reads each place once per pick", async () => {
    const asked = lists("/clubs");
    const user = userEvent.setup();
    draw();

    await screen.findByText("Havelock Reef Runners");
    await user.click(screen.getByRole("button", { name: HAVELOCK }));
    await user.click(screen.getByRole("button", { name: NEIL }));
    await screen.findByText(CLUB_WORDS.empty(NEIL));

    await waitFor(() =>
      expect(asked).toEqual([CLUB_PLACES.havelock, CLUB_PLACES.empty]),
    );
  });
});
