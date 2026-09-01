import type { Metadata } from "next";

/**
 * Route-level identity, built in one place.
 *
 * Every indexable route describes itself: its own canonical, its own Open
 * Graph title, description and URL, its own Twitter card. That sounds obvious
 * and it is exactly what was missing — routes defined `title` and
 * `description` and inherited the ROOT's Open Graph, so every shared link
 * from a guide, an experience or search previewed as the homepage. The page
 * was right and the thing people actually see was wrong.
 *
 * One builder rather than a convention, because a convention is what produced
 * six routes each doing a different subset of this, and `pnpm qa` fails an
 * indexable page that does not come through here.
 */

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.yuvoy.in";

export const SITE_NAME = "Yuvoy";

/** Stable JSON-LD node ids, so nodes can reference each other by @id rather
 *  than by repeating themselves. */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

/**
 * The share card, named on every route.
 *
 * `opengraph-image.tsx` is a file convention, and a file convention applies to
 * the segment it sits in — the root — and to children that do not declare
 * their own `openGraph`. Every route here declares one, so without naming the
 * image explicitly a link shared from a guide or an experience previewed as a
 * bare link with no card at all. The homepage had one and nothing else did,
 * which is the version of this bug nobody notices.
 */
const SHARE_CARD = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Yuvoy — Experience More.",
  type: "image/png",
};

export interface PageMeta {
  title: string;
  description: string;
  /** Path from the root, with a leading slash and no origin. */
  path: string;
  /** `article` unlocks `modifiedTime`; everything else is a `website`. */
  type?: "website" | "article";
  /** ISO date. Only meaningful on an article. */
  modifiedTime?: string;
  /**
   * Skip the layout's `%s · Yuvoy` title template.
   *
   * For the one page whose title already IS the brand — the feed. Without it
   * the homepage reads "Yuvoy — Experience More. · Yuvoy".
   */
  absoluteTitle?: boolean;
}

export function pageMetadata({
  title,
  description,
  path,
  type = "website",
  modifiedTime,
  absoluteTitle = false,
}: PageMeta): Metadata {
  const url = new URL(path, SITE_URL).toString();

  /*
    og:title is the bare page title, not the "%s · Yuvoy" template the <title>
    uses. `siteName` already carries the brand in a share preview, and a card
    reading "Diving in Havelock · Yuvoy — Yuvoy" is the template leaking into
    a surface that has its own slot for it.
  */
  const common = {
    title,
    description,
    url,
    siteName: SITE_NAME,
    locale: "en_IN",
    images: [SHARE_CARD],
  };

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph:
      type === "article"
        ? { ...common, type: "article", modifiedTime }
        : { ...common, type: "website" },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SHARE_CARD],
    },
  };
}
