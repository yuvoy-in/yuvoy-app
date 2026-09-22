import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { allGuides, getGuide, publishedGuides } from "@/lib/guides/guides";
import { articleJsonLd, breadcrumbJsonLd } from "@/lib/site/structured-data";
import { JsonLd } from "@/components/site/json-ld";
import { pageMetadata } from "@/lib/site/metadata";
import { robotsMeta, unpublishedRobotsMeta } from "@/lib/site/indexing";
import { Screen } from "@/components/chrome/screen";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

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
    /*
      A draft or a record still in review renders (a reviewer has to be able
      to read one) but it is never indexable, whatever the site-wide switch
      says.

      A published guide takes the app default, `robotsMeta`, SAID HERE rather
      than left to inherit. This used to be `undefined`, on the reading that
      an undefined key inherits the layout's value; a key this function
      returns replaces the layout's instead, so every live guide rendered no
      robots tag at all, and with it lost the `max-image-preview` and
      `max-snippet` directives the default exists to carry. Guarded in
      `metadata.test.ts`.
    */
    robots: indexable ? robotsMeta : unpublishedRobotsMeta,
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
    <Screen
      back={{ href: "/guides", label: "guides" }}
      stageLabel="Guide"
      width="lg"
    >
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

      <article>
        {guide.status !== "published" ? (
          <Panel tone="alert" role="status" className="mb-8 px-4 py-3 text-xs">
            This guide is <strong>{guide.status}</strong>. It is not indexed and
            does not appear in the guides list.
          </Panel>
        ) : null}

        <p className="eyebrow text-terra-deep">Guide</p>
        <h1 className="font-display tracking-display mt-4 text-4xl leading-[1.05]">
          {guide.title}
        </h1>
        <p className="text-forest/70 mt-4 text-base">{guide.description}</p>

        {guide.hero ? (
          <figure className="mt-8">
            {/*
              Not `next/image`: the source is a repo path served from public/,
              the guide layout is a single fixed column, and the loader's
              benefit here is smaller than the cost of a component that fails
              silently when a file is missing. The build already refuses a
              published guide whose hero is not on disk.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/*
              EAGER, and `fetchPriority="high"`, where it was `loading="lazy"`.

              This is the guide's largest element and it sits directly under
              the title, so it is the page's LCP on every viewport that shows
              more than the headline. Lazy-loading it defers the one image the
              page is judged on: the browser's preload scanner skips a lazy
              image and only fetches it after layout confirms it is on screen,
              which is later than it needed to be. Lazy is right for images
              below the fold, and this is not one.
            */}
            <img
              src={guide.hero.src}
              alt={guide.hero.alt}
              className="rounded-card w-full"
              fetchPriority="high"
              decoding="async"
            />
            {/*
              The credit is rendered, not merely recorded. A rights note that
              lives only in frontmatter is a note nobody can check from the
              page, and the people most likely to check are the ones whose
              photograph it is.
            */}
            {/*
              `/70`, not `/60`. §1's opacity ladder: below `forest/70` (5.14:1)
              text is decoration, and a rights credit is the one caption on the
              page somebody may genuinely need to read.
            */}
            <figcaption className="text-forest/70 mt-2 text-xs">
              {guide.hero.credit}
            </figcaption>
          </figure>
        ) : null}

        <div className="guide-prose mt-10">
          <MDXRemote source={guide.body} />
        </div>

        {/* Every factual claim traceable to something we can point at. */}
        {guide.sources?.length ? (
          <section className="border-paper-line mt-12 border-t pt-6">
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
            className="border-paper-line mt-10 border-t pt-6"
          >
            <h2 className="label text-forest/75">Read next</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {related.map((g) => (
                <li key={g.slug}>
                  <ButtonLink
                    href={`/guides/${g.slug}`}
                    variant="outline"
                    size="sm"
                    className="tracking-normal normal-case"
                  >
                    {g.title}
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </article>
    </Screen>
  );
}
