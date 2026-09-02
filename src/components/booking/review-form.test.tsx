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
