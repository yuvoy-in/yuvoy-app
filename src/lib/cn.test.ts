import { readFileSync } from "node:fs";
import { join } from "node:path";
import { twMerge } from "tailwind-merge";
import { describe, expect, it } from "vitest";
import { cn } from "./cn";

/*
  The guard for the trap v3.2's named type steps walked into: tailwind-merge
  reads an unknown `text-*` as a colour, so `cn("text-button", "text-paper")`
  dropped the size and every Button fell back to 16px. These pin the merges
  the type system relies on, and hold cn.ts's list to the @theme block, so a
  token added there without a line in cn.ts fails here instead of in a layout.
*/

const theme = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const block = theme.slice(theme.indexOf("@theme {"));
const names = (prefix: string) =>
  [...block.matchAll(new RegExp(`^\\s*--${prefix}-([a-z0-9-]+):`, "gm"))]
    .map((m) => m[1])
    .filter((name) => !name.includes("--"));

describe("cn and the type tokens", () => {
  it("keeps a named size beside a colour", () => {
    expect(cn("text-button", "text-paper")).toBe("text-button text-paper");
    expect(cn("text-label text-forest/75")).toBe("text-label text-forest/75");
    expect(cn("text-body", "text-forest/70")).toBe("text-body text-forest/70");
  });

  it("lets a later size replace a named one, and the reverse", () => {
    expect(cn("text-button", "text-sm")).toBe("text-sm");
    expect(cn("text-sm", "text-body")).toBe("text-body");
  });

  it("reads the named leading and tracking steps as their own groups", () => {
    expect(cn("leading-tight", "leading-display")).toBe("leading-display");
    expect(cn("text-3xl leading-display")).toBe("text-3xl leading-display");
    expect(cn("tracking-wider", "tracking-ref")).toBe("tracking-ref");
    expect(cn("tracking-display", "tracking-normal")).toBe("tracking-normal");
  });

  it("keeps a leading written before a size, as the browser does", () => {
    // The stock merge drops it; a Tailwind 4 size only falls back to its own
    // line height, so the browser keeps the leading wherever it is written.
    expect(twMerge("leading-tight text-3xl")).toBe("text-3xl");
    expect(cn("leading-tight text-3xl")).toBe("leading-tight text-3xl");
    expect(cn("leading-display text-3xl")).toBe("leading-display text-3xl");
    expect(cn("leading-body", "text-sm")).toBe("leading-body text-sm");
  });

  it("lets a size that names its own leading replace an earlier one", () => {
    expect(cn("leading-body", "text-sm/6")).toBe("text-sm/6");
    expect(cn("text-sm/6", "leading-body")).toBe("text-sm/6 leading-body");
  });

  it("knows every --text, --leading and --tracking token in the theme", () => {
    const text = names("text");
    const leading = names("leading");
    const tracking = names("tracking");
    expect(text.length).toBeGreaterThan(0);
    for (const name of text)
      expect(cn(`text-${name}`, "text-paper")).toBe(`text-${name} text-paper`);
    for (const name of leading)
      expect(cn(`leading-${name}`, "leading-none")).toBe("leading-none");
    for (const name of tracking)
      expect(cn(`tracking-${name}`, "tracking-normal")).toBe("tracking-normal");
  });
});
