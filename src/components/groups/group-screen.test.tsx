import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import {
  CLAIM_WORDS,
  CLUB_WORDS,
  PEOPLE_CLOSED_WORDS,
} from "@/lib/groups/club-words";
import { GroupScreen } from "./group-screen";
import { NOT_FOUND_WORDS } from "./form-parts";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import {
  CLUB_MESSAGES as M,
  CLUB_SLUGS,
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

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/groups/havelock-reef-runners",
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * One group's page (yuvoy-mobile#386). With no scenario the release is off
 * and the club mocks answer 404, so each case answers the group read itself,
 * from the fixtures.
 */

function refusal(status: number, code: string, message: string) {
  return HttpResponse.json(
    { error: { code, message, requestId: "01JTEST" } },
    { status },
  );
}

/** `GET {path}/{slug}` from the fixtures, less the groups in `hidden`; counts reads. */
function groups(path: "/clubs" | "/me/clubs", hidden = new Set<string>()) {
  const reads = { count: 0 };
  server.use(
    http.get(`${BASE}${path}/:slug`, ({ params }) => {
      reads.count += 1;
      const club = HAVELOCK_CLUBS.find(
        (c) => c.slug === params.slug && !hidden.has(c.clubId),
      );
      return club
        ? HttpResponse.json(club)
        : refusal(404, "not_found", M.notFound);
    }),
  );
  return reads;
}

function draw(slug: string = CLUB_SLUGS.reefRunners) {
  return renderWithQuery(<GroupScreen slug={slug} />);
}

afterEach(() => {
  router.replace.mockClear();
  server.events.removeAllListeners();
  cleanup();
});

describe("a group's page", () => {
  it("shows the group, its own page, and the three actions, signed out", async () => {
    groups("/clubs");
    draw();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Havelock Reef Runners",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Running club")).toBeInTheDocument();
    expect(screen.getByText("Sundays, 6 am")).toBeInTheDocument();
    expect(screen.getByText("Govind Nagar")).toBeInTheDocument();
    expect(screen.getByText(CLUB_WORDS.notOnYuvoy)).toBeInTheDocument();

    const source = screen.getByRole("link", {
      name: CLUB_WORDS.from("Havelock Reef Runners"),
    });
    expect(source).toHaveAttribute("href", "https://reef-runners.example/");
    expect(source).toHaveAttribute("target", "_blank");
    expect(source).toHaveAttribute("rel", "noopener noreferrer");

    // Claim and report need a sign-in, and come back here after it.
    expect(screen.getByRole("link", { name: CLUB_WORDS.claim })).toHaveAttribute(
      "href",
      "/account?next=/groups/havelock-reef-runners",
    );
    expect(
      screen.getByRole("link", { name: CLUB_WORDS.report }),
    ).toHaveAttribute("href", "/account?next=/groups/havelock-reef-runners");
    // Removal works for anyone.
    expect(
      screen.getByRole("button", { name: CLUB_WORDS.remove }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /follow/i })).toBeNull();
  });

  it("offers no claim for a group already on Yuvoy", async () => {
    groups("/clubs");
    draw(CLUB_SLUGS.onYuvoy);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Havelock Book Club" }),
    ).toBeInTheDocument();
    expect(screen.getByText(CLUB_WORDS.onYuvoy)).toBeInTheDocument();
    expect(screen.queryByText(CLUB_WORDS.claim)).toBeNull();
  });

  it("reads the session's group when signed in, and opens the claim form", async () => {
    const mine = groups("/me/clubs");
    const open = groups("/clubs");
    __signInAppRouteMock();
    const user = userEvent.setup();
    draw();

    await user.click(
      await screen.findByRole("button", { name: CLUB_WORDS.claim }),
    );
    expect(
      await screen.findByText(CLAIM_WORDS.title("Havelock Reef Runners")),
    ).toBeInTheDocument();
    expect(mine.count).toBe(1);
    expect(open.count).toBe(0);
  });

  it("is the not-found screen for a group not shown, with People open", async () => {
    people("all");
    groups("/clubs");
    draw("havelock-no-such-group");

    expect(
      await screen.findByText(NOT_FOUND_WORDS.title),
    ).toBeInTheDocument();
    expect(screen.queryByText(PEOPLE_CLOSED_WORDS.title)).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("is People closed on a 404 when the release, read again, is closed", async () => {
    people("off");
    groups("/clubs");
    draw("havelock-no-such-group");

    expect(
      await screen.findByText(PEOPLE_CLOSED_WORDS.title),
    ).toBeInTheDocument();
    expect(screen.queryByText(NOT_FOUND_WORDS.title)).toBeNull();
  });

  it("shows an error with a retry, and reads again on Try again", async () => {
    // The client retries a GET on 503 up to three times, so the group stays
    // down until the test lets it up, right before Try again.
    let failing = true;
    let calls = 0;
    server.use(
      http.get(`${BASE}/clubs/:slug`, () => {
        calls += 1;
        return failing
          ? refusal(503, "internal_error", M.unavailable)
          : HttpResponse.json(HAVELOCK_CLUBS[2]);
      }),
    );
    const user = userEvent.setup();
    draw();

    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByText(NOT_FOUND_WORDS.title)).toBeNull();

    const failed = calls;
    failing = false;
    await user.click(retry);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Havelock Reef Runners",
      }),
    ).toBeInTheDocument();
    expect(calls).toBe(failed + 1);
  });

  it("keeps a removal's message up after the group is hidden, and Done opens its place", async () => {
    const hidden = new Set<string>();
    const reads = groups("/clubs", hidden);
    server.use(
      http.post(`${BASE}/clubs/:clubId/removal-requests`, ({ params }) => {
        hidden.add(String(params.clubId));
        return HttpResponse.json(
          { removed: true, message: M.removedNow },
          { status: 202 },
        );
      }),
    );
    const user = userEvent.setup();
    draw();

    await user.click(
      await screen.findByRole("button", { name: CLUB_WORDS.remove }),
    );
    await user.click(
      screen.getByRole("button", { name: "We run it and want it off Yuvoy" }),
    );
    await user.click(screen.getByRole("button", { name: "Remove the listing" }));

    expect(await screen.findByText(M.removedNow)).toBeInTheDocument();
    // The page is read again and now answers 404; the message stays.
    await waitFor(() => expect(reads.count).toBe(2));
    expect(screen.getByText(M.removedNow)).toBeInTheDocument();
    expect(screen.queryByText(NOT_FOUND_WORDS.title)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(router.replace).toHaveBeenCalledWith(
      "/groups?place=andaman%2Fhavelock",
    );
  });
});
