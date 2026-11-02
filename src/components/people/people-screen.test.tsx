import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { PEOPLE_WORDS as W, indiaYear } from "@/lib/people/people-words";
import { PeopleScreen } from "./people-screen";
import {
  account,
  answer,
  home,
  json,
  noContent,
  noFriends,
  refuse,
  signedIn,
} from "./people-test-kit";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/people",
}));

const show = () => renderWithQuery(<PeopleScreen />);
const heading = (name: string) =>
  screen.findByRole("heading", { level: 1, name });

describe("People: who gets in", () => {
  it("asks a signed-out traveller to sign in and come back", async () => {
    account();
    show();
    await heading(W.signedOut.title);
    expect(
      screen.getByRole("link", { name: W.signedOut.action }),
    ).toHaveAttribute("href", "/account?next=/people");
  });

  it("says the sign-in expired on a 401", async () => {
    signedIn();
    answer("get", "/me/people", () =>
      refuse(401, "unauthorized", "Sign in again."),
    );
    show();
    await heading(W.sessionEnded.title);
    expect(
      screen.getByRole("button", { name: W.sessionEnded.action }),
    ).toBeInTheDocument();
  });

  it("says People is not open yet on a 404, with no list", async () => {
    signedIn();
    answer("get", "/me/people", () => refuse(404, "not_found", "Not found."));
    show();
    await heading(W.closed.title);
    expect(screen.queryByRole("heading", { name: W.friends })).toBeNull();
  });

  it("shows the API's sentence when the home fails", async () => {
    signedIn();
    answer("get", "/me/people", () =>
      refuse(429, "rate_limited", "Too many tries. Wait a minute."),
    );
    show();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(W.failed);
    expect(alert).toHaveTextContent("Too many tries. Wait a minute.");
    expect(screen.getByRole("button", { name: W.retry })).toBeInTheDocument();
  });

  it.each([
    ["removed", W.ended],
    ["restricted", W.paused],
  ] as const)(
    "a %s standing says so and shows nothing else",
    async (standing, words) => {
      signedIn();
      answer("get", "/me/people", json(home({ standing })));
      show();
      expect(await screen.findByText(words)).toHaveAttribute("role", "status");
      expect(screen.queryByRole("heading", { name: W.friends })).toBeNull();
      expect(screen.queryByRole("button", { name: W.getLink })).toBeNull();
    },
  );

  it("requests_paused says so above the rest of People", async () => {
    signedIn();
    noFriends();
    answer("get", "/me/people", json(home({ standing: "requests_paused" })));
    show();
    expect(await screen.findByText(W.requestsPaused)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: W.friends }),
    ).toBeInTheDocument();
  });
});

