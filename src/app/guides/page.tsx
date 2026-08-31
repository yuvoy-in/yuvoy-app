import type { Metadata } from "next";
import Link from "next/link";
import { publishedGuides } from "@/lib/guides/guides";

export const metadata: Metadata = {
  title: "Guides to the Andamans",
  description:
    "What to know before you go: diving, islands, seasons and getting around the Andamans.",
};

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
    <div className="bg-cream text-forest min-h-full">
      <div className="container-page max-w-2xl py-10">
        <p className="eyebrow text-terra-deep">Guides</p>
        <h1 className="font-display tracking-display mt-4 text-4xl leading-[1.05]">
          What to know before you go
        </h1>
        <p className="text-forest/70 mt-4 max-w-prose text-base">
          Written by people who live here, checked against something we can
          point at. No prices, no availability — those live on the experience
          pages, where they are real.
        </p>

        {guides.length === 0 ? (
          <p className="text-forest/70 mt-10 text-sm">Nothing published yet.</p>
        ) : (
          <ul className="border-cream-line mt-10 border-t">
            {guides.map((g) => (
              <li key={g.slug} className="border-cream-line border-b">
                <Link
                  href={`/guides/${g.slug}`}
                  className="hover:bg-cream-deep block py-6 transition-colors"
                >
                  <h2 className="font-display text-2xl leading-tight">
                    {g.title}
                  </h2>
                  <p className="text-forest/70 mt-2 text-sm">{g.description}</p>
                  <p className="text-forest/50 mt-3 text-xs">
                    Updated{" "}
                    {new Intl.DateTimeFormat("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      timeZone: "Asia/Kolkata",
                    }).format(new Date(`${g.updated}T12:00:00+05:30`))}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
