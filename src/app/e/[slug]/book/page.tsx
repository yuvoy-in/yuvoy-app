import { Suspense } from "react";
import type { Metadata } from "next";
import { BookScreen } from "@/components/checkout/book-screen";
import { LoadingState, Skeleton } from "@/components/states";
import { Screen } from "@/components/chrome/screen";
import { gatedRoute } from "@/components/auth/gated-route";
import { privateRobotsMeta } from "@/lib/site/indexing";

/**
 * T6/T7 — checkout, as a route.
 *
 * A server shell around a client screen, for one reason: a `"use client"`
 * module may not export `metadata`, so while this file was the client
 * component it could not say `noindex` — and checkout is a URL with a `?slot=`
 * on it that must never be crawled, indexed or shared as a result. It was
 * inheriting the app default, which flips to `index` at launch.
 *
 * Nothing is fetched here on purpose. Every number on this screen — the seat
 * count above all — has to be read at the moment of checkout, not baked into
 * a server render that a traveller might sit on for a minute.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: privateRobotsMeta,
};

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;

  /*
    Behind the invite gate when it is on (yuvoy-api#195), and that is also
    the end of guest checkout: the form is only rendered for an admitted
    number, so signing in and entering a code come before it. Every Book
    control in the app leads here, which is why none of them needs a gate of
    its own.
  */
  return gatedRoute({
    purpose: "book",
    searchParams,
    back: { href: `/e/${slug}`, label: "the listing" },
    stageLabel: "Checkout",
    content: () => (
      /*
        `useSearchParams` needs a boundary above it. The fallback is the same
        skeleton the screen shows while its own queries resolve, so a slow
        navigation and a slow fetch look like one continuous state rather than
        two different loading screens.
      */
      <Suspense fallback={<CheckoutSkeleton slug={slug} />}>
        <BookScreen slug={slug} />
      </Suspense>
    ),
  });
}

function CheckoutSkeleton({ slug }: { slug: string }) {
  return (
    <Screen
      back={{ href: `/e/${slug}`, label: "the dates" }}
      stageLabel="Checkout"
    >
      <LoadingState label="Loading checkout">
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </LoadingState>
    </Screen>
  );
}
