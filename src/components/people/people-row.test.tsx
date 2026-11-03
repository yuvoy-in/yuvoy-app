import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { useRelease } from "@/lib/site/use-release";
import { PEOPLE_WORDS as W } from "@/lib/people/people-words";
import { PeopleRow } from "./people-row";
import { account } from "./people-test-kit";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/account",
}));

/** Says when the release is known, so an absence is the row's decision. */
function ReleaseProbe() {
  const release = useRelease("people");
  return <p data-testid="release">{release.pending ? "pending" : "known"}</p>;
}

function show(
  stage: "off" | "all",
  people?: { standing: "ok"; requestsWaiting: number },
) {
  account({ stage, people: people ?? null });
  __signInAppRouteMock("sess_test");
  return renderWithQuery(
    <>
      <ReleaseProbe />
      <PeopleRow people={people} />
    </>,
  );
}

const known = () =>
  waitFor(() =>
    expect(screen.getByTestId("release")).toHaveTextContent("known"),
  );

describe("PeopleRow", () => {
  it("links to People, with a dot and a count for requests waiting", async () => {
    show("all", { standing: "ok", requestsWaiting: 2 });
    const row = await screen.findByRole("link", {
      name: `${W.row}, ${W.rowWaiting(2)}`,
    });
    expect(row).toHaveAttribute("href", "/people");
    expect(screen.getByTestId("people-dot")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("has no dot when nothing is waiting", async () => {
    show("all", { standing: "ok", requestsWaiting: 0 });
    expect(
      await screen.findByRole("link", { name: W.row }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("people-dot")).toBeNull();
  });

  it("is not drawn while the release is closed", async () => {
    show("off", { standing: "ok", requestsWaiting: 2 });
    await known();
    expect(screen.queryByRole("link", { name: new RegExp(W.row) })).toBeNull();
  });

  it("is not drawn when GET /me has no people", async () => {
    show("all");
    await known();
    expect(screen.queryByRole("link", { name: new RegExp(W.row) })).toBeNull();
  });
});
