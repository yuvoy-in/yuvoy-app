import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SkipLink } from "./skip-link";

/**
 * The skip link and the plan link page (yuvoy-mobile#373). The page's token
 * is the fragment, so on `/p` the skip link moves focus and never the
 * address; everywhere else it is the plain anchor it always was.
 */

const TOKEN = `yp_${"T".repeat(40)}a-_`;
const START = window.location.href;

function page(path: string) {
  window.history.replaceState(null, "", path);
  const main = document.createElement("main");
  main.id = "main";
  document.body.append(main);
  render(<SkipLink />);
  return main;
}

afterEach(() => {
  cleanup();
  document.getElementById("main")?.remove();
  window.history.replaceState(null, "", START);
});

describe("the skip link", () => {
  it("on the plan link page, focuses main and leaves the token in the address", () => {
    const main = page(`/p#${TOKEN}`);
    const followed = fireEvent.click(screen.getByRole("link", { name: "Skip to content" }));
    expect(followed).toBe(false);
    expect(window.location.hash).toBe(`#${TOKEN}`);
    expect(document.activeElement).toBe(main);
  });

  it("takes main out of the tab order again once focus leaves it", () => {
    const main = page(`/p/#${TOKEN}`);
    fireEvent.click(screen.getByRole("link", { name: "Skip to content" }));
    expect(main.getAttribute("tabindex")).toBe("-1");
    main.blur();
    expect(main.hasAttribute("tabindex")).toBe(false);
  });

  it("is the plain anchor everywhere else", () => {
    page("/search");
    const link = screen.getByRole("link", { name: "Skip to content" });
    expect(link.getAttribute("href")).toBe("#main");
    expect(fireEvent.click(link)).toBe(true);
  });
});
