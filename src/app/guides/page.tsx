import type { Metadata } from "next";
import Link from "next/link";
import { publishedGuides } from "@/lib/guides/guides";
import { pageMetadata } from "@/lib/site/metadata";
import { breadcrumbJsonLd } from "@/lib/site/structured-data";
import { JsonLd } from "@/components/site/json-ld";
import { Screen } from "@/components/chrome/screen";
import { ChevronRightIcon } from "@/components/ui/icons";

export const metadata: Metadata = pageMetadata({
  title: "Guides to the Andamans",
  description:
    "What to know before you go: diving, islands, seasons and getting around the Andamans.",
  path: "/guides",
});

/**
 * The guides hub.
 *
 * It exists so no guide is an orphan. A page reachable only from the sitemap
 * is invisible to a crawler that arrives anywhere else, and to a reader who
 * arrives on one guide and wants another.
 */
export default function GuidesIndexPage() {
  const guides = publishedGuides();

  return (
    <Screen width="lg">
      <JsonLd
        node={breadcrumbJsonLd([
          { name: "Yuvoy", path: "/" },
          { name: "Guides", path: "/guides" },
        ])}
      />
      <p className="eyebrow text-terra-deep">Guides</p>
      <h1 className="font-display tracking-display mt-4 text-4xl leading-[1.05]">
        What to know before you go
      </h1>
      <p className="text-forest/70 mt-4 max-w-prose text-base">
        Written by people who live here, checked against something we can point
        at. No prices, no availability — those live on the experience pages,
        where they are real.
      </p>

      {guides.length === 0 ? (
        <p className="text-forest/70 mt-10 text-sm">Nothing published yet.</p>
      ) : (
        <ul className="mt-10 space-y-3">
          {guides.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/guides/${g.slug}`}
                className="rounded-card border-cream-line bg-cream-deep hover:border-forest/40 ease-interaction flex items-center gap-4 border p-5 transition-colors duration-200"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-2xl leading-tight">
                    {g.title}
                  </h2>
                  <p className="text-forest/70 mt-2 text-sm">{g.description}</p>
                  <p className="text-forest/70 mt-3 text-xs">
                    Updated{" "}
                    {new Intl.DateTimeFormat("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      timeZone: "Asia/Kolkata",
                    }).format(new Date(`${g.updated}T12:00:00+05:30`))}
                  </p>
                </div>
                <ChevronRightIcon className="text-forest/70 size-5 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
