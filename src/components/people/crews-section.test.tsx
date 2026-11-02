import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { qk } from "@/lib/query/policy";
import { CREWS_WORDS as W } from "@/lib/people/crews-words";
import { PEOPLE_WORDS } from "@/lib/people/people-words";
import { CrewsSection } from "./crews-section";
import {
  answer,
  crew,
  crews,
  json,
  member,
  refuse,
  signedIn,
} from "./people-test-kit";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/people",
}));

const GANG = crew(1, "College gang", [
  member(11, "Kiran"),
  member(12, "Anjali"),
  member(13, "Rahul"),
  member(14, "Meera"),
]);
const LUNCH = crew(2, "Office lunch", [member(15, "Dev")]);

function show(friendCount: number) {
  signedIn();
  return renderWithQuery(<CrewsSection friendCount={friendCount} />);
}

/** Waits for the crews read to settle, for tests that expect nothing. */
async function settled(client: ReturnType<typeof show>["client"]) {
  await waitFor(() =>
    expect(client.getQueryState(qk.myCrews())?.fetchStatus).toBe("idle"),
  );
  await waitFor(() =>
    expect(client.getQueryState(qk.myCrews())?.status).not.toBe("pending"),
  );
}

describe("People: the Crews section", () => {
  it("lists each crew with who is in it, opening its page", async () => {
    crews(GANG, LUNCH);
    show(5);
    const region = await screen.findByRole("region", { name: W.head });
    const rows = await within(region).findAllByTestId("crew");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("College gang");
    expect(rows[0]).toHaveTextContent(
      "4 friends: Kiran, Anjali, Rahul and 1 more",
    );
    expect(rows[1]).toHaveTextContent("1 friend: Dev");
    expect(within(rows[0]).getByRole("link")).toHaveAttribute(
      "href",
      `/people/crews/${GANG.crewId}`,
    );
    expect(screen.getByRole("link", { name: W.newCrew })).toHaveAttribute(
      "href",
      "/people/crews/new",
    );
    expect(screen.getByText(W.foot)).toBeInTheDocument();
  });

  it("offers a first crew to somebody with friends and none yet", async () => {
    crews();
    show(2);
    expect(await screen.findByText(W.empty)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: W.newCrew })).toBeInTheDocument();
  });

  it("is not there for somebody with no friends and no crews", async () => {
    crews();
    const { client } = show(0);
    await settled(client);
    expect(screen.queryByRole("heading", { name: W.head })).toBeNull();
  });

  it("still lists crews when every friend in them has gone", async () => {
    crews(crew(3, "Old flat"));
    show(0);
    const row = await screen.findByTestId("crew");
    expect(row).toHaveTextContent("Old flat");
    expect(row).toHaveTextContent(W.nobody);
  });

  it("says why there is no New crew at 20 crews", async () => {
    crews(...Array.from({ length: 20 }, (_, i) => crew(i + 1, `Crew ${i}`)));
    show(5);
    expect(await screen.findByText(W.limit)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: W.newCrew })).toBeNull();
  });

  it("hides itself on a 404, People closed", async () => {
    answer("get", "/me/crews", () => refuse(404, "not_found", "Not found."));
    answer("get", "/me/people", () => refuse(404, "not_found", "Not found."));
    const { client } = show(3);
    await settled(client);
    expect(screen.queryByRole("heading", { name: W.head })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says the list did not load, and tries again", async () => {
    const seen = answer(
      "get",
      "/me/crews",
      () => refuse(500, "internal_error", "Server error."),
      json({ crews: [LUNCH] }),
    );
    show(3);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(W.failed);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: PEOPLE_WORDS.retry }));
    expect(await screen.findByTestId("crew")).toHaveTextContent("Office lunch");
    expect(seen).toHaveLength(2);
  });
});
