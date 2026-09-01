"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api/client";
import { CACHE, qk } from "@/lib/query/policy";
import {
  CHECKOUT_WINDOW_DAYS,
  marketDateRange,
} from "@/lib/booking/availability-window";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { ErrorState, LoadingState, Skeleton } from "@/components/states";

/**
 * T6/T7 — checkout for one departure.
 *
 * Client-rendered: it holds a live countdown and an idempotency key, and there
 * is nothing here worth prerendering or caching. The route above it is a
 * server component purely so the page can be marked noindex — a `"use client"`
 * module may not export `metadata`, and a crawlable checkout URL was the bug
 * that split these two files apart.
 *
 * The slot is read fresh rather than passed through navigation state. A seat
 * count carried from the previous screen is a seat count that was true when
 * that screen rendered, and checkout is the one place that distinction costs
 * money.
 */
export function BookScreen({ slug }: { slug: string }) {
  const slotId = useSearchParams().get("slot");

  const experience = useQuery({
    queryKey: qk.experience(slug),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET("/experiences/{slug}", {
        params: { path: { slug } },
        signal,
      });
      if (error) throw error;
      return data;
    },
    ...CACHE.getExperience,
  });

  const availability = useQuery({
    queryKey: qk.availabilityForCheckout(slug, slotId ?? ""),
    enabled: Boolean(slotId),
    queryFn: async ({ signal }) => {
      // The shared window, not arithmetic repeated here. CHECKOUT_WINDOW_DAYS
      // is wider than the picker's on purpose — a `?slot=` URL survives a
      // bookmark and can name a departure the picker never showed.
      const { from, to } = marketDateRange(CHECKOUT_WINDOW_DAYS);
      const { data, error } = await api.GET(
        "/experiences/{slug}/availability",
        { params: { path: { slug }, query: { from, to } }, signal },
      );
      if (error) throw error;
      return data;
    },
    ...CACHE.getAvailability,
  });

  if (!slotId) {
    return (
      <Shell>
        <ErrorState
          error={new Error("No departure chosen")}
          onRetry={undefined}
        />
        <p className="mt-4 text-center">
          <Link href={`/e/${slug}`} className="label text-terra-deep underline">
            Pick a day
          </Link>
        </p>
      </Shell>
    );
  }

  if (experience.isPending || availability.isPending) {
    return (
      <Shell>
        <LoadingState label="Loading checkout">
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </LoadingState>
      </Shell>
    );
  }

  if (experience.isError) {
    return (
      <Shell>
        <ErrorState
          error={experience.error}
          onRetry={() => void experience.refetch()}
        />
      </Shell>
    );
  }
  if (availability.isError) {
    return (
      <Shell>
        <ErrorState
          error={availability.error}
          onRetry={() => void availability.refetch()}
        />
      </Shell>
    );
  }

  const slot = availability.data.slots.find((s) => s.id === slotId);

  // The departure went while they were deciding, or the link is stale. Say so
  // plainly rather than rendering a checkout that will refuse them.
  if (!slot || slot.status !== "open" || slot.remainingDisplay === "Full") {
    return (
      <Shell>
        <div className="rounded-edge border-cream-line bg-cream-deep border p-5">
          <p className="text-sm font-bold">That departure is no longer open</p>
          <p className="text-forest/70 mt-1.5 text-sm">
            It may have filled up or passed its cutoff while you were deciding.
            Nothing has been charged.
          </p>
          <Link
            href={`/e/${slug}`}
            className="rounded-edge label bg-forest text-cream mt-4 inline-flex h-11 items-center px-5 font-bold"
          >
            Pick another day
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="eyebrow text-terra-deep">{experience.data.title}</p>
      <h1 className="font-display tracking-display mt-3 text-3xl leading-tight">
        {slot.localStartTime.slice(0, 5)} on{" "}
        {new Intl.DateTimeFormat("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "Asia/Kolkata",
        }).format(new Date(`${slot.localDate}T12:00:00+05:30`))}
      </h1>
      <div className="mt-8">
        <CheckoutForm experience={experience.data} slot={slot} />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-cream text-forest min-h-full">
      <div className="container-page max-w-xl py-8">{children}</div>
    </div>
  );
}
