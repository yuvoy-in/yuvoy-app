import { beforeEach, describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { CREWS_WORDS as W, notFriendsLine } from "@/lib/people/crews-words";
import { PEOPLE_WORDS } from "@/lib/people/people-words";
import { CrewEditorScreen } from "./crew-editor";
import {
  answer,
  crew,
  crews,
  friend,
  home,
  json,
  member,
  refuse,
  signedIn,
} from "./people-test-kit";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn() }),
  usePathname: () => "/people/crews/new",
}));

const KIRAN = member(11, "Kiran");
const ANJALI = member(12, "Anjali");
const GANG = crew(1, "College gang", [KIRAN, ANJALI]);
const FRIENDS = [
  friend(11, "Kiran Kumar"),
  friend(12, "Anjali Rao"),
  friend(13, "Rahul Shah"),
];
const RAHUL_ID = FRIENDS[2].personId;

/** Signed in, with these crews and friends, on the editor. */
function open(crewId?: string, list = [GANG]) {
  signedIn();
  crews(...list);
  answer("get", "/me/friends", json({ friends: FRIENDS, nextCursor: null }));
  const user = userEvent.setup();
  renderWithQuery(<CrewEditorScreen crewId={crewId} />);
  return user;
}

const nameBox = () => screen.getByLabelText(W.nameLabel);
const pick = (name: RegExp) => screen.getByRole("checkbox", { name });
const save = () => screen.getByRole("button", { name: W.save });

async function ready(title: string) {
  await screen.findByRole("heading", { level: 1, name: title });
  await screen.findByRole("checkbox", { name: /Rahul/ });
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.push.mockReset();
});

