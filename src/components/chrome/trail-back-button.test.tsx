import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

/**
 * Back, to wherever the traveller came from (the approved redesign, traveller
 * A, 3 Oct 2026). The trail's rules are `route-trail.test.ts`; these pin what
 * the control renders from it.
 *
 * The trail is module state, so each test imports a fresh copy.
 */

let pathname = "/e/try-dive";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

async function load() {
  vi.resetModules();
  const trail = await import("@/lib/site/route-trail");
  const { TrailBackButton } = await import("./trail-back-button");
  return { ...trail, TrailBackButton };
}

const FALLBACK = { href: "/", label: "the feed" };

beforeEach(() => {
  pathname = "/e/try-dive";
});
afterEach(cleanup);

describe("TrailBackButton", () => {
  it("returns to the screen the traveller came from, query and all", async () => {
    const { TrailBackButton, recordVisit } = await load();
    recordVisit("/search?q=dive");
    recordVisit("/e/try-dive");

    render(<TrailBackButton {...FALLBACK} />);
    expect(
      screen.getByRole("link", { name: "Back to search" }),
    ).toHaveAttribute("href", "/search?q=dive");
  });

  it("falls back to its own target with no trail behind it", async () => {
    // A hard load, a reload, or a traveller who arrived from outside.
    const { TrailBackButton, recordVisit } = await load();
    recordVisit("/e/try-dive");

    render(<TrailBackButton {...FALLBACK} />);
    expect(
      screen.getByRole("link", { name: "Back to the feed" }),
    ).toHaveAttribute("href", "/");
  });

  it("never sends anybody back into a step like checkout", async () => {
    const { TrailBackButton, recordVisit } = await load();
    recordVisit("/e/try-dive/book?date=2026-10-16");
    recordVisit("/e/try-dive");

    render(<TrailBackButton {...FALLBACK} />);
    expect(
      screen.getByRole("link", { name: "Back to the feed" }),
    ).toHaveAttribute("href", "/");
  });

  it("follows the trail as it changes", async () => {
    const { TrailBackButton, recordVisit } = await load();
    render(<TrailBackButton {...FALLBACK} />);
    expect(
      screen.getByRole("link", { name: "Back to the feed" }),
    ).toBeVisible();

    act(() => {
      recordVisit("/saved");
      recordVisit("/e/try-dive");
    });
    expect(
      screen.getByRole("link", { name: "Back to your saved experiences" }),
    ).toHaveAttribute("href", "/saved");
  });

  it("renders its own target on the server, whatever the trail holds", async () => {
    // The first paint of a loaded page must be what the server sent, or
    // hydration fails. There is no trail on a hard load anyway.
    const { TrailBackButton, recordVisit } = await load();
    recordVisit("/search?q=dive");
    recordVisit("/e/try-dive");

    const html = renderToString(<TrailBackButton {...FALLBACK} />);
    expect(html).toContain('href="/"');
    expect(html).toContain('aria-label="Back to the feed"');
  });
});
