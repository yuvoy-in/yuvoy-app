"use client";

import { useParams } from "next/navigation";
import { SheetSkeleton } from "@/components/states/route-skeletons";
import { PicturePlaceholder } from "@/components/chrome/picture-strip";

/**
 * Checkout with nothing to show yet, in ONE shape for every moment it can be
 * seen: the route's boundary while the page is fetched, the page's own
 * Suspense fallback, and the screen waiting for its listing.
 *
 * It was three. A tap on Book drew a generic sheet with no Back, then a
 * skeleton whose Back said "the dates", then the screen's own with "Back to
 * the listing" and a different body, so the header swapped twice before the
 * calendar came (stability audit, 6 Oct 2026). Now the frame is the screen's
 * from the first paint: its Back, its stage label, its picture's height.
 *
 */
export function CheckoutSkeleton({ slug }: { slug: string }) {
  return (
    <SheetSkeleton
      back={{ href: `/e/${slug}`, label: "the listing" }}
      stageLabel="Checkout"
      hero={<PicturePlaceholder />}
    />
  );
}

/** The same, for the route's boundary, which is handed no params. */
export function CheckoutRouteSkeleton() {
  const { slug } = useParams<{ slug: string }>();
  return <CheckoutSkeleton slug={slug} />;
}
