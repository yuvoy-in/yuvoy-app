import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Where the analytics question sits (cited in the redesign's before page,
 * 3 Oct 2026): over a reel it covered the caption and Book, the one row a new
 * visitor came to act on. It goes to the top there, and stays at the foot on
 * every screen whose foot is free.
 */

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

async function banner() {
  vi.resetModules();
  const { ConsentBanner } = await import("./consent-banner");
  render(<ConsentBanner />);
  return screen.getByRole("region", { name: "Analytics choice" });
}

describe("ConsentBanner", () => {
  it("sits at the top over a reel, clear of the caption and Book", async () => {
    for (const route of ["/", "/r/med_1", "/search/r/med_1", "/o/op/r/med_1"]) {
      cleanup();
      pathname = route;
      const card = await banner();
      expect(card.className, route).toMatch(/\btop-\[/);
      expect(card.className, route).not.toMatch(/\bbottom-\[/);
    }
  });

  it("stays at the foot, above the tab bar, where the foot is free", async () => {
    for (const route of ["/search", "/trips", "/e/try-dive-nemo-reef"]) {
      cleanup();
      pathname = route;
      const card = await banner();
      expect(card.className, route).toMatch(/\bbottom-\[/);
    }
  });
});

describe("before the page is in a browser", () => {
  /*
    The server cannot read this browser's choice, and it used to answer
    "unset", so the banner was in every server-rendered page: a traveller who
    had already chosen saw it on every hard load until hydration (stability
    audit, 6 Oct 2026).
  */
  it("is not in the server's HTML, and asks once the page has hydrated", async () => {
    pathname = "/search";
    vi.resetModules();
    const { ConsentBanner } = await import("./consent-banner");
    const html = renderToString(<ConsentBanner />);
    expect(html).toBe("");

    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    await act(async () => {
      hydrateRoot(host, <ConsentBanner />);
    });
    expect(
      screen.getByRole("region", { name: "Analytics choice" }),
    ).toBeInTheDocument();
    host.remove();
  });

  it("never draws itself for a traveller who has chosen", async () => {
    sessionStorage.setItem("yuvoy.consent.analytics", "denied");
    vi.resetModules();
    const { ConsentBanner } = await import("./consent-banner");
    const host = document.createElement("div");
    host.innerHTML = renderToString(<ConsentBanner />);
    document.body.append(host);
    await act(async () => {
      hydrateRoot(host, <ConsentBanner />);
    });
    expect(
      screen.queryByRole("region", { name: "Analytics choice" }),
    ).toBeNull();
    host.remove();
  });
});
