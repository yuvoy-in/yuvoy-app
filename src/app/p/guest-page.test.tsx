import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../mocks/server";
import { openPlanView } from "../../../mocks/plan-fixtures";
import { __forgetArrival, keepForSignIn } from "@/lib/plans/guest-return";
import { renderWithQuery } from "@/test/render";
import { GuestPage } from "./guest-page";

/**
 * The guest page (yuvoy-mobile#373): the token comes from the fragment, a
 * bad one costs no request, a good one is sent in a JSON body and never in
 * an address, the fragment is never changed but put back after sign-in, and
 * every page without a plan says why in a line that takes focus.
 */

const TOKEN = `yp_${"T".repeat(40)}a-_`;
const NOT_WORKING = /This plan link is not working\./;
const START = window.location.href;

function watchView(
  answer: () => Response = () => HttpResponse.json(openPlanView()),
) {
  const sent: { url: string; body: string; type: string | null }[] = [];
  server.use(
    http.post("*/p/api/view", async ({ request }) => {
      sent.push({
        url: request.url,
        body: await request.text(),
        type: request.headers.get("content-type"),
      });
      return answer();
    }),
  );
  return sent;
}

function at(hash: string) {
  window.history.replaceState(null, "", `/p${hash}`);
}

beforeEach(() => {
  __forgetArrival();
});
afterEach(() => {
  window.history.replaceState(null, "", START);
});

describe("a link that is not working", () => {
  it("is said when nothing follows the #, with no request and nothing to report", async () => {
    at("");
    const sent = watchView();
    renderWithQuery(<GuestPage />);
    expect(await screen.findByText(NOT_WORKING)).toBeInTheDocument();
    expect(sent).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: "Report this plan" }),
    ).toBeNull();
  });

  it("is said for a token of the wrong shape, with no request", async () => {
    at("#yp_tooshort");
    const sent = watchView();
    renderWithQuery(<GuestPage />);
    expect(await screen.findByText(NOT_WORKING)).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("is said for a 404, takes focus, and still offers Report this plan", async () => {
    at(`#${TOKEN}`);
    watchView(() =>
      HttpResponse.json(
        { error: { code: "not_found", message: "x" } },
        { status: 404 },
      ),
    );
    renderWithQuery(<GuestPage />);
    const line = await screen.findByText(NOT_WORKING);
    await waitFor(() => expect(line.closest("[role=alert]")).toHaveFocus());
    expect(
      screen.getByRole("heading", { level: 1, name: "A plan on Yuvoy" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Report this plan" }),
    ).toBeInTheDocument();
  });

  it("says a report was not sent when the API cannot find the plan either", async () => {
    at(`#${TOKEN}`);
    const NOT_FOUND = () =>
      HttpResponse.json(
        { error: { code: "not_found", message: "x" } },
        { status: 404 },
      );
    watchView(NOT_FOUND);
    server.use(http.post("*/p/api/report", NOT_FOUND));
    renderWithQuery(<GuestPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Report this plan" }),
    );
    await userEvent.click(
      screen.getByRole("radio", { name: "It is spam or a scam" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));

    // Not a sheet that closes on nothing: it stays, and says so.
    expect(
      await screen.findByText(/We could not send your report\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("reading the plan", () => {
  it("sends the token in a JSON body, never in the address", async () => {
    at(`#${TOKEN}`);
    const sent = watchView();
    renderWithQuery(<GuestPage />);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Dinner at the beach shack",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Asha invited you")).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0].body)).toEqual({ token: TOKEN });
    expect(sent[0].url).not.toContain(TOKEN);
    expect(sent[0].type).toBe("application/json");
  });

  it("leaves the fragment exactly as it found it", async () => {
    at(`#${TOKEN}`);
    const replace = vi.spyOn(window.history, "replaceState");
    watchView();
    renderWithQuery(<GuestPage />);
    await screen.findByRole("heading", { level: 1 });
    expect(window.location.hash).toBe(`#${TOKEN}`);
    expect(replace).not.toHaveBeenCalled();
    replace.mockRestore();
  });

  it("says plans are paused for plans_unavailable, and asks again on Try again", async () => {
    at(`#${TOKEN}`);
    let paused = true;
    const sent = watchView(() =>
      paused
        ? HttpResponse.json(
            { error: { code: "plans_unavailable", message: "x" } },
            { status: 503 },
          )
        : HttpResponse.json(openPlanView()),
    );
    renderWithQuery(<GuestPage />);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Plans are paused for a moment.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Try again later.")).toBeInTheDocument();
    paused = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Dinner at the beach shack",
      }),
    ).toBeInTheDocument();
    expect(sent).toHaveLength(2);
  });

  it("says so when no answer arrives", async () => {
    at(`#${TOKEN}`);
    watchView(() => HttpResponse.error());
    renderWithQuery(<GuestPage />);
    expect(
      await screen.findByText(/Check your connection and try again/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});

describe("back from sign-in", () => {
  it("reads the kept plan and puts its token back after the #", async () => {
    keepForSignIn(TOKEN);
    at("?__scenario=plan-guest-returning");
    const sent = watchView();
    renderWithQuery(<GuestPage />);
    await screen.findByRole("heading", {
      level: 1,
      name: "Dinner at the beach shack",
    });
    expect(JSON.parse(sent[0].body)).toEqual({ token: TOKEN });
    expect(window.location.hash).toBe(`#${TOKEN}`);
    expect(window.location.search).toBe("?__scenario=plan-guest-returning");
  });

  it("never swaps a fragment that is there for the kept one", async () => {
    keepForSignIn(TOKEN);
    at("#yp_tooshort");
    const sent = watchView();
    renderWithQuery(<GuestPage />);
    expect(await screen.findByText(NOT_WORKING)).toBeInTheDocument();
    expect(sent).toHaveLength(0);
    expect(window.location.hash).toBe("#yp_tooshort");
  });
});
