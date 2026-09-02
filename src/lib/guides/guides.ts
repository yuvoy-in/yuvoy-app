import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { guideFrontmatter, assertPublishable, type Guide } from "./schema";

/**
 * Reading guides off disk.
 *
 * Server-only — it touches the filesystem, so importing it from a client
 * component would pull `node:fs` into the browser bundle. `pnpm qa` fails the
 * build if that ever happens.
 */

const DIR = join(process.cwd(), "content", "guides");
const PUBLIC = join(process.cwd(), "public");

/** Whether a hero image is actually in `public/`. Passed to the review gate. */
const heroExists = (publicPath: string) =>
  existsSync(join(PUBLIC, publicPath.replace(/^\//, "")));

function readAll(): Guide[] {
  if (!existsSync(DIR)) return [];

  return readdirSync(DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((file) => {
      const slug = file.replace(/\.mdx$/, "");
      const raw = readFileSync(join(DIR, file), "utf8");
      const { data, content } = matter(raw);

      const parsed = guideFrontmatter.safeParse(data);
      if (!parsed.success) {
        // Fails the build, deliberately. A guide with broken frontmatter that
        // renders anyway is a guide that publishes something nobody checked.
        throw new Error(
          `content/guides/${file} has invalid frontmatter:\n${parsed.error.issues
            .map((i) => `  · ${i.path.join(".")}: ${i.message}`)
            .join("\n")}`,
        );
      }

      const guide: Guide = { ...parsed.data, slug, body: content };
      assertPublishable(guide, heroExists);
      return guide;
    });
}

/** Everything, including drafts. For local reading and the review gate. */
export function allGuides(): Guide[] {
  return readAll().sort((a, b) => b.updated.localeCompare(a.updated));
}

/** Only what may be indexed, linked or listed. */
export function publishedGuides(): Guide[] {
  return allGuides().filter((g) => g.status === "published");
}

export function getGuide(slug: string): Guide | null {
  return allGuides().find((g) => g.slug === slug) ?? null;
}

/**
 * Guides that link to nothing and are linked from nothing.
 *
 * An orphan is invisible to a crawler that arrives anywhere but the sitemap,
 * so this is surfaced as a build-time warning rather than left to be noticed
 * in a crawl three months later.
 */
export function orphanedGuides(): string[] {
  const published = publishedGuides();
  const linkedTo = new Set(published.flatMap((g) => g.related ?? []));
  return published
    .filter((g) => !linkedTo.has(g.slug) && !g.related?.length)
    .map((g) => g.slug);
}
