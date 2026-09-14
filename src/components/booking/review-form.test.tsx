import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { ReviewForm } from "./review-form";
import { server } from "../../../mocks/server";
import { http, HttpResponse, delay } from "msw";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

describe("ReviewForm", () => {
  it("sends ONE review when the button is double-tapped", async () => {
    let posts = 0;
    server.use(
      http.post(`${BASE}/bookings/review`, async () => {
        posts += 1;
        await delay(80);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<ReviewForm token="t" />);
    await user.click(screen.getByRole("button", { name: "5 out of 5" }));

    const button = screen.getByRole("button", { name: /leave this review/i });
    // Two taps before the first request resolves — `isPending` is still false
    // on the second, so only a synchronous guard closes the window.
    await Promise.all([user.click(button), user.click(button)]);

    expect(await screen.findByText("Thank you")).toBeInTheDocument();
    expect(posts).toBe(1);
  });

  it("treats 'already reviewed' as the recorded state, not a failure", async () => {
    server.use(
      http.post(`${BASE}/bookings/review`, () =>
        HttpResponse.json(
          { error: { code: "conflict", message: "raw" } },
          { status: 409 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<ReviewForm token="t" />);
    await user.click(screen.getByRole("button", { name: "4 out of 5" }));
    await user.click(
      screen.getByRole("button", { name: /leave this review/i }),
    );

    expect(await screen.findByText("Already recorded")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText(/trying again often fixes it/)).toBeNull(),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offers a new link when the token behind it has died", async () => {
    server.use(
      http.post(`${BASE}/bookings/review`, () =>
        HttpResponse.json(
          { error: { code: "token_expired", message: "raw" } },
          { status: 401 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<ReviewForm token="t" />);
    await user.click(screen.getByRole("button", { name: "3 out of 5" }));
    await user.click(
      screen.getByRole("button", { name: /leave this review/i }),
    );

    expect(
      await screen.findByText("This link has expired"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Get a new link" }),
    ).toHaveAttribute("href", "/trips/recover");
  });
});

/*
  `POST /bookings/review` stopped answering `conflict` on 2026-09-13 and split
  it into three codes (yuvoy-app#53). The test above still sends `conflict`
  deliberately: that is what a deployment behind the split answers, and the
  branch has to keep reading it.

  These cover the three codes that replaced it. The distinction being proven
  is that they are not interchangeable: one is a recorded review, and two are
  refusals with different next steps and NO way to try again.
*/
describe("ReviewForm — the three codes that replaced `conflict`", () => {
  const refuse = (code: string) =>
    server.use(
      http.post(`${BASE}/bookings/review`, () =>
        HttpResponse.json({ error: { code, message: "raw" } }, { status: 409 }),
      ),
    );

  const submit = async (stars: number) => {
    const user = userEvent.setup();
    renderWithQuery(<ReviewForm token="t" />);
    await user.click(screen.getByRole("button", { name: `${stars} out of 5` }));
    await user.click(
      screen.getByRole("button", { name: /leave this review/i }),
    );
  };

  it("reads `already_reviewed` as the recorded state, like the old `conflict`", async () => {
    refuse("already_reviewed");
    await submit(5);

    expect(await screen.findByText("Already recorded")).toBeInTheDocument();
    // The regression this issue is about: the generic crash copy and a retry.
    await waitFor(() =>
      expect(screen.queryByText(/trying again often fixes it/)).toBeNull(),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tells `not_reviewable_yet` to come back, and takes the form away", async () => {
    refuse("not_reviewable_yet");
    await submit(5);

    expect(
      await screen.findByText("This trip is not finished yet"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/trying again often fixes it/)).toBeNull();
    // No button that cannot succeed. That trap is the whole of #53.
    expect(
      screen.queryByRole("button", { name: /leave this review/i }),
    ).toBeNull();
    expect(screen.queryByText("Already recorded")).toBeNull();
  });

  it("tells `review_window_closed` there is nothing to do, and takes the form away", async () => {
    refuse("review_window_closed");
    await submit(5);

    expect(
      await screen.findByText("Too late to review this one"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/trying again often fixes it/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /leave this review/i }),
    ).toBeNull();
    expect(screen.queryByText("Already recorded")).toBeNull();
  });
});
