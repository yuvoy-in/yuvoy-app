import { beforeEach, describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { CREWS_WORDS as W } from "@/lib/people/crews-words";
import { PEOPLE_WORDS } from "@/lib/people/people-words";
import { CrewScreen } from "./crew-screen";
import {
  account,
  answer,
  crew,
  crews,
  home,
  json,
  member,
  noContent,
  refuse,
  signedIn,
} from "./people-test-kit";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn() }),
  usePathname: () => "/people/crews/x",
}));

const GANG = crew(1, "College gang", [
  member(11, "Kiran"),
  member(12, "Anjali"),
]);

const heading = (name: string) =>
  screen.findByRole("heading", { level: 1, name });

function show(saved = false) {
  const user = userEvent.setup();
  renderWithQuery(<CrewScreen crewId={GANG.crewId} saved={saved} />);
  return user;
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.push.mockReset();
});

describe("/people/crews/{crewId}", () => {
  it("shows the crew, who is in it and a way to change it", async () => {
    signedIn();
    crews(GANG);
    show();
    await heading("College gang");
    expect(screen.getByText("2 friends")).toBeInTheDocument();
    const members = screen.getAllByTestId("crew-member");
    expect(members.map((m) => m.textContent)).toEqual(["KKiran", "AAnjali"]);
    expect(screen.getByRole("link", { name: W.edit })).toHaveAttribute(
      "href",
      `/people/crews/${GANG.crewId}/edit`,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("finds the crew whatever the case of its id", async () => {
    signedIn();
    crews({ ...GANG, crewId: GANG.crewId.toUpperCase() });
    show();
    await heading("College gang");
  });

  it("says Crew saved when the editor sent it here", async () => {
    signedIn();
    crews(GANG);
    show(true);
    await heading("College gang");
    expect(screen.getByRole("status")).toHaveTextContent(W.saved);
  });

  it("says a crew that is not in the list is not there any more", async () => {
    signedIn();
    crews();
    show();
    await heading(W.gone.title);
    expect(screen.getByRole("link", { name: W.gone.action })).toHaveAttribute(
      "href",
      "/people",
    );
  });

  it("asks a signed-out reader to sign in and come back", async () => {
    account();
    show();
    await heading(PEOPLE_WORDS.signedOut.title);
    expect(
      screen.getByRole("link", { name: PEOPLE_WORDS.signedOut.action }),
    ).toHaveAttribute(
      "href",
      `/account?next=${encodeURIComponent(`/people/crews/${GANG.crewId}`)}`,
    );
  });

  it("says People is not open yet when the list and the release answer 404", async () => {
    signedIn();
    answer("get", "/me/crews", () => refuse(404, "not_found", "Not found."));
    const release = answer("get", "/me/people", () =>
      refuse(404, "not_found", "Not found."),
    );
    show();
    await heading(PEOPLE_WORDS.closed.title);
    expect(release.length).toBeGreaterThan(0);
  });

  it("says the list did not load on a 404 the release does not explain", async () => {
    signedIn();
    answer("get", "/me/crews", () => refuse(404, "not_found", "Not found."));
    answer("get", "/me/people", json(home()));
    show();
    await heading(W.failed);
    expect(screen.getByText(W.notLoaded)).toBeInTheDocument();
    expect(screen.queryByText(W.notChecked)).toBeNull();
    expect(screen.queryByText("Not found.")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: PEOPLE_WORDS.closed.title }),
    ).toBeNull();
  });

  it("never shows the API's 404 sentence when the release read after it fails", async () => {
    signedIn();
    answer("get", "/me/crews", () =>
      refuse(404, "not_found", "People isn't open to your account yet."),
    );
    answer("get", "/me/people", () =>
      refuse(503, "unavailable", "Try again in a minute."),
    );
    show();
    await heading(W.failed);
    expect(screen.getByText(W.notChecked)).toBeInTheDocument();
    expect(
      screen.queryByText("People isn't open to your account yet."),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: PEOPLE_WORDS.retry }),
    ).toBeInTheDocument();
  });

  it("drops the crew when a later list read answers 404 and the release read fails", async () => {
    signedIn();
    answer("get", "/me/crews", json({ crews: [GANG] }), () =>
      refuse(404, "not_found", "Not found."),
    );
    answer("get", "/me/people", () =>
      refuse(503, "unavailable", "Try again in a minute."),
    );
    answer("delete", `/me/crews/${GANG.crewId}`, () =>
      refuse(404, "not_found", "Not found."),
    );
    const user = show();
    await heading("College gang");
    await user.click(screen.getByRole("button", { name: W.delete }));
    await user.click(screen.getByRole("button", { name: W.delete }));
    await heading(W.failed);
    expect(screen.getByText(W.notChecked)).toBeInTheDocument();
    expect(screen.queryByText("College gang")).toBeNull();
    expect(screen.queryByRole("link", { name: W.edit })).toBeNull();
    expect(screen.queryByRole("button", { name: W.delete })).toBeNull();
    expect(screen.queryByText(W.deleted)).toBeNull();
    expect(screen.queryByText("Not found.")).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("drops Edit and Delete when People closes while the crew is open", async () => {
    signedIn();
    answer("get", "/me/crews", json({ crews: [GANG] }), () =>
      refuse(404, "not_found", "Not found."),
    );
    answer("get", "/me/people", () => refuse(404, "not_found", "Not found."));
    answer("delete", `/me/crews/${GANG.crewId}`, () =>
      refuse(404, "not_found", "Not found."),
    );
    const user = show();
    await heading("College gang");
    await user.click(screen.getByRole("button", { name: W.delete }));
    await user.click(screen.getByRole("button", { name: W.delete }));
    await heading(PEOPLE_WORDS.closed.title);
    expect(screen.queryByText("College gang")).toBeNull();
    expect(screen.queryByRole("link", { name: W.edit })).toBeNull();
    expect(screen.queryByRole("button", { name: W.delete })).toBeNull();
    expect(screen.queryByText(W.deleted)).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("says the sign-in ended when a later list read answers 401", async () => {
    signedIn();
    answer("get", "/me/crews", json({ crews: [GANG] }), () =>
      refuse(401, "unauthorized", "Sign in to see People."),
    );
    answer("delete", `/me/crews/${GANG.crewId}`, () =>
      refuse(403, "people_paused", "People is paused for you until Friday."),
    );
    const user = show();
    await heading("College gang");
    await user.click(screen.getByRole("button", { name: W.delete }));
    await user.click(screen.getByRole("button", { name: W.delete }));
    await heading(PEOPLE_WORDS.sessionEnded.title);
    expect(screen.queryByRole("link", { name: W.edit })).toBeNull();
    expect(screen.queryByRole("button", { name: W.delete })).toBeNull();
  });

  it("deletes after a second tap, then goes back to People", async () => {
    signedIn();
    answer("get", "/me/crews", json({ crews: [GANG] }), json({ crews: [] }));
    const sent = answer("delete", `/me/crews/${GANG.crewId}`, noContent());
    const user = show();
    await heading("College gang");
    await user.click(screen.getByRole("button", { name: W.delete }));
    const ask = screen.getByRole("group", {
      name: W.deleteTitle("College gang"),
    });
    expect(ask).toHaveTextContent(W.deleteBody);
    expect(sent).toHaveLength(0);
    await user.click(within(ask).getByRole("button", { name: W.delete }));
    expect(await screen.findByRole("status")).toHaveTextContent(W.deleted);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/people"));
    expect(sent).toHaveLength(1);
  });

  it("never calls a 404 on delete a deleted crew", async () => {
    signedIn();
    crews(GANG);
    answer("delete", `/me/crews/${GANG.crewId}`, () =>
      refuse(404, "not_found", "Not found."),
    );
    const release = answer("get", "/me/people", () =>
      refuse(404, "not_found", "Not found."),
    );
    const user = show();
    await heading("College gang");
    await user.click(screen.getByRole("button", { name: W.delete }));
    const ask = screen.getByRole("group", {
      name: W.deleteTitle("College gang"),
    });
    await user.click(within(ask).getByRole("button", { name: W.delete }));
    expect(await within(ask).findByRole("alert")).toHaveTextContent(
      W.closedNotDeleted,
    );
    expect(release.length).toBeGreaterThan(0);
    expect(screen.queryByText("Not found.")).toBeNull();
    expect(screen.queryByText(W.deleted)).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "College gang" }),
    ).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("says the crew was not deleted on a 404 the release does not explain", async () => {
    signedIn();
    crews(GANG);
    answer("delete", `/me/crews/${GANG.crewId}`, () =>
      refuse(404, "not_found", "Not found."),
    );
    answer("get", "/me/people", json(home()));
    const user = show();
    await heading("College gang");
    await user.click(screen.getByRole("button", { name: W.delete }));
    await user.click(screen.getByRole("button", { name: W.delete }));
    expect(await screen.findByRole("alert")).toHaveTextContent(W.notDeleted);
    expect(screen.queryByText("Not found.")).toBeNull();
    expect(screen.queryByText(W.deleted)).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("shows the API's sentence when a delete is refused", async () => {
    signedIn();
    crews(GANG);
    answer("delete", `/me/crews/${GANG.crewId}`, () =>
      refuse(403, "people_paused", "People is paused for you until Friday."),
    );
    const user = show();
    await heading("College gang");
    await user.click(screen.getByRole("button", { name: W.delete }));
    await user.click(screen.getByRole("button", { name: W.delete }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "People is paused for you until Friday.",
    );
    expect(screen.queryByText(W.deleted)).toBeNull();
  });

  it("keeps the crew on Keep, and sends nothing", async () => {
    signedIn();
    crews(GANG);
    const sent = answer("delete", `/me/crews/${GANG.crewId}`, noContent());
    const user = show();
    await heading("College gang");
    await user.click(screen.getByRole("button", { name: W.delete }));
    await user.click(screen.getByRole("button", { name: W.deleteKeep }));
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.getByRole("button", { name: W.delete })).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });
});
