/**
 * Free text somebody typed into a textarea, as the paragraphs they meant.
 *
 * A listing's `description` and `safetyNotes`, and a business's `about`, are
 * all typed into the operator portal — so the newlines in them are the
 * author's paragraph breaks, and one run-on block is not what they wrote. Runs
 * of blank lines collapse to one break, which is what somebody leaning on the
 * return key meant.
 *
 * Empty means nothing to render. Whitespace-only counts as empty — the rule
 * the API's publish gate applies — and so do `null` and anything that is not a
 * string, so a caller that draws a heading only when this is non-empty can
 * never draw one over a blank.
 */
import { dedash } from "./dedash";

export function paragraphsOf(text: unknown): string[] {
  if (typeof text !== "string") return [];
  return text
    .split(/\r?\n/)
    .map((line) => dedash(line.trim()))
    .filter(Boolean);
}
