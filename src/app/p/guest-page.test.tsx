import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../mocks/server";
import { openPlanView } from "../../../mocks/plan-fixtures";
import { GuestPage } from "./guest-page";

/**
 * The placeholder guest page (yuvoy-mobile#373): the token comes from the
 * fragment, a bad one costs no request, a good one is sent in a JSON body
 * and never in the address, and the fragment is never touched. The real
 * page replaces the rendering; these rules carry over to it.
 */

const TOKEN = `yp_${"T".repeat(40)}a-_`;
const NOT_WORKING = /This plan link is not working\./;

function watchView(answer: () => Response = () => HttpResponse.json(openPlanView())) {
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

afterEach(() => {
  window.location.hash = "";
});

describe("the guest page placeholder", () => {
  it("shows the link is not working when nothing follows the #, and asks nothing", async () => {
    const sent = watchView();
    render(<GuestPage />);
    expect(await screen.findByText(NOT_WORKING)).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("does the same for a token of the wrong shape", async () => {
    window.location.hash = "#yp_tooshort";
    const sent = watchView();
    render(<GuestPage />);
    expect(await screen.findByText(NOT_WORKING)).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("reads the plan with the token in a JSON body, never in the address", async () => {
    window.location.hash = `#${TOKEN}`;
    const sent = watchView();
    render(<GuestPage />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Dinner at the beach shack" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Asha invited you")).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0].body)).toEqual({ token: TOKEN });
    expect(sent[0].url).not.toContain(TOKEN);
    expect(sent[0].type).toBe("application/json");
  });

  it("leaves the fragment exactly as it found it", async () => {
    window.location.hash = `#${TOKEN}`;
    watchView();
    render(<GuestPage />);
    await screen.findByRole("heading", { level: 1 });
    expect(window.location.hash).toBe(`#${TOKEN}`);
  });

  it("shows the link is not working for a 404", async () => {
    window.location.hash = `#${TOKEN}`;
    watchView(() =>
      HttpResponse.json({ error: { code: "not_found", message: "x" } }, { status: 404 }),
    );
    render(<GuestPage />);
    expect(await screen.findByText(NOT_WORKING)).toBeInTheDocument();
  });

  it("says plans are paused for plans_unavailable, not that something broke", async () => {
    window.location.hash = `#${TOKEN}`;
    watchView(() =>
      HttpResponse.json(
        { error: { code: "plans_unavailable", message: "x" } },
        { status: 503 },
      ),
    );
    render(<GuestPage />);
    expect(
      await screen.findByText("Plans are paused for a moment. Try again later."),
    ).toBeInTheDocument();
  });

  it("says so when no answer arrives", async () => {
    window.location.hash = `#${TOKEN}`;
    watchView(() => HttpResponse.error());
    render(<GuestPage />);
    expect(await screen.findByText(/Check your connection/)).toBeInTheDocument();
  });
});
