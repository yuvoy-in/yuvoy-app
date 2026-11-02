import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { PEOPLE_WORDS } from "@/lib/people/people-words";
import { AddFriendScreen } from "./add-friend-screen";
import {
  account,
  answer,
  json,
  person,
  refuse,
  signedIn,
} from "./people-test-kit";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/add/KIRAN-FRND2",
}));

const W = PEOPLE_WORDS.add;
const PRIYA = { ...person(101, "Priya S."), firstName: "Priya" };
const CODE = "KIRAN-FRND2";

const heading = (name: string) =>
  screen.findByRole("heading", { level: 1, name });

/** Signed in, the lookup answering `found`, the link opened with `raw`. */
function open(found: Record<string, unknown>, raw = CODE) {
  signedIn();
  const lookup = answer("post", "/friend-links/lookup", json(found));
  const user = userEvent.setup();
  renderWithQuery(<AddFriendScreen raw={raw} />);
  return { lookup, user };
}

describe("/add/{code}", () => {
  it("asks a signed-out reader to sign in and come back, and looks nothing up", async () => {
    account();
    renderWithQuery(<AddFriendScreen raw={CODE} />);
    await heading(W.signedOut.title);
    expect(
      screen.getByRole("link", { name: W.signedOut.action }),
    ).toHaveAttribute("href", `/account?next=/add/${CODE}`);
    expect(screen.queryByText(/Priya/)).toBeNull();
  });

  it("says a code that cannot be one doesn't work, without asking", async () => {
    const { lookup } = open({ state: "ok" }, "not%20a%20code!");
    await heading(W.unavailable.title);
    expect(lookup).toHaveLength(0);
  });

  it("sends a request, in any case, and a 202 is Request sent", async () => {
    const { lookup, user } = open(
      { state: "ok", owner: PRIYA, relation: "none" },
      "kiran-frnd2",
    );
    const sent = answer(
      "post",
      "/me/friend-requests",
      json({ state: "requested" }, 202),
    );
    await heading(W.asks("Priya S."));
    expect(lookup[0].body).toEqual({ code: "kiran-frnd2" });
    await user.click(screen.getByRole("button", { name: W.send }));
    expect(await screen.findByText(W.sent)).toHaveAttribute("role", "status");
    expect(sent[0].body).toEqual({ via: "friend_link", code: "kiran-frnd2" });
    expect(screen.queryByRole("button", { name: W.send })).toBeNull();
    expect(screen.getByRole("link", { name: W.toPeople })).toHaveAttribute(
      "href",
      "/people",
    );
  });

  it("says Friends when the send makes them friends", async () => {
    const { user } = open({ state: "ok", owner: PRIYA, relation: "none" });
    answer(
      "post",
      "/me/friend-requests",
      json({ state: "friends", person: PRIYA }, 202),
    );
    await heading(W.asks("Priya S."));
    await user.click(screen.getByRole("button", { name: W.send }));
    expect(await screen.findByText(W.friends)).toHaveAttribute(
      "role",
      "status",
    );
  });

  it("answers a request that came in with Accept", async () => {
    const { user } = open({
      state: "ok",
      owner: PRIYA,
      relation: "request_in",
    });
    const sent = answer(
      "post",
      "/me/friend-requests",
      json({ state: "friends" }, 202),
    );
    await heading(W.acceptIn("Priya S."));
    await user.click(screen.getByRole("button", { name: PEOPLE_WORDS.accept }));
    expect(await screen.findByText(W.friends)).toHaveAttribute(
      "role",
      "status",
    );
    expect(sent).toHaveLength(1);
  });

  it("says Request sent when one is already out", async () => {
    open({ state: "ok", owner: PRIYA, relation: "requested" });
    expect(await screen.findByText(W.sent)).toHaveAttribute("role", "status");
    expect(screen.queryByRole("button", { name: W.send })).toBeNull();
  });

  it("says Friends, with the first name, when they already are", async () => {
    open({ state: "ok", owner: PRIYA, relation: "friends" });
    await heading("Priya");
    expect(screen.getByText(W.friendsBody)).toBeInTheDocument();
    expect(screen.getByText(W.friends)).toHaveAttribute("role", "status");
    expect(screen.queryByRole("button", { name: W.send })).toBeNull();
  });

  it("has nothing to send on the traveller's own link", async () => {
    open({ state: "ok", owner: PRIYA, relation: "self" });
    await heading(W.self);
    expect(screen.queryByRole("button", { name: W.send })).toBeNull();
    expect(screen.getByRole("link", { name: W.toPeople })).toBeInTheDocument();
  });

  it.each([
    ["expired", W.expired],
    ["full", W.full],
    ["unavailable", W.unavailable],
  ] as const)("a %s link says so", async (state, words) => {
    open({ state });
    await heading(words.title);
    expect(screen.getByText(words.body)).toBeInTheDocument();
    expect(screen.queryByText(/Priya/)).toBeNull();
  });

  it.each([
    [410, "friend_link_expired", W.expired],
    [409, "friend_link_full", W.full],
  ] as const)(
    "a %s %s on sending turns the page into the ended link",
    async (status, code, words) => {
      const { user } = open({ state: "ok", owner: PRIYA, relation: "none" });
      answer("post", "/me/friend-requests", () =>
        refuse(status, code, "The API's sentence."),
      );
      await heading(W.asks("Priya S."));
      await user.click(screen.getByRole("button", { name: W.send }));
      await heading(words.title);
      expect(screen.queryByRole("button", { name: W.send })).toBeNull();
    },
  );

  it.each([
    [
      409,
      "friend_limit_reached",
      "You have 500 friends, the most there can be.",
    ],
    [403, "people_paused", "Friend requests are paused on your account."],
  ])(
    "shows a %s %s refusal in the API's words",
    async (status, code, message) => {
      const { user } = open({ state: "ok", owner: PRIYA, relation: "none" });
      answer("post", "/me/friend-requests", () =>
        refuse(status, code, message),
      );
      await heading(W.asks("Priya S."));
      await user.click(screen.getByRole("button", { name: W.send }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.queryByText(W.sent)).toBeNull();
    },
  );

  it("never says Request sent when sending answers 404, and shows the API's sentence", async () => {
    // A 404 there means People is closed to the caller, never "sent".
    const { user } = open({ state: "ok", owner: PRIYA, relation: "none" });
    const sent = answer("post", "/me/friend-requests", () =>
      refuse(404, "not_found", "Not found."),
    );
    await heading(W.asks("Priya S."));
    await user.click(screen.getByRole("button", { name: W.send }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not found.");
    expect(sent).toHaveLength(1);
    expect(screen.queryByText(W.sent)).toBeNull();
    expect(screen.queryByText(W.friends)).toBeNull();
  });

  it("opens the name step when sending needs a name", async () => {
    const { user } = open({ state: "ok", owner: PRIYA, relation: "none" });
    answer("post", "/me/friend-requests", () =>
      refuse(409, "name_required", "Add your name first."),
    );
    await heading(W.asks("Priya S."));
    await user.click(screen.getByRole("button", { name: W.send }));
    await heading(PEOPLE_WORDS.name.title);
  });

  it("says People is not open yet on a 404", async () => {
    signedIn();
    answer("post", "/friend-links/lookup", () =>
      refuse(404, "not_found", "Not found."),
    );
    renderWithQuery(<AddFriendScreen raw={CODE} />);
    await heading(PEOPLE_WORDS.closed.title);
  });

  it("shows a failed lookup in the API's words, with Try again", async () => {
    signedIn();
    answer("post", "/friend-links/lookup", () =>
      refuse(429, "rate_limited", "Too many tries. Wait a minute."),
    );
    renderWithQuery(<AddFriendScreen raw={CODE} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(W.failed);
    expect(alert).toHaveTextContent("Too many tries. Wait a minute.");
    expect(
      screen.getByRole("button", { name: PEOPLE_WORDS.retry }),
    ).toBeInTheDocument();
  });
});
