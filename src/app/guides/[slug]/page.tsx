import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import { allGuides, getGuide, publishedGuides } from "@/lib/guides/guides";
import { articleJsonLd, breadcrumbJsonLd } from "@/lib/site/structured-data";
import { JsonLd } from "@/components/site/json-ld";
import { pageMetadata } from "@/lib/site/metadata";
import { unpublishedRobotsMeta } from "@/lib/site/indexing";

/**
 * One guide. Statically generated, revalidated daily.
 *
 * Draft and review records DO render — a reviewer has to be able to read one —
 * but they are noindex and never appear in the index or the sitemap.
 */
export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  // Every record, including drafts, so a reviewer can open one locally.
  return allGuides().map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return { title: "Not found" };

  const indexable = guide.status === "published";

  return {
    ...pageMetadata({
      title: guide.title,
      description: guide.description,
      path: `/guides/${guide.slug}`,
      type: "article",
      modifiedTime: guide.updated,
    }),
    // A draft or a record still in review renders — a reviewer has to be able
    // to read one — but it is never indexable, whatever the site-wide switch
    // says. `undefined` inherits the app default rather than overriding it.
    robots: indexable ? undefined : unpublishedRobotsMeta,
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const related = publishedGuides().filter(
    (g) => guide.related?.includes(g.slug) && g.slug !== guide.slug,
  );

  return (
    <div className="bg-cream text-forest min-h-full">
      {/*
        Structured data is a CLAIM even though it is invisible, so it comes
        from an allowlisted builder rather than a literal — no ratings, no
        prices, no availability.
      */}
      <JsonLd node={articleJsonLd(guide)} />
      <JsonLd
        node={breadcrumbJsonLd([
          { name: "Yuvoy", path: "/" },
          { name: "Guides", path: "/guides" },
          { name: guide.title, path: `/guides/${guide.slug}` },
        ])}
      />

      <article className="container-page max-w-2xl py-10">
        {guide.status !== "published" ? (
          <p
            role="status"
            className="rounded-edge border-terra-deep mb-8 border-l-2 px-4 py-3 text-xs"
          >
            This guide is <strong>{guide.status}</strong>. It is not indexed and
            does not appear in the guides list.
          </p>
        ) : null}

        <p className="eyebrow text-terra-deep">Guide</p>
        <h1 className="font-display tracking-display mt-4 text-4xl leading-[1.05]">
          {guide.title}
        </h1>
        <p className="text-forest/70 mt-4 text-base">{guide.description}</p>

        <div className="guide-prose mt-10">
          <MDXRemote source={guide.body} />
        </div>

        {/* Every factual claim traceable to something we can point at. */}
        {guide.sources?.length ? (
          <section className="border-cream-line mt-12 border-t pt-6">
            <h2 className="label text-forest/75">Where this comes from</h2>
            <ul className="text-forest/70 mt-3 space-y-1.5 text-sm">
              {guide.sources.map((s) => (
                <li key={s} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className="bg-terra mt-2 size-1 shrink-0"
                  />
                  {s}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {related.length ? (
          <nav
            aria-label="Related guides"
            className="border-cream-line mt-10 border-t pt-6"
          >
            <h2 className="label text-forest/75">Read next</h2>
            <ul className="mt-3 space-y-2">
              {related.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/guides/${g.slug}`}
                    className="text-terra-deep tap-target text-sm underline underline-offset-2"
                  >
                    {g.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </article>
    </div>
  );
}
