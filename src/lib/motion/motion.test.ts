import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EASE } from ".";

/**
 * The curves exist twice: as `--ease-*` tokens in the stylesheet (what CSS
 * transitions use) and as strings here (what a Web Animations call needs,
 * because it cannot read `var()`). Two copies of a value drift; this is what
 * keeps them one.
 */
describe("the motion tokens", () => {
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");
  const theme = css.slice(
    css.indexOf("@theme {"),
    css.indexOf("\n}", css.indexOf("@theme {")),
  );

  it.each(Object.entries(EASE))(
    "--ease-%s matches the stylesheet",
    (name, value) => {
      const m = new RegExp(`--ease-${name}:\\s*([^;]+);`).exec(theme);
      expect(m, `--ease-${name} is missing from @theme`).not.toBeNull();
      const squash = (v: string) => v.replace(/\s+/g, "");
      expect(squash(m![1])).toBe(squash(value));
    },
  );
});
