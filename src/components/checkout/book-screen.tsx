"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api/client";
import { CACHE, qk } from "@/lib/query/policy";
import {
  CHECKOUT_WINDOW_DAYS,
  marketDateRange,
} from "@/lib/booking/availability-window";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { slotIsOpen } from "@/lib/booking/slot-open";
import { clockOffsetMs } from "@/lib/booking/clock";
import { ErrorState, LoadingState, Skeleton } from "@/components/states";
import { Screen } from "@/components/chrome/screen";
import { Panel } from "@/components/ui/panel";
import { ButtonLink } from "@/components/ui/button";

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
  const back = { href: `/e/${slug}`, label: "the dates" };

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
      <Screen back={back} stageLabel="Checkout">
        <ErrorState
          error={new Error("No departure chosen")}
          onRetry={undefined}
        />
        <p className="text-center">
          <ButtonLink href={`/e/${slug}`} variant="outline">
            Pick a day
          </ButtonLink>
        </p>
      </Screen>
    );
  }

  if (experience.isPending || availability.isPending) {
    return (
      <Screen back={back} stageLabel="Checkout">
        <LoadingState label="Loading checkout">
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </LoadingState>
      </Screen>
    );
  }

  if (experience.isError) {
    return (
      <Screen back={back} stageLabel="Checkout">
        <ErrorState
          error={experience.error}
          onRetry={() => void experience.refetch()}
        />
      </Screen>
    );
  }
  if (availability.isError) {
    return (
      <Screen back={back} stageLabel="Checkout">
        <ErrorState
          error={availability.error}
          onRetry={() => void availability.refetch()}
        />
      </Screen>
    );
  }

  const slot = availability.data.slots.find((s) => s.id === slotId);
  // The server's clock at the moment these seats were read — see the picker.
  const now = availability.dataUpdatedAt + clockOffsetMs();

  // The departure went while they were deciding, or the link is stale. Say so
  // plainly rather than rendering a checkout that will refuse them.
  if (!slot || !slotIsOpen(slot, now)) {
    return (
      <Screen back={back} stageLabel="Checkout">
        <Panel>
          <p className="text-sm font-bold">That departure is no longer open</p>
          <p className="text-forest/70 mt-1.5 text-sm">
            It may have filled up or passed its cutoff while you were deciding.
            Nothing has been charged.
          </p>
          <ButtonLink href={`/e/${slug}`} className="mt-4">
            Pick another day
          </ButtonLink>
        </Panel>
      </Screen>
    );
  }

  return (
    <Screen back={back} stageLabel="Checkout">
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
      <div className="mt-8 flex flex-1 flex-col">
        <CheckoutForm experience={experience.data} slot={slot} />
      </div>
    </Screen>
  );
}
