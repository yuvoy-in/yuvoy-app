import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { PEOPLE_WORDS as W, inviteText } from "@/lib/people/people-words";
import { PeopleScreen } from "./people-screen";
import {
  answer,
  friend,
  home,
  json,
  noContent,
  noFriends,
  refuse,
  request,
  signedIn,
} from "./people-test-kit";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/people",
}));

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
});

const LINK = {
  code: "ASHAM-LNK22",
  url: "https://app.yuvoy.in/add/ASHAM-LNK22",
  expiresAt: "2026-12-02T10:00:00Z",
  requestsLeft: 18,
};

async function open(over: Parameters<typeof home>[0] = {}) {
  signedIn();
  const read = answer("get", "/me/people", json(home(over)));
  const user = userEvent.setup();
  renderWithQuery(<PeopleScreen />);
  await screen.findByRole("heading", { level: 1, name: W.title });
  return { read, user };
}

describe("People: requests", () => {
  it("accepts and declines, with mutual friends, and never says declined", async () => {
    noFriends();
    const accept = answer(
      "post",
      `/me/friend-requests/${request(1, "Priya S.").requestId}/answer`,
      noContent(),
    );
    const decline = answer(
      "post",
      `/me/friend-requests/${request(2, "Ravi K.").requestId}/answer`,
      noContent(),
    );
    const { user } = await open({
      requestsIn: [
        request(1, "Priya S.", { mutualFriends: 3 }),
        request(2, "Ravi K."),
      ],
    });
    const [priya, ravi] = screen.getAllByTestId("request-in");
    expect(priya).toHaveTextContent("Priya S.");
    expect(priya).toHaveTextContent(W.mutual(3));
    expect(ravi).not.toHaveTextContent(/mutual/i);

    await user.click(within(priya).getByRole("button", { name: W.accept }));
    await user.click(within(ravi).getByRole("button", { name: W.decline }));
    await waitFor(() => expect(decline).toHaveLength(1));
    expect(accept[0].body).toEqual({ answer: "accept" });
    expect(decline[0].body).toEqual({ answer: "decline" });
    expect(document.body).not.toHaveTextContent(/declined/i);
  });

  it("says a request is gone on a 404", async () => {
    noFriends();
    const r = request(1, "Priya S.");
    answer("post", `/me/friend-requests/${r.requestId}/answer`, () =>
      refuse(404, "not_found", "Not found."),
    );
    const { user } = await open({ requestsIn: [r] });
    await user.click(screen.getByRole("button", { name: W.accept }));
    expect(await screen.findByText(W.gone)).toBeInTheDocument();
  });

  it.each([
    [
      409,
      "friend_limit_reached",
      "You have 500 friends, the most there can be.",
    ],
    [429, "rate_limited", "Too many tries. Wait a minute."],
  ])(
    "shows a %s %s refusal in the API's words",
    async (status, code, message) => {
      noFriends();
      const r = request(1, "Priya S.");
      answer("post", `/me/friend-requests/${r.requestId}/answer`, () =>
        refuse(status, code, message),
      );
      const { user } = await open({ requestsIn: [r] });
      await user.click(screen.getByRole("button", { name: W.accept }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
    },
  );

  it("opens the age step when an answer needs the adult confirmation", async () => {
    noFriends();
    const r = request(1, "Priya S.");
    answer("post", `/me/friend-requests/${r.requestId}/answer`, () =>
      refuse(403, "adult_confirmation_required", "Confirm your age first."),
    );
    const { user } = await open({ requestsIn: [r] });
    await user.click(screen.getByRole("button", { name: W.accept }));
    expect(
      await screen.findByRole("heading", { level: 1, name: W.age.title }),
    ).toBeInTheDocument();
  });

  it("takes back a request sent", async () => {
    noFriends();
    const r = request(4, "Meera J.", { direction: "outgoing" });
    const gone = answer(
      "delete",
      `/me/friend-requests/${r.requestId}`,
      noContent(),
    );
    const { user } = await open({ requestsOut: [r] });
    const row = screen.getByTestId("request-out");
    expect(row).toHaveTextContent("Meera J.");
    await user.click(within(row).getByRole("button", { name: W.takeBack }));
    await waitFor(() => expect(gone).toHaveLength(1));
  });
});

describe("People: friends", () => {
  it("lists friends a page at a time, and unfriends behind a confirm", async () => {
    const pages = answer(
      "get",
      "/me/friends",
      json({ friends: [friend(6, "Kiran Rao")], nextCursor: "c2" }),
      json({ friends: [friend(7, "Dev Patel")], nextCursor: null }),
    );
    const removed = answer(
      "delete",
      `/me/friends/${friend(6, "Kiran Rao").personId}`,
      noContent(),
    );
    const { user } = await open({ friendCount: 2 });

    expect(screen.getByText(W.friendCount(2))).toBeInTheDocument();
    expect(await screen.findByText("Kiran Rao")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: W.more }));
    expect(await screen.findByText("Dev Patel")).toBeInTheDocument();
    expect(pages[1].query.get("cursor")).toBe("c2");
    expect(screen.getAllByTestId("friend").map((li) => li.textContent)).toEqual(
      [
        expect.stringContaining("Kiran Rao"),
        expect.stringContaining("Dev Patel"),
      ],
    );
    expect(screen.queryByRole("button", { name: W.more })).toBeNull();

    const [kiran] = screen.getAllByTestId("friend");
    await user.click(within(kiran).getByRole("button", { name: W.unfriend }));
    const ask = screen.getByRole("group", { name: W.unfriendAsk("Kiran Rao") });
    await user.click(within(ask).getByRole("button", { name: W.keep }));
    expect(removed).toHaveLength(0);

    await user.click(within(kiran).getByRole("button", { name: W.unfriend }));
    await user.click(screen.getByRole("button", { name: W.unfriendConfirm }));
    await waitFor(() => expect(removed).toHaveLength(1));
  });

  it("says when there are no friends yet", async () => {
    noFriends();
    await open();
    expect(await screen.findByText(W.friendsEmpty)).toBeInTheDocument();
  });
});