describe("People: the age step", () => {
  it("checks the year, asks the birthday only at 18, and saves both", async () => {
    signedIn();
    noFriends();
    answer(
      "get",
      "/me/people",
      json(home({ ageConfirmed: false })),
      json(home()),
    );
    const put = answer("put", "/me/age", noContent());
    const user = userEvent.setup();
    show();
    await heading(W.age.title);

    const year = screen.getByLabelText(W.age.year);
    await user.type(year, "94");
    await user.click(screen.getByRole("button", { name: W.age.action }));
    expect(await screen.findByText(W.age.yearBad)).toBeInTheDocument();
    expect(put).toHaveLength(0);

    await user.clear(year);
    await user.type(year, String(indiaYear() - 30));
    expect(screen.queryByRole("group", { name: W.age.birthday })).toBeNull();

    await user.clear(year);
    const boundary = indiaYear() - 18;
    await user.type(year, String(boundary));
    expect(
      screen.getByRole("group", { name: W.age.birthday }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: W.age.action }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      W.age.birthdayMissing,
    );

    await user.click(screen.getByRole("radio", { name: W.age.yes }));
    await user.click(screen.getByRole("button", { name: W.age.action }));
    await heading(W.title);
    expect(put[0].body).toEqual({ birthYear: boundary, birthdayPassed: true });
  });

  it("asks the birthday when the API wants it for a year the browser thinks is clear (#228)", async () => {
    signedIn();
    noFriends();
    answer(
      "get",
      "/me/people",
      json(home({ ageConfirmed: false })),
      json(home()),
    );
    // Near 1 January the API's India year is one ahead of the browser's.
    const put = answer(
      "put",
      "/me/age",
      () =>
        HttpResponse.json(
          {
            error: {
              code: "invalid_input",
              message: "Tell us whether you have had your birthday this year.",
              details: {
                birthdayPassed:
                  "Tell us whether you have had your birthday this year.",
              },
            },
          },
          { status: 400 },
        ),
      noContent(),
    );
    const user = userEvent.setup();
    show();
    await heading(W.age.title);

    const typed = indiaYear() - 17;
    await user.type(screen.getByLabelText(W.age.year), String(typed));
    expect(screen.queryByRole("group", { name: W.age.birthday })).toBeNull();
    await user.click(screen.getByRole("button", { name: W.age.action }));

    expect(
      await screen.findByRole("group", { name: W.age.birthday }),
    ).toBeInTheDocument();
    expect(put[0].body).toEqual({ birthYear: typed });
    // The opened question answers the 400, so its sentence is not repeated.
    expect(
      screen
        .queryAllByRole("alert")
        .filter((a) => a.textContent?.includes("birthday this year")),
    ).toEqual([]);

    await user.click(screen.getByRole("radio", { name: W.age.no }));
    await user.click(screen.getByRole("button", { name: W.age.action }));
    await heading(W.title);
    expect(put[1].body).toEqual({ birthYear: typed, birthdayPassed: false });
  });

  it("keeps the under-18 sentence on screen after it signs out", async () => {
    signedIn();
    answer("get", "/me/people", json(home({ ageConfirmed: false })));
    answer("put", "/me/age", () =>
      refuse(
        403,
        "under_age_sign_up",
        "Yuvoy accounts are for people 18 and over, so we have closed this one. If you think this is wrong, contact us.",
      ),
    );
    const user = userEvent.setup();
    show();
    await heading(W.age.title);
    await user.type(
      screen.getByLabelText(W.age.year),
      String(indiaYear() - 12),
    );
    await user.click(screen.getByRole("button", { name: W.age.action }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Yuvoy accounts are for people 18 and over, so we have closed this one. If you think this is wrong, contact us.",
    );
    // The sign-out has run, and the sentence is still what is shown.
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: W.age.closedAction }),
      ).toHaveAttribute("href", "/"),
    );
    expect(
      screen.queryByRole("heading", { name: W.signedOut.title }),
    ).toBeNull();
  });

  it("shows age_locked in the API's words", async () => {
    signedIn();
    answer("get", "/me/people", json(home({ ageConfirmed: false })));
    answer("put", "/me/age", () =>
      refuse(409, "age_locked", "Your birth year is already saved."),
    );
    const user = userEvent.setup();
    show();
    await heading(W.age.title);
    await user.type(
      screen.getByLabelText(W.age.year),
      String(indiaYear() - 30),
    );
    await user.click(screen.getByRole("button", { name: W.age.action }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your birth year is already saved.",
    );
  });
});

describe("People: the name step and the first sharing choice", () => {
  it("asks for a first name and saves it", async () => {
    signedIn();
    noFriends();
    answer("get", "/me/people", json(home({ needsName: true })), json(home()));
    const patch = answer("patch", "/me", json({ name: "Asha" }));
    const user = userEvent.setup();
    show();
    await heading(W.name.title);
    await user.click(screen.getByRole("button", { name: W.name.action }));
    expect(await screen.findByText(W.name.missing)).toBeInTheDocument();

    await user.type(screen.getByLabelText(W.name.field), "Asha");
    await user.click(screen.getByRole("button", { name: W.name.action }));
    await heading(W.title);
    expect(patch[0].body).toEqual({ name: "Asha" });
  });

  it("starts at Only me and offers goings already made when Friends is picked", async () => {
    signedIn();
    noFriends();
    answer(
      "get",
      "/me/people",
      json(home({ sharing: null, privateUpcomingGoing: 2 })),
      json(home()),
    );
    const patch = answer("patch", "/me/people", json(home()));
    const user = userEvent.setup();
    show();
    await heading(W.sharingFirst.title);
    expect(
      screen.getByRole("radio", { name: new RegExp(W.sharingOnlyMe) }),
    ).toBeChecked();
    expect(screen.getByText(W.sharingWhoMe)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();

    await user.click(
      screen.getByRole("radio", { name: new RegExp(`^${W.sharingFriends}`) }),
    );
    expect(screen.getByText(W.sharingWhoFriends)).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", { name: W.shareUpcoming(2) }),
    );
    await user.click(
      screen.getByRole("button", { name: W.sharingFirst.action }),
    );
    await heading(W.title);
    expect(patch[0].body).toEqual({
      sharing: "friends",
      shareUpcomingGoing: true,
    });
  });
});
