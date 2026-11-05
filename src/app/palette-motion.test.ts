import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");
/**
 * mocks/ is scanned too. An off-palette fixture is exactly how #0D3B3E — the
 * retired `teal` — reached the feed and was reported by the owner: the colour
 * lived in a data-URI in a fixture, which no `src`-only scan would ever see.
 */
const MOCKS = join(process.cwd(), "mocks");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? walk(full)
      : /\.(tsx?|css)$/.test(name) && !name.endsWith(".gen.ts")
        ? [full]
        : [];
  });
}

/**
 * Scan CODE, not prose.
 *
 * Comments in this codebase name the banned things constantly — the whole
 * point of a rule is that it is written down next to the thing it forbids.
 * A scanner that reads them flags every file that documents the rule, which
 * trains everyone to weaken the rule rather than obey it.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // block and JSDoc
    .replace(/(^|[^:])\/\/.*$/gm, "$1"); // line, but not a URL's //
}

const FILES = [...walk(SRC), ...walk(MOCKS)].filter(
  (f) => !/\.test\.tsx?$/.test(f),
);
const read = (f: string) => stripComments(readFileSync(f, "utf8"));
const rel = (f: string) => f.replace(process.cwd() + "/", "");

describe("measured contrast", () => {
  describe("the feed's scrims", () => {
    it("keeps every transition inside its own budget", () => {
      /*
        §3 of the design system splits motion in two: interaction feedback
        (≤250ms, `--ease-interaction`) and entrances (~1100ms,
        `--ease-cinematic`). Getting the pairing wrong is easy and the symptom
        is vague — the feed's retract shipped at 460ms of the cinematic curve,
        a fifth of a second of lag on a movement a traveller triggered with
        every swipe, and the marketing site's sliding header already had a
        ruling against exactly that.

        ## This test was scoped to one CSS block, and that was the bug in it

        It read `@layer components` in globals.css, because that is where the
        retract lived. yuvoy-app#36 deleted the retract and the assertion went
        from "four transitions, all inside budget" to "zero transitions, all
        inside budget" — which passes. A scoped check over an empty set is the
        quietest way for a rule to stop being enforced, so the
        `toBeGreaterThan` below is doing real work and is the only reason the
        deletion was noticed at all.

        It now reads where the rule can actually be broken: the Tailwind pairs
        in component source, which is every transition in the app bar one, and
        any `Nms var(--ease-…)` still written by hand in CSS.
      */
      const budget: [string, number, string][] = [];

      for (const file of FILES.filter((f) => f.endsWith(".tsx"))) {
        const src = read(file);
        // Each class-ish string literal, so a `duration-` is only ever paired
        // with an ease in the SAME className.
        for (const [literal] of src.matchAll(/"[^"\n]*"|`[^`\n]*`/g)) {
          const ease = /\bease-(interaction|cinematic|move|exit)\b/.exec(
            literal,
          );
          const ms = /\bduration-(\d+)\b/.exec(literal);
          if (ease && ms) budget.push([rel(file), Number(ms[1]), ease[1]]);
        }
      }

      for (const [whole, ms, ease] of read(
        join(SRC, "app/globals.css"),
      ).matchAll(/(\d+)ms var\(--ease-([a-z]+)\)/g)) {
        budget.push([whole, Number(ms), ease]);
      }

      expect(
        budget.length,
        "no transitions found to check — the scan is looking in the wrong place",
      ).toBeGreaterThan(3);

      for (const [where, ms, ease] of budget) {
        if (ease === "interaction" || ease === "move" || ease === "exit") {
          /*
            Answering, moving between two places on screen, and leaving
            (the motion system, approved 4 Oct 2026) all live in the
            interaction budget.
          */
          expect(
            ms,
            `${where}: ${ease} motion over budget`,
          ).toBeLessThanOrEqual(250);
        } else if (ease === "cinematic") {
          /*
            Travel: a screen or a picture going somewhere (350ms) or the one
            authored moment in a flow (450ms). Anything this slow answering a
            gesture is the defect above; anything this fast is not travel and
            belongs on the interaction curve; anything slower than the moment
            budget is a drag (the owner's spatial budget, 4 Oct 2026).
          */
          expect(
            ms,
            `${where}: cinematic motion too brief to be travel`,
          ).toBeGreaterThan(250);
          expect(
            ms,
            `${where}: cinematic motion over the moment budget`,
          ).toBeLessThanOrEqual(450);
        }
      }
    });

    it("lets every press animate the property it presses with", () => {
      /*
        Tailwind 4 writes `active:scale-*` to the standalone `scale` property.
        Every press in the app used to sit beside a transition list naming
        only `transform`, so all of them snapped in and snapped back, and no
        test noticed because each class string looked right on its own
        (found by the motion study, 4 Oct 2026). A press must share its
        string with a list that names `scale`: one of the motion utilities,
        `transition-transform` (which covers translate, scale and rotate in
        Tailwind 4), or an explicit list.
      */
      let presses = 0;
      for (const file of FILES.filter((f) => f.endsWith(".tsx"))) {
        const src = read(file);
        for (const [literal] of src.matchAll(/"[^"\n]*"|`[^`\n]*`/g)) {
          if (!/\bactive:scale-/.test(literal)) continue;
          presses += 1;
          const animates =
            /\bmotion-(control|disc)\b/.test(literal) ||
            /\btransition-transform\b/.test(literal) ||
            /\btransition-\[[^\]]*\bscale\b/.test(literal);
          expect(
            animates,
            `${rel(file)}: "${literal.slice(1, 80)}" presses with a scale nothing animates`,
          ).toBe(true);
        }
      }
      expect(
        presses,
        "no presses found: the scan is looking in the wrong place",
      ).toBeGreaterThan(2);
    });

    it("loops only where something is honestly still working", () => {
      /*
        "No loops but honest progress" (the motion system, approved 4 Oct
        2026). Three things in the app turn or breathe until they are done:
        a skeleton, a working button's ring and a slow reel's ring, each
        drawn only while its wait lasts. Anything else that loops is
        decoration that never stops, which is how `animate-spin` and the
        skeleton's repainting sweep shipped before the study. A new loop is
        added here, by name and on purpose, or not at all.
      */
      const allowed = new Set([
        "skeleton-breath",
        "button-ring-turn",
        "feed-ring-turn",
      ]);
      const keywords = new Set([
        "linear",
        "ease",
        "ease-in",
        "ease-out",
        "ease-in-out",
        "step-start",
        "step-end",
        "infinite",
        "none",
        "both",
        "forwards",
        "backwards",
        "normal",
        "reverse",
        "alternate",
        "alternate-reverse",
        "running",
        "paused",
        "auto",
      ]);
      /** A list's members, split at the commas outside any parentheses. */
      const members = (value: string) => {
        const out: string[] = [];
        let depth = 0;
        let from = 0;
        for (let i = 0; i < value.length; i++) {
          if (value[i] === "(") depth += 1;
          else if (value[i] === ")") depth -= 1;
          else if (value[i] === "," && depth === 0) {
            out.push(value.slice(from, i));
            from = i + 1;
          }
        }
        return [...out, value.slice(from)];
      };
      const css = read(join(SRC, "app/globals.css"));
      const loops = [...css.matchAll(/\banimation:\s*([^;]+);/g)]
        .flatMap(([, value]) => members(value))
        .filter((one) => /\binfinite\b/.test(one))
        .map(
          (one) =>
            one
              .trim()
              .split(/\s+/)
              .find((t) => /^[a-z][a-z0-9-]*$/.test(t) && !keywords.has(t)) ??
            one.trim(),
        );
      expect(
        loops.length,
        "no loops found: the scan is looking in the wrong place",
      ).toBeGreaterThan(2);
      for (const name of loops)
        expect(allowed.has(name), `globals.css: "${name}" loops`).toBe(true);

      for (const file of FILES.filter(
        (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
      )) {
        const src = read(file);
        expect(
          /\banimate-(spin|pulse|ping|bounce)\b/.test(src),
          `${rel(file)}: a Tailwind loop`,
        ).toBe(false);
        expect(
          /\biterations:\s*Infinity\b/.test(src),
          `${rel(file)}: a scripted loop`,
        ).toBe(false);
        expect(
          /\banimation[A-Za-z]*\s*:\s*["'`][^"'`]*\binfinite\b/.test(src),
          `${rel(file)}: an inline loop`,
        ).toBe(false);
      }
    });
  });
});
