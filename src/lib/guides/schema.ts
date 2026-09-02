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

  /**
   * The lead image, and the three things it may not ship without.
   *
   * An object rather than three optional fields, so that **adding a picture
   * necessarily adds its alt text and its rights record**. Optional fields
   * would make the picture easy and the accountability easy to forget, which
   * is the wrong way round: `yuvoy-app#4` requires "confirmed rights and
   * meaningful alt text; no placeholder or copied media ships", and this is
   * that requirement expressed where it cannot be skipped.
   *
   * Same shape as `sources` and for the same reason. A guide is a published
   * claim under Yuvoy's name; an unlicensed photograph is one of the more
   * expensive kinds.
   */
  hero: z
    .object({
      /** Repo-relative, served from `public/`. Checked to exist at build. */
      src: z
        .string()
        .regex(
          /^\/[\w./-]+$/,
          "hero.src must be a path under public/, like /media/guides/x.jpg",
        ),
      /*
        Ten characters is not an arbitrary floor — it is above every
        placeholder anybody actually types. "image", "photo", "hero" and "img"
        all fail it, and a real description of a photograph does not.
      */
      alt: z.string().min(10, "hero.alt must describe the image, not name it"),
      /**
       * Who owns it and where the permission is recorded.
       *
       * Free text on purpose: "Shot by Yuvoy, Havelock, Aug 2026", a licence
       * number, or a photographer's name and the agreement reference are all
       * valid answers, and forcing a shape here would only make people write a
       * shape rather than an answer.
       */
      credit: z
        .string()
        .min(3, "hero.credit must say where the image came from"),
    })
    .optional(),
});

export type GuideFrontmatter = z.infer<typeof guideFrontmatter>;

export interface Guide extends GuideFrontmatter {
  slug: string;
  body: string;
}

/** Alt text that names the file rather than describing the picture. */
const PLACEHOLDER_ALT =
  /^(image|photo|picture|hero|banner|img|placeholder|guide( image)?)$/i;

/**
 * What the shape cannot express.
 *
 * `fileExists` is injected so this stays pure and testable — the caller passes
 * the filesystem, and a test passes a set.
 */
export function assertPublishable(
  guide: Guide,
  fileExists?: (publicPath: string) => boolean,
): void {
  if (guide.status !== "published") return;

  if (!guide.sources?.length) {
    throw new Error(
      `Guide "${guide.slug}" is published but cites no sources. Add \`sources:\` or set status to draft.`,
    );
  }

  if (guide.hero) {
    if (PLACEHOLDER_ALT.test(guide.hero.alt.trim())) {
      /*
        The schema's length floor catches "img"; this catches "guide image",
        which is long enough and says nothing. Alt text is read aloud to
        somebody who cannot see the photograph — "image" tells them only that
        they are missing something.
      */
      throw new Error(
        `Guide "${guide.slug}" has placeholder alt text ("${guide.hero.alt}"). Describe what is in the picture.`,
      );
    }

    /*
      A hero that 404s is a published page with a hole in it, and it is
      invisible in review because a missing image renders as nothing. Checked
      at BUILD, where it is somebody's job to fix, rather than in production
      where it is nobody's.
    */
    if (fileExists && !fileExists(guide.hero.src)) {
      throw new Error(
        `Guide "${guide.slug}" has hero.src "${guide.hero.src}", which is not in public/. A published guide cannot point at a file that is not there.`,
      );
    }
  }
}