describe("/people/crews/new", () => {
  it("asks for a name and a friend before sending anything", async () => {
    const sent = answer("post", "/me/crews", json(GANG, 201));
    const user = open();
    await ready(W.newTitle);
    await user.click(save());
    expect(await screen.findByText(W.nameBlank)).toBeInTheDocument();
    expect(screen.getByText(W.pickOne)).toHaveAttribute("role", "alert");
    expect(sent).toHaveLength(0);
  });

  it("holds a name to 40 characters", async () => {
    const sent = answer("post", "/me/crews", json(GANG, 201));
    const user = open();
    await ready(W.newTitle);
    await user.type(nameBox(), "x".repeat(41));
    await user.click(pick(/Rahul/));
    await user.click(save());
    expect(await screen.findByText(W.nameLong)).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("lists every friend and counts the picks", async () => {
    const user = open();
    await ready(W.newTitle);
    expect(screen.getAllByTestId("crew-pick")).toHaveLength(3);
    expect(screen.getByText(W.picked(0))).toBeInTheDocument();
    await user.click(pick(/Kiran/));
    await user.click(pick(/Rahul/));
    expect(screen.getByText(W.picked(2))).toBeInTheDocument();
  });

  it("makes the crew with the name trimmed, then opens it", async () => {
    const made = crew(5, "Office lunch", [member(13, "Rahul")]);
    const sent = answer("post", "/me/crews", json(made, 201));
    const user = open();
    await ready(W.newTitle);
    await user.type(nameBox(), "  Office lunch ");
    await user.click(pick(/Rahul/));
    await user.click(save());
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith(
        `/people/crews/${made.crewId}?saved=1`,
      ),
    );
    expect(sent[0].body).toEqual({
      name: "Office lunch",
      memberIds: [RAHUL_ID],
    });
  });

  it("sends one crew when Save is pressed again after it saved", async () => {
    const made = crew(5, "Office lunch", [member(13, "Rahul")]);
    const sent = answer("post", "/me/crews", json(made, 201));
    const user = open();
    await ready(W.newTitle);
    await user.type(nameBox(), "Office lunch");
    await user.click(pick(/Rahul/));
    await user.click(save());
    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1));
    await user.click(save());
    expect(sent).toHaveLength(1);
  });

  it("says there can be no more on crew_limit_reached", async () => {
    answer("post", "/me/crews", () =>
      refuse(409, "crew_limit_reached", "You have 20 crews."),
    );
    const user = open();
    await ready(W.newTitle);
    await user.type(nameBox(), "Office lunch");
    await user.click(pick(/Rahul/));
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent(W.limit);
  });

  it("does not offer the form at 20 crews", async () => {
    open(
      undefined,
      Array.from({ length: 20 }, (_, i) => crew(i + 1, `Crew ${i}`)),
    );
    await screen.findByRole("heading", { level: 1, name: W.newTitle });
    expect(screen.getByText(W.limit)).toBeInTheDocument();
    expect(screen.queryByLabelText(W.nameLabel)).toBeNull();
    // The header's back button has the same name, and goes to the same place.
    const back = screen.getAllByRole("link", { name: W.gone.action });
    expect(back).toHaveLength(2);
    for (const link of back) expect(link).toHaveAttribute("href", "/people");
  });

  it("opens the age step on adult_confirmation_required", async () => {
    answer("post", "/me/crews", () =>
      refuse(403, "adult_confirmation_required", "Confirm your age first."),
    );
    const user = open();
    await ready(W.newTitle);
    await user.type(nameBox(), "Office lunch");
    await user.click(pick(/Rahul/));
    await user.click(save());
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: PEOPLE_WORDS.age.title,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Confirm your age first.")).toBeNull();
  });

  it("shows people_paused in the API's words and keeps the form", async () => {
    answer("post", "/me/crews", () =>
      refuse(403, "people_paused", "People is paused for you until Friday."),
    );
    const user = open();
    await ready(W.newTitle);
    await user.type(nameBox(), "Office lunch");
    await user.click(pick(/Rahul/));
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "People is paused for you until Friday.",
    );
    expect(nameBox()).toHaveValue("Office lunch");
    expect(pick(/Rahul/)).toBeChecked();
  });

  it("keeps what was typed when the connection drops", async () => {
    answer("post", "/me/crews", () => HttpResponse.error());
    const user = open();
    await ready(W.newTitle);
    await user.type(nameBox(), "Office lunch");
    await user.click(pick(/Rahul/));
    await user.click(save());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(nameBox()).toHaveValue("Office lunch");
    expect(pick(/Rahul/)).toBeChecked();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("says People is closed when a new crew and the release both answer 404", async () => {
    answer("post", "/me/crews", () => refuse(404, "not_found", "Not found."));
    const user = open();
    await ready(W.newTitle);
    const release = answer("get", "/me/people", () =>
      refuse(404, "not_found", "Not found."),
    );
    await user.type(nameBox(), "Office lunch");
    await user.click(pick(/Rahul/));
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      W.closedNotSaved,
    );
    expect(release.length).toBeGreaterThan(0);
    expect(screen.queryByText("Not found.")).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("says a new crew was not saved on a 404 the release does not explain", async () => {
    answer("post", "/me/crews", () => refuse(404, "not_found", "Not found."));
    const user = open();
    await ready(W.newTitle);
    answer("get", "/me/people", json(home()));
    await user.type(nameBox(), "Office lunch");
    await user.click(pick(/Rahul/));
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent(W.notSaved);
    expect(screen.queryByText("Not found.")).toBeNull();
    expect(screen.queryByText(W.closedNotSaved)).toBeNull();
    // Only the list read may say People is open and the list did not load.
    expect(screen.queryByText(W.notLoaded)).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe("/people/crews/{crewId}/edit", () => {
  it("starts from the crew, its members first and ticked", async () => {
    open(GANG.crewId);
    await ready(W.editTitle);
    expect(nameBox()).toHaveValue("College gang");
    const rows = screen.getAllByTestId("crew-pick");
    expect(rows.map((r) => r.textContent)).toEqual([
      "KKiran",
      "AAnjali",
      "RRahul Shah",
    ]);
    expect(pick(/Kiran/)).toBeChecked();
    expect(pick(/Anjali/)).toBeChecked();
    expect(pick(/Rahul/)).not.toBeChecked();
  });

  it("sends only the members when only they changed", async () => {
    const sent = answer(
      "patch",
      `/me/crews/${GANG.crewId}`,
      json({ ...GANG, members: [KIRAN] }),
    );
    const user = open(GANG.crewId);
    await ready(W.editTitle);
    await user.click(pick(/Anjali/));
    await user.click(save());
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith(
        `/people/crews/${GANG.crewId}?saved=1`,
      ),
    );
    expect(sent[0].body).toEqual({ memberIds: [KIRAN.personId] });
  });

  it("sends only the name when only it changed", async () => {
    const sent = answer(
      "patch",
      `/me/crews/${GANG.crewId}`,
      json({ ...GANG, name: "Hostel gang" }),
    );
    const user = open(GANG.crewId);
    await ready(W.editTitle);
    await user.clear(nameBox());
    await user.type(nameBox(), "Hostel gang");
    await user.click(save());
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body).toEqual({ name: "Hostel gang" });
  });

  it("renames a crew with nobody in it, sending only the name", async () => {
    const empty = crew(3, "Old flatmates", []);
    const sent = answer(
      "patch",
      `/me/crews/${empty.crewId}`,
      json({ ...empty, name: "New flatmates" }),
    );
    const user = open(empty.crewId, [empty]);
    await ready(W.editTitle);
    await user.clear(nameBox());
    await user.type(nameBox(), "New flatmates");
    await user.click(save());
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body).toEqual({ name: "New flatmates" });
    expect(screen.queryByText(W.pickOne)).toBeNull();
  });

  it("sends nothing when nothing changed", async () => {
    const sent = answer("patch", `/me/crews/${GANG.crewId}`, json(GANG));
    const user = open(GANG.crewId);
    await ready(W.editTitle);
    await user.click(save());
    expect(nav.replace).toHaveBeenCalledWith(`/people/crews/${GANG.crewId}`);
    expect(sent).toHaveLength(0);
  });

  it("names who is not a friend now, takes them out, and saves again", async () => {
    const sent = answer(
      "patch",
      `/me/crews/${GANG.crewId}`,
      () =>
        HttpResponse.json(
          {
            error: {
              code: "not_friends",
              message: "Some of these people are not your friends.",
              details: { personIds: [ANJALI.personId.toUpperCase()] },
            },
          },
          { status: 409 },
        ),
      json({ ...GANG, name: "Hostel gang", members: [KIRAN] }),
    );
    const user = open(GANG.crewId);
    await ready(W.editTitle);
    await user.clear(nameBox());
    await user.type(nameBox(), "Hostel gang");
    await user.click(save());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      notFriendsLine(["Anjali"]),
    );
    expect(pick(/Anjali/)).toHaveAccessibleName(/Not your friend now/);
    await user.click(screen.getByRole("button", { name: W.takeOut }));
    expect(pick(/Anjali/)).not.toBeChecked();
    expect(pick(/Anjali/)).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(W.takenOut);
    expect(nameBox()).toHaveValue("Hostel gang");

    await user.click(save());
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1].body).toEqual({
      name: "Hostel gang",
      memberIds: [KIRAN.personId],
    });
  });

  it("shows a refused change in the API's words and keeps the form", async () => {
    answer("patch", `/me/crews/${GANG.crewId}`, () =>
      refuse(403, "people_paused", "People is paused on your account."),
    );
    const user = open(GANG.crewId);
    await ready(W.editTitle);
    await user.click(pick(/Rahul/));
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "People is paused on your account.",
    );
    expect(nameBox()).toHaveValue(GANG.name);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("still says so on not_friends when the API names nobody picked", async () => {
    answer("patch", `/me/crews/${GANG.crewId}`, () =>
      HttpResponse.json(
        {
          error: {
            code: "not_friends",
            message: "Some of these people are not your friends.",
          },
        },
        { status: 409 },
      ),
    );
    const user = open(GANG.crewId);
    await ready(W.editTitle);
    await user.click(pick(/Rahul/));
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      notFriendsLine([]),
    );
    expect(screen.queryByRole("button", { name: W.takeOut })).toBeNull();
  });

  it("says the crew is gone when a change answers 404 and the list has it no more", async () => {
    answer("patch", `/me/crews/${GANG.crewId}`, () =>
      refuse(404, "not_found", "Not found."),
    );
    const user = open(GANG.crewId);
    await ready(W.editTitle);
    answer("get", "/me/people", json(home()));
    answer("get", "/me/crews", json({ crews: [] }));
    await user.click(pick(/Rahul/));
    await user.click(save());
    expect(
      await screen.findByRole("heading", { level: 1, name: W.gone.title }),
    ).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("says People is closed when a change and the release both answer 404", async () => {
    answer("patch", `/me/crews/${GANG.crewId}`, () =>
      refuse(404, "not_found", "Not found."),
    );
    const user = open(GANG.crewId);
    await ready(W.editTitle);
    const release = answer("get", "/me/people", () =>
      refuse(404, "not_found", "Not found."),
    );
    await user.click(pick(/Rahul/));
    await user.click(save());
    expect(
      await screen.findAllByText(
        new RegExp(`${W.closedNotSaved}|${PEOPLE_WORDS.closed.title}`),
      ),
    ).not.toHaveLength(0);
    expect(release.length).toBeGreaterThan(0);
    expect(screen.queryByText("Not found.")).toBeNull();
    expect(screen.queryByRole("heading", { name: W.gone.title })).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("says the change was not saved when the release cannot be read", async () => {
    answer("patch", `/me/crews/${GANG.crewId}`, () =>
      refuse(404, "not_found", "Not found."),
    );
    const user = open(GANG.crewId);
    await ready(W.editTitle);
    answer("get", "/me/people", () =>
      refuse(500, "internal_error", "Something went wrong at our end."),
    );
    await user.click(pick(/Rahul/));
    await user.click(save());
    expect(
      await screen.findByRole("alert", {}, { timeout: 4000 }),
    ).toHaveTextContent(W.notSaved);
    expect(screen.queryByText("Not found.")).toBeNull();
    expect(screen.queryByRole("heading", { name: W.gone.title })).toBeNull();
  });

  it("never calls a crew gone on a 404 alone, while the list still has it", async () => {
    answer("patch", `/me/crews/${GANG.crewId}`, () =>
      refuse(404, "not_found", "Not found."),
    );
    const user = open(GANG.crewId);
    await ready(W.editTitle);
    answer("get", "/me/people", json(home()));
    await user.click(pick(/Rahul/));
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent(W.notSaved);
    expect(screen.queryByText("Not found.")).toBeNull();
    expect(screen.queryByRole("heading", { name: W.gone.title })).toBeNull();
  });

  it("says the crew is gone when it is not in the list", async () => {
    open(GANG.crewId, []);
    expect(
      await screen.findByRole("heading", { level: 1, name: W.gone.title }),
    ).toBeInTheDocument();
  });
});
