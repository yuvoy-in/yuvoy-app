import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { FOLLOW_API_WORDS } from "@/lib/groups/follows";
import { useMyClubFollows } from "@/lib/groups/use-follows";
import { PEOPLE_SHUT_LINE } from "@/lib/people/people-stand-ins";
import { FollowButton } from "./follow-button";

/**
 * The Follow button (yuvoy-mobile#392, web half). It turns to Following only
 * once the API has taken the tap, each button keeps its own state, and a 404
 * is never success.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const A = {
  clubId: "6b1c2d3e-4f50-4a61-8b72-9c0d1e2f3a41",
  slug: "a",
  name: "Reef Walkers",
};
const B = {
  clubId: "6b1c2d3e-4f50-4a61-8b72-9c0d1e2f3a42",
  slug: "b",
  name: "Dawn Runners",
};

function follows(ids: string[]) {
  server.use(
    http.get(`${BASE}/me/club-follows`, () =>
      HttpResponse.json({
        clubIds: ids,
        clubs: [A, B].filter((c) => ids.includes(c.clubId)),
      }),
    ),
  );
}

/** The page's part: one read of the list, a button per group. */
function Page() {
  const list = useMyClubFollows(true);
  if (!list.data) return <p>reading</p>;
  return (
    <ul>
      {[A, B].map((club) => (
        <li key={club.clubId} data-testid={club.slug}>
          <FollowButton club={club} follows={list.data} />
        </li>
      ))}
    </ul>
  );
}

beforeEach(() => __signInAppRouteMock());

describe("the Follow button", () => {
  it("reads Following once the API takes the follow", async () => {
    follows([]);
    server.use(
      http.put(
        `${BASE}/me/club-follows/:clubId`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    renderWithQuery(<Page />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Follow Reef Walkers" }),
    );
    expect(
      await screen.findByRole("button", { name: "Following Reef Walkers" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps one group's refusal on that group's row only", async () => {
    follows([]);
    server.use(
      http.put(`${BASE}/me/club-follows/:clubId`, ({ params }) =>
        params.clubId === A.clubId
          ? HttpResponse.json(
              {
                error: {
                  code: "follow_limit_reached",
                  message: FOLLOW_API_WORDS.limit,
                },
              },
              { status: 409 },
            )
          : new HttpResponse(null, { status: 204 }),
      ),
    );
    renderWithQuery(<Page />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Follow Reef Walkers" }),
    );
    const rowA = screen.getByTestId("a");
    expect(await within(rowA).findByText(FOLLOW_API_WORDS.limit)).toBeTruthy();
    // The limit leaves the button on Follow.
    expect(
      within(rowA).getByRole("button", { name: "Follow Reef Walkers" }),
    ).toBeTruthy();
    const rowB = screen.getByTestId("b");
    expect(within(rowB).queryByRole("alert")).toBeNull();
    fireEvent.click(
      within(rowB).getByRole("button", { name: "Follow Dawn Runners" }),
    );
    expect(
      await within(rowB).findByRole("button", {
        name: "Following Dawn Runners",
      }),
    ).toBeTruthy();
    expect(within(rowB).queryByRole("alert")).toBeNull();
  });

  it("stays Following and says People closed when Stop following answers 404", async () => {
    follows([A.clubId]);
    server.use(
      http.delete(`${BASE}/me/club-follows/:clubId`, () =>
        HttpResponse.json(
          { error: { code: "not_found", message: "Not found." } },
          { status: 404 },
        ),
      ),
    );
    renderWithQuery(<Page />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Following Reef Walkers" }),
    );
    const rowA = screen.getByTestId("a");
    expect(await within(rowA).findByText(PEOPLE_SHUT_LINE)).toBeTruthy();
    expect(
      within(rowA).getByRole("button", { name: "Following Reef Walkers" }),
    ).toBeTruthy();
  });
});