describe("People: the friend link", () => {
  it("invites through the share sheet where there is one", async () => {
    noFriends();
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: share,
      configurable: true,
    });
    const { user } = await open({ friendLink: LINK });
    expect(screen.getByText(LINK.url)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: W.invite }));
    expect(share).toHaveBeenCalledWith({ text: inviteText(LINK) });
    expect(screen.queryByText(W.messageCopied)).toBeNull();
  });

  it("copies the message where there is no share sheet", async () => {
    noFriends();
    const { user } = await open({ friendLink: LINK });
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();
    await user.click(screen.getByRole("button", { name: W.invite }));
    expect(await screen.findByText(W.messageCopied)).toBeInTheDocument();
    expect(write).toHaveBeenCalledWith(inviteText(LINK));
  });

  it("makes a new link and switches the link off", async () => {
    noFriends();
    const put = answer(
      "put",
      "/me/friend-link",
      json({ ...LINK, code: "ASHAM-NEW33" }),
    );
    const off = answer("delete", "/me/friend-link", noContent());
    const { read, user } = await open({ friendLink: LINK });

    await user.click(screen.getByRole("button", { name: W.newLink }));
    await waitFor(() => expect(put).toHaveLength(1));
    expect(put[0].body).toEqual({ rotate: true });

    answer("get", "/me/people", json(home({ friendLink: null })));
    await user.click(screen.getByRole("button", { name: W.switchOff }));
    expect(await screen.findByText(W.linkOff)).toBeInTheDocument();
    expect(off).toHaveLength(1);
    expect(read.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: W.getLink })).toBeInTheDocument();
  });

  it.each([
    [403, "people_paused", "Friend requests are paused on your account."],
    [409, "friend_link_full", "Your link has taken all the requests it can."],
  ])(
    "shows a %s %s refusal in the API's words",
    async (status, code, message) => {
      noFriends();
      const put = answer("put", "/me/friend-link", () =>
        refuse(status, code, message),
      );
      const { user } = await open();
      await user.click(screen.getByRole("button", { name: W.getLink }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(put[0].body).toEqual({});
    },
  );
});

describe("People: settings", () => {
  it("saves sharing with the offer for goings made before", async () => {
    noFriends();
    const patch = answer("patch", "/me/people", json(home()));
    const { user } = await open({
      sharing: "only_me",
      privateUpcomingGoing: 3,
    });
    const form = screen.getByRole("form", { name: W.sharingTitle });
    expect(within(form).getByText(W.sharingWhoMe)).toBeInTheDocument();
    await user.click(
      within(form).getByRole("radio", {
        name: new RegExp(`^${W.sharingFriends}`),
      }),
    );
    await user.click(
      within(form).getByRole("checkbox", { name: W.shareUpcoming(3) }),
    );
    await user.click(within(form).getByRole("button", { name: W.sharingSave }));
    expect(await within(form).findByText(W.saved)).toBeInTheDocument();
    expect(patch[0].body).toEqual({
      sharing: "friends",
      shareUpcomingGoing: true,
    });
  });

  it("turns friend request emails off with the switch", async () => {
    noFriends();
    const patch = answer(
      "patch",
      "/me/people",
      json(home({ requestEmails: false })),
    );
    const { user } = await open();
    const toggle = screen.getByRole("switch", { name: W.emailsTitle });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    await waitFor(() =>
      expect(toggle).toHaveAttribute("aria-checked", "false"),
    );
    expect(patch[0].body).toEqual({ requestEmails: false });
  });
});
