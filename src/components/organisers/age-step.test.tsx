import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { indiaYear, BIRTH_YEAR_WORDS as W } from "@/lib/auth/confirm-age";
import { clockOffsetMs } from "@/lib/booking/clock";
import { AgeStep } from "./age-step";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const session = vi.hoisted(() => ({ signOut: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/use-traveller", () => ({
  useTravellerSession: () => ({
    signedIn: true,
    signIn: vi.fn(),
    signOut: session.signOut,
    refresh: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organisers",
}));

/** The year the step judges in: the server's clock, in India. */
function thisYear(): number {
  return indiaYear(Date.now() + clockOffsetMs());
}

/** Every body `PUT /me/age` was sent, and the answer it gives. */
function ageAnswers(answer: () => Response) {
  const sent: unknown[] = [];
  server.use(
    http.put(`${BASE}/me/age`, async ({ request }) => {
      sent.push(await request.json());
      return answer();
    }),
  );
  return sent;
}

function refused(status: number, code: string, message: string, details = {}) {
  return HttpResponse.json(
    { error: { code, message, details, requestId: "req_age" } },
    { status },
  );
}

beforeEach(() => {
  session.signOut.mockClear();
  __signInAppRouteMock("sess_test");
});
afterEach(cleanup);

describe("AgeStep", () => {
  it("asks about the birthday only for this year minus 18", async () => {
    const user = userEvent.setup();
    renderWithQuery(<AgeStep onDone={() => {}} />);
    const year = screen.getByLabelText(W.label);

    await user.type(year, String(thisYear() - 19));
    expect(screen.queryByRole("group", { name: W.birthday })).toBeNull();

    await user.clear(year);
    await user.type(year, String(thisYear() - 18));
    expect(screen.getByRole("group", { name: W.birthday })).toBeTruthy();
  });

  it("says what is missing before sending anything", async () => {
    const user = userEvent.setup();
    const sent = ageAnswers(() => HttpResponse.json({ ageConfirmed: true }));
    renderWithQuery(<AgeStep onDone={() => {}} />);

    await user.click(screen.getByRole("button", { name: W.send }));
    expect(await screen.findByText(W.needYear)).toBeTruthy();

    await user.type(screen.getByLabelText(W.label), String(thisYear() - 18));
    await user.click(screen.getByRole("button", { name: W.send }));
    expect(await screen.findByText(W.needBirthday)).toBeTruthy();
    expect(sent).toEqual([]);
  });

  it("sends the year, with the birthday answer for that one year, then calls onDone", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const sent = ageAnswers(() => HttpResponse.json({ ageConfirmed: true }));
    renderWithQuery(<AgeStep onDone={onDone} />);

    await user.type(screen.getByLabelText(W.label), String(thisYear() - 18));
    await user.click(screen.getByRole("radio", { name: W.yes }));
    await user.click(screen.getByRole("button", { name: W.send }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(sent).toEqual([
      { birthYear: thisYear() - 18, birthdayPassed: true },
    ]);
  });

  it("shows the API's sentence for an under-18 answer and signs out", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const line =
      "Yuvoy accounts are for people 18 and over, so we have closed this one. If you think this is wrong, contact us.";
    ageAnswers(() => refused(403, "under_age_sign_up", line));
    renderWithQuery(<AgeStep onDone={onDone} />);

    await user.type(screen.getByLabelText(W.label), String(thisYear() - 10));
    await user.click(screen.getByRole("button", { name: W.send }));

    expect(await screen.findByText(line)).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "We have closed this account" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Contact us" })).toBeTruthy();
    await waitFor(() => expect(session.signOut).toHaveBeenCalledTimes(1));
    expect(onDone).not.toHaveBeenCalled();
  });

  it("shows the API's sentence for age_locked", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const line =
      "Your age can only be changed by the Yuvoy team. Write to us from Help.";
    ageAnswers(() => refused(409, "age_locked", line));
    renderWithQuery(<AgeStep onDone={onDone} />);

    await user.type(screen.getByLabelText(W.label), "1998");
    await user.click(screen.getByRole("button", { name: W.send }));

    expect(await screen.findByText(line)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    expect(session.signOut).not.toHaveBeenCalled();
  });

  it("puts a 400's sentence on its field, and asks about the birthday when the server does", async () => {
    const user = userEvent.setup();
    const asked = "Tell us whether you have had your birthday this year.";
    ageAnswers(() =>
      refused(400, "invalid_input", "Check the fields marked.", {
        birthdayPassed: asked,
      }),
    );
    renderWithQuery(<AgeStep onDone={() => {}} />);

    // Near New Year the server's year can differ: it asks about this year minus 19.
    await user.type(screen.getByLabelText(W.label), String(thisYear() - 19));
    await user.click(screen.getByRole("button", { name: W.send }));

    expect(await screen.findByText(asked)).toBeTruthy();
    expect(screen.getByRole("group", { name: W.birthday })).toBeTruthy();
  });

  it("shows a year field's sentence from the API", async () => {
    const user = userEvent.setup();
    const sentence = "Give a year from 1900 to this year.";
    ageAnswers(() =>
      refused(400, "invalid_input", "Check the fields marked.", {
        birthYear: sentence,
      }),
    );
    renderWithQuery(<AgeStep onDone={() => {}} />);

    await user.type(screen.getByLabelText(W.label), "1998");
    await user.click(screen.getByRole("button", { name: W.send }));

    expect(await screen.findByText(sentence)).toBeTruthy();
  });
});
