import type { OrganiserPageForm } from "./organisers";

/**
 * The page form's link rows against the API's `links.N` (yuvoy-app#224).
 * Split out of `organisers.ts` to keep it short.
 */

/** The form's link rows `organiserInput` sends, in order: every row with an address. */
export function sentLinkRows(
  form: Pick<OrganiserPageForm, "links">,
): number[] {
  return form.links.flatMap((link, row) => (link.url.trim() ? [row] : []));
}

/**
 * The API's field sentences with each `links.N` moved to the row it names on
 * screen. The API counts N over the links it was sent, and blank rows are not
 * sent, so `sent` (from `sentLinkRows`) maps one to the other. A link index
 * that was never sent goes under the links as a whole.
 */
export function onLinkRows(
  fields: Readonly<Record<string, string>>,
  sent: readonly number[],
): Record<string, string> {
  const moved: Record<string, string> = {};
  for (const [key, sentence] of Object.entries(fields)) {
    const at = /^links\.(\d+)$/.exec(key);
    const row = at ? sent[Number(at[1])] : undefined;
    if (!at) moved[key] = sentence;
    else if (row !== undefined) moved[`links.${row}`] = sentence;
    else moved.links ??= sentence;
  }
  return moved;
}
