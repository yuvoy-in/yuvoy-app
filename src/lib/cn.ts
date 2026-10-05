import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
  tailwind-merge only knows Tailwind's default theme. It reads any `text-*` it
  does not recognise as a COLOUR, so without this `cn("text-button",
  "text-paper")` silently dropped `text-button` and the button fell back to the
  inherited size. These are the named steps of the @theme block in
  src/app/globals.css; a new `--text-*`, `--leading-*` or `--tracking-*` token
  belongs here too, and cn.test.ts holds the list to it.

  The override is the second half of the same trap. By default a size
  removes any `leading-*` written before it, but in Tailwind 4 a size only
  supplies a fallback line height (`var(--tw-leading, ...)`), so the browser
  keeps an explicit leading wherever it sits. The prettier plugin sorts the
  theme's own steps ahead of Tailwind's, so `leading-display` always lands
  before `text-3xl`, and the default merge dropped every headline's leading
  the moment its classes passed through cn. A size that names its own leading
  (`text-sm/6`) is an explicit line height, so between it and a `leading-*`
  the later still wins, which is the promise cn makes.
*/
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["label", "button", "body"],
      leading: ["display", "body"],
      tracking: ["wordmark", "display", "ref"],
    },
  },
  override: {
    conflictingClassGroups: { "font-size": [] },
  },
});

/**
 * Merge Tailwind classes safely — later classes win over conflicting earlier
 * ones (e.g. `cn("px-2", condition && "px-4")` resolves to `px-4`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
