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

/**
 * The words and when it asks (yuvoy-app#181). A yes now also counts what is
 * done with a card, so it asks the phone app's question, and asks a yes given
 * to the older words once more.
 */
describe("what it asks, and when", () => {
  it("asks the app's question, with what is and is not counted", async () => {
    pathname = "/search";
    const card = await banner();
    expect(
      screen.getByRole("heading", {
        name: "Can we count what you watch and open?",
      }),
    ).toBeInTheDocument();
    expect(card).toHaveTextContent("It helps us learn what to show first.");
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toEqual([
      "Counted: Which videos and cards",
      "Counted: Opens, saves and shares, and when",
      "Never counted: Your name, number or email",
      "Never counted: Where you are",
    ]);
    expect(
      screen.getByRole("button", { name: "Yes, count them" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "No thanks" }),
    ).toBeInTheDocument();
    expect(card).toHaveTextContent(
      "Not linked to your account · change it any time",
    );
  });

  it("keeps the answer with the words it was given to", async () => {
    pathname = "/search";
    await banner();
    await act(async () => {
      screen.getByRole("button", { name: "Yes, count them" }).click();
    });
    expect(sessionStorage.getItem("yuvoy.consent.analytics")).toBe("granted:2");
    expect(
      screen.queryByRole("region", { name: "Analytics choice" }),
    ).toBeNull();
  });

  it("asks a yes given to the older words once more", async () => {
    pathname = "/search";
    sessionStorage.setItem("yuvoy.consent.analytics", "granted");
    await banner();
    await act(async () => {
      screen.getByRole("button", { name: "No thanks" }).click();
    });
    expect(sessionStorage.getItem("yuvoy.consent.analytics")).toBe("denied:2");
  });

  it("never asks a no again, whatever words it was given to", async () => {
    pathname = "/search";
    for (const answer of ["denied", "denied:2", "granted:2"]) {
      cleanup();
      sessionStorage.setItem("yuvoy.consent.analytics", answer);
      vi.resetModules();
      const { ConsentBanner } = await import("./consent-banner");
      render(<ConsentBanner />);
      expect(
        screen.queryByRole("region", { name: "Analytics choice" }),
        answer,
      ).toBeNull();
    }
  });

  it("asks wherever something real is counted, with or without the PostHog key", async () => {
    pathname = "/search";
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "disabled");
    expect(await banner()).toBeInTheDocument();

    // A build on the mock counts into the mock, and asks only with a key.
    cleanup();
    vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "enabled");
    vi.resetModules();
    const { ConsentBanner } = await import("./consent-banner");
    render(<ConsentBanner />);
    expect(
      screen.queryByRole("region", { name: "Analytics choice" }),
    ).toBeNull();
  });
});

/**
 * The plan link page (yuvoy-mobile#373, case 17). Its address after the `#`
 * is the plan's secret, so a friend opening it from WhatsApp is not asked
 * about analytics there, and nothing loads analytics from there.
 */
describe("on the plan link page", () => {
  it("does not ask", async () => {
    for (const route of ["/p", "/p/"]) {
      cleanup();
      pathname = route;
      vi.resetModules();
      const { ConsentBanner } = await import("./consent-banner");
      render(<ConsentBanner />);
      expect(
        screen.queryByRole("region", { name: "Analytics choice" }),
        route,
      ).toBeNull();
    }
  });

  it("loads no analytics for somebody who said yes elsewhere", async () => {
    pathname = "/p";
    sessionStorage.setItem("yuvoy.consent.analytics", "granted:2");
    vi.resetModules();
    const create = vi.fn(async () => null);
    vi.doMock("@/lib/analytics/posthog", () => ({
      createPostHogReporter: create,
    }));
    const { ConsentBanner } = await import("./consent-banner");
    await act(async () => {
      render(<ConsentBanner />);
    });
    expect(create).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/analytics/posthog");
  });
});
