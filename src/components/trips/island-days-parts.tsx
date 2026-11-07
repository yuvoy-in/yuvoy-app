"use client";

import Link from "@/components/ui/link";
import {
  MAX_RANGE_GAP_DAYS,
  bookableRange,
  filtersToParams,
} from "@/lib/search/filters";
import type { Stay } from "@/lib/trips/stay";
import type { StayHome } from "@/lib/trips/use-stay";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/states";

/*
  The small parts of the island days panel: the stay's search link, the line
  saying where the dates are kept, and a skeleton line. Moved out of
  island-days.tsx as they were, so it stays under 500 lines (yuvoy-app#243).
*/

/**
 * What runs on any day of the stay still to come, in one search
 * (yuvoy-api#258), beside the per-day links. Cut at the API's limit, and then
 * it says so rather than calling part of a stay the whole of it.
 */
export function StayLink({ stay, today }: { stay: Stay; today: string }) {
  const start = today > stay.from ? today : stay.from;
  const range = bookableRange(start, stay.to);
  if (!range) return null;
  const days = MAX_RANGE_GAP_DAYS + 1;
  return (
    <p className="mt-3 text-sm">
      <Link
        href={`/search?${filtersToParams({
          bookableFrom: range.bookableFrom,
          bookableTo: range.bookableTo,
        }).toString()}`}
        className="text-terra-deep tap-target font-bold underline"
      >
        {!range.cut
          ? "See what runs during your stay"
          : start === stay.from
            ? `See what runs in your first ${days} days`
            : `See what runs in your next ${days} days`}
      </Link>
    </p>
  );
}

/**
 * Where the days are kept, said under them. On the account they follow the
 * traveller to any phone they sign in on; on this phone they do not, and a
 * traveller who changes phones should not find that out by losing them.
 */
export function KeptLine({
  home,
  className,
}: {
  home: StayHome;
  className: string;
}) {
  return (
    <p className={cn("text-forest/70 text-xs", className)}>
      {home === "account"
        ? "Your dates are kept with your account."
        : "Your dates are kept on this phone."}
    </p>
  );
}

/** One line of text still to come, at the height of the line it stands for. */
export function SkeletonLine({ width }: { width: string }) {
  return (
    <div className="flex h-[1lh] items-center">
      <Skeleton className={cn("h-3 max-w-full", width)} />
    </div>
  );
}
