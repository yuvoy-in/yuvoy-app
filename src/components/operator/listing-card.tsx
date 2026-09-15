import Image from "next/image";
import Link from "next/link";
import { formatFromPrice } from "@/lib/format/money";
import { ChevronRightIcon } from "@/components/ui/icons";
import type { OperatorProfile } from "@/lib/operator/use-operator";

/**
 * One listing a business runs, as a row.
 *
 * Lifted out of `operator-screen.tsx` for yuvoy-app#33: "What they run" is its
 * own page now, and the profile keeps only a door to it. The card is unchanged
 * — including the two rules it carries, which are the reason it is worth a
 * file of its own rather than being inlined into the page that uses it.
 */

export type OperatorListing = OperatorProfile["listings"][number];

/**
 * One thing they run.
 *
 * `bookable: false` means **show it and say so**, never hide it: "somebody
 * followed a link looking for a specific thing they saw; an emptier page with
 * no explanation is worse than a card marked 'Not available right now'."
 */
export function ListingCard({
  experience,
  bookable,
}: {
  experience: OperatorListing["experience"];
  bookable: boolean;
}) {
  const price = formatFromPrice(experience.fromPrice);

  return (
    <Link
      href={`/e/${experience.slug}`}
      className="rounded-card border-paper-line bg-paper-deep hover:border-forest/40 ease-interaction flex items-center gap-4 border p-3 pr-4 transition-colors duration-200"
    >
      <div className="rounded-tile bg-abyss relative h-24 w-18 shrink-0 overflow-hidden">
        <Poster url={experience.heroMedia?.posterUrl} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{experience.title}</p>
        <p className="text-forest/70 mt-1 text-xs">
          {experience.location ?? "Andaman"}
        </p>
        <p className="mt-2 text-sm font-bold">
          {price ?? (
            <span className="text-forest/70 font-normal">Price on request</span>
          )}
        </p>
        {/*
          `nextAvailable` absent means "no dates in the next 90 days", the same
          as on the feed. It is a meaningful value rather than a missing one,
          so it gets a sentence rather than a blank.
        */}
        <p className="text-forest/70 mt-1 text-xs">
          {!bookable
            ? "Not available right now"
            : (experience.nextAvailable ?? "No dates in the next 90 days")}
        </p>
      </div>
      <ChevronRightIcon className="text-forest/70 size-5 shrink-0" />
    </Link>
  );
}

/** A poster, or the dark tile that stands in for one. */
function Poster({ url }: { url?: string }) {
  if (!url) return null;
  return (
    <Image
      src={url}
      alt=""
      fill
      sizes="(max-width: 640px) 33vw, 200px"
      className="object-cover"
      unoptimized={url.startsWith("data:")}
    />
  );
}
