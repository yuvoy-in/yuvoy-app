import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { TRIGO_LISTS_WORDS as W } from "@/lib/trigo/lists-words";
import { TripDrafts } from "./trip-drafts";
import {
  noContent,
  refuse,
  serveDelete,
  serveDrafts,
  signedIn,
} from "@/components/trigo/lists-test-kit";
import {
  DRAFT_ID,
  defaultDrafts,
  manyDrafts,
} from "../../../mocks/trigo-list-fixtures";
import { DRAFT_GONE, LISTS_DOWN } from "../../../mocks/trigo-list-handlers";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/trips",
}));

afterEach(cleanup);

const show = () => renderWithQuery(<TripDrafts />);
const DELETE_FIRST = `${W.deleteDraft}: Havelock long weekend`;
const days = () => screen.getAllByRole("heading", { level: 3 });

/** The Drafts view on Trips (yuvoy-app#220; cases from yuvoy-mobile#390). */
describe("Drafts: the list", () => {
  it("shows the empty line with no drafts", async () => {
    signedIn();
    serveDrafts([]);
    show();
    expect(await screen.findByText(W.draftsEmpty)).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("shows a 3-day draft with its range, its days, and a gone event card", async () => {
    signedIn();
    serveDrafts(defaultDrafts().slice(0, 1));
    show();

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Havelock long weekend",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("14 Nov to 16 Nov")).toBeInTheDocument();
    // The third day has nothing on it, so it has no heading.
    expect(days().map((h) => h.textContent)).toEqual([
      "Sat, 14 Nov",
      "Sun, 15 Nov",
    ]);

    const gone = days()[1].closest("section")!;
    expect(within(gone).getByText("Sunset sail from Neil")).toBeInTheDocument();
    // The gone listing and the event whose title went, both with no link.
    expect(within(gone).getAllByText(W.noLonger)).toHaveLength(2);
    expect(within(gone).queryByRole("link")).toBeNull();

    const listed = days()[0].closest("section")!;
    expect(within(listed).getByRole("link")).toHaveAttribute(
      "href",
      "/e/try-dive-nemo-reef",
    );
    expect(
      screen.getByRole("button", { name: DELETE_FIRST }),
    ).toBeInTheDocument();
  });

  it("shows three day headings for a 14-date draft with cards on 3 days", async () => {
    signedIn();
    serveDrafts(manyDrafts());
    show();

    await screen.findByRole("heading", { level: 2 });
    expect(days().map((h) => h.textContent)).toEqual([
      "Tue, 1 Dec",
      "Mon, 7 Dec",
      "Mon, 14 Dec",
    ]);
    expect(screen.getByText("1 Dec to 14 Dec")).toBeInTheDocument();
    const long = days()[1].closest("section")!;
    expect(within(long).getAllByRole("link")).toHaveLength(12);
  });

  it("names a draft that has no title by what it is", async () => {
    signedIn();
    serveDrafts([{ ...defaultDrafts()[1], title: " " }]);
    show();
    expect(
      await screen.findByRole("heading", { level: 2, name: W.draftsTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText("20 Nov")).toBeInTheDocument();
  });
});

/** Deleting a draft (yuvoy-app#220). Only a 204 is done. */
describe("Drafts: delete", () => {
  it("takes the draft out on a 204, and reads the list again", async () => {
    signedIn();
    const read = serveDrafts(defaultDrafts(), defaultDrafts().slice(1));
    const remove = serveDelete(noContent);
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: DELETE_FIRST }),
    );

    await waitFor(() =>
      expect(screen.queryByText("Havelock long weekend")).toBeNull(),
    );
    expect(remove.ids).toEqual([DRAFT_ID]);
    await waitFor(() => expect(read.count).toBe(2));
    expect(screen.getByText("Neil day trip")).toBeInTheDocument();
  });

  it("shows the API's sentence on a 404, and reads the list again", async () => {
    signedIn();
    const read = serveDrafts(defaultDrafts(), defaultDrafts().slice(1));
    serveDelete(() => refuse(404, "not_found", DRAFT_GONE));
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: DELETE_FIRST }),
    );

    expect(await screen.findByText(DRAFT_GONE)).toBeInTheDocument();
    await waitFor(() => expect(read.count).toBe(2));
    expect(screen.queryByText("Havelock long weekend")).toBeNull();
    expect(screen.getByText("Neil day trip")).toBeInTheDocument();
  });

  it("keeps the draft and says so under it when the delete fails otherwise", async () => {
    signedIn();
    serveDrafts(defaultDrafts());
    serveDelete(() => refuse(500, "internal_error", "Something broke."));
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: DELETE_FIRST }),
    );

    const failed = await screen.findByRole("alert");
    expect(failed).toHaveTextContent(W.deleteFailed);
    expect(
      within(failed).getByRole("button", { name: W.tryAgain }),
    ).toBeInTheDocument();
    expect(screen.getByText("Havelock long weekend")).toBeInTheDocument();
  });

  it("says the sign-in expired on a 401", async () => {
    signedIn();
    serveDrafts(defaultDrafts());
    serveDelete(() => refuse(401, "unauthorized", "Sign in again."));
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: DELETE_FIRST }),
    );
    expect(await screen.findByText(W.draftsExpired.title)).toBeInTheDocument();
  });
});

/** A list that did not load (yuvoy-app#220). */
describe("Drafts: a list that did not load", () => {
  it("shows the error state on a 503, not the empty line", async () => {
    signedIn();
    /*
      Down until Try again. The client asks a 503 again twice before it is an
      answer, with a backoff of up to about a second in all, so the list stays
      down for every one of those and the wait here is longer.
    */
    let down = true;
    const read = serveDrafts(() =>
      down
        ? refuse(503, "unavailable", LISTS_DOWN)
        : HttpResponse.json({ drafts: [] }),
    );
    show();

    const failed = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(failed).toHaveTextContent(W.draftsFailed);
    expect(failed).toHaveTextContent(LISTS_DOWN);
    expect(screen.queryByText(W.draftsEmpty)).toBeNull();

    down = false;
    const before = read.count;
    await userEvent.click(
      within(failed).getByRole("button", { name: W.tryAgain }),
    );
    expect(await screen.findByText(W.draftsEmpty)).toBeInTheDocument();
    expect(read.count).toBe(before + 1);
  });

  it("says the sign-in expired on a 401, with the way back in", async () => {
    signedIn();
    serveDrafts(() => refuse(401, "unauthorized", "Sign in again."));
    show();

    const expired = await screen.findByRole("alert");
    expect(expired).toHaveTextContent(W.draftsExpired.title);
    expect(
      within(expired).getByRole("link", { name: W.draftsExpired.action }),
    ).toHaveAttribute("href", "/account");
    expect(screen.queryByText(W.draftsEmpty)).toBeNull();
  });

  it("shows the general error with Try again for anything else", async () => {
    signedIn();
    serveDrafts(() => refuse(500, "internal_error", "Something broke."));
    show();

    // A 500 is asked again too before it is an answer: the longer wait.
    const failed = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(failed).toHaveTextContent(W.draftsFailed);
    expect(
      within(failed).getByRole("button", { name: W.tryAgain }),
    ).toBeInTheDocument();
  });
});
