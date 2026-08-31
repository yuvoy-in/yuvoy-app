import { z } from "zod";

/**
 * The guide record.
 *
 * Frontmatter is validated rather than trusted. A guide is a published claim
 * about the Andamans under Yuvoy's name, and this project's standing rule is
 * that nothing is published which is not backed by a source — so `sources` is
 * required on anything that reaches the index, and a record that fails
 * validation fails the BUILD rather than rendering half-formed.
 */

export const GUIDE_STATUS = ["draft", "review", "published"] as const;

export const guideFrontmatter = z.object({
  title: z.string().min(8).max(70),
  /** Used verbatim as the meta description, so it is length-bounded here. */
  description: z.string().min(50).max(160),

  /**
   * Only `published` reaches the sitemap, the index or search engines.
   * Draft and review render locally so they can be read, and are noindex.
   */
  status: z.enum(GUIDE_STATUS),

  /** ISO date. Drives lastModified in the sitemap. */
  /**
   * ISO date. Drives lastModified in the sitemap.
   *
   * Normalised rather than merely validated. YAML parses an unquoted
   * `2026-08-31` into a Date and a quoted one into a string, so an author
   * writing perfectly correct frontmatter could fail the build depending on
   * whether they reached for quotes. Accept both, store one shape.
   */
  updated: z
    .union([z.string(), z.date()])
    .transform((v) =>
      v instanceof Date ? v.toISOString().slice(0, 10) : v.trim(),
    )
    .pipe(
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "updated must be YYYY-MM-DD"),
    ),

  destinationKey: z.string().optional(),

  /**
   * Where the facts came from. Required on a published guide.
   *
   * Not decoration: this project removed a site that published invented
   * prices and unapproved operator names, and a guide is the easiest place
   * for that to happen again by accident.
   */
  sources: z.array(z.string().min(3)).optional(),

  /** Slugs of related guides. Prevents orphans — see the index page. */
  related: z.array(z.string()).optional(),
});

export type GuideFrontmatter = z.infer<typeof guideFrontmatter>;

export interface Guide extends GuideFrontmatter {
  slug: string;
  body: string;
}

/** A published guide must cite something. Enforced beyond the shape. */
export function assertPublishable(guide: Guide): void {
  if (guide.status !== "published") return;
  if (!guide.sources?.length) {
    throw new Error(
      `Guide "${guide.slug}" is published but cites no sources. Add \`sources:\` or set status to draft.`,
    );
  }
}
