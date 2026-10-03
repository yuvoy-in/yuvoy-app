import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
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
