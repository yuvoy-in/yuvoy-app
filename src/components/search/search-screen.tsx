"use client";

import { useState, useDeferredValue } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { CACHE, qk } from "@/lib/query/policy";
import { formatFromPrice } from "@/lib/format/money";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from "@/components/states";
import { cn } from "@/lib/cn";
import { Field } from "@/components/ui/field";
import { marketDays, marketToday } from "@/lib/booking/availability-window";

/**
 * The Search tab — date-first discovery.
 *
 * The date pills are the point, not the text box. Somebody with three days on
 * an island is asking "what can I do on Thursday", not "show me everything
 * that mentions diving". `bookableOn` answers exactly that: only what can
 * actually be booked that day, in the market's timezone.
 *
 * ## Nothing is asked until something is asked for
 *
 * The contract is explicit: "An empty `q` returns **nothing**, not everything
 * — 'everything' is what the feed is for, and a search box that shows the
 * whole catalog when you clear it looks broken." For a month this screen
 * called `/search` with no `q` and no day the moment it mounted, and rendered
 * the catalogue it got back — from a mock that answered "everything". Against
 * the real API that default state is an empty list under nothing typed.
 *
 * So the default state is a prompt, and the query is enabled only once there
 * is a word or a day to search by. A day alone is a real question — "what is
 * bookable on Thursday" is not "everything" — and is sent without `q`.
 */

const DAYS_SHOWN = 10;

export function SearchScreen() {
  const [q, setQ] = useState("");
  const [bookableOn, setBookableOn] = useState<string | undefined>(undefined);
  // Keeps typing responsive on a mid-range Android without debounce timers.
  const deferredQ = useDeferredValue(q);

  const days = marketDays(DAYS_SHOWN);

  const term = deferredQ.trim();
  const asking = term.length > 0 || bookableOn !== undefined;

  const search = useQuery({
    queryKey: qk.search(term, bookableOn),
    enabled: asking,
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET("/search", {
        params: {
          query: {
            ...(term ? { q: term } : {}),
            ...(bookableOn ? { bookableOn } : {}),
          },
        },
        signal,
      });
      if (error) throw error;
      return data;
    },
    ...CACHE.search,
  });

  return (
    <div className="bg-cream text-forest min-h-full">
      <div className="container-page max-w-2xl py-6">
        <h1 className="font-display tracking-display text-3xl leading-tight">
          What is on
        </h1>

        <Field
          className="mt-5"
          label="Search experiences"
          labelHidden
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Diving, boats, Havelock…"
        />

        {/* Date first. The pills are the primary control. */}
        <div className="mt-4">
          <span className="label text-forest/75">Which day</span>
          <div
            className="mt-2.5 flex gap-2 overflow-x-auto pb-1"
            role="group"
            aria-label="Filter by day"
          >
            <DayPill
              label="Any day"
              selected={bookableOn === undefined}
              onSelect={() => setBookableOn(undefined)}
            />
            {days.map((d) => (
              <DayPill
                key={d}
                label={dayLabel(d)}
                selected={bookableOn === d}
                onSelect={() => setBookableOn(d)}
              />
            ))}
          </div>
        </div>

        <div className="mt-8">
          {!asking ? (
            <EmptyState
              title="Pick a day, or type a place or an activity"
              body="Search finds one thing. Everything that is on is in the feed."
              action={
                <Link
                  href="/"
                  className="label text-terra-deep tap-target underline underline-offset-2"
                >
                  Browse the feed
                </Link>
              }
            />
          ) : search.isPending ? (
            <LoadingState label="Searching">
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </LoadingState>
          ) : search.isError ? (
            <ErrorState
              error={search.error}
              onRetry={() => void search.refetch()}
            />
          ) : search.data.items.length === 0 ? (
            <EmptyState
              title={bookableOn ? "Nothing on that day" : "Nothing matches"}
              body={
                bookableOn
                  ? "No operator has a departure we can sell for that date. Try another day — the pills only show what is genuinely bookable."
                  : "Try a shorter word, or pick a day instead."
              }
            />
          ) : (
            <ul className="space-y-3">
              {search.data.items.map((e) => {
                const price = formatFromPrice(e.fromPrice);
                return (
                  <li key={e.id}>
                    <Link
                      href={`/e/${e.slug}`}
                      className="rounded-edge border-cream-line bg-cream-deep hover:border-forest/30 flex gap-4 border p-4 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{e.title}</p>
                        <p className="text-forest/70 mt-1 text-xs">
                          {e.location ?? "Andaman"} ·{" "}
                          {e.bookingMode === "allotment"
                            ? "Instant book"
                            : "Operator confirms"}
                        </p>
                        <p className="text-forest/70 mt-2 text-sm">
                          {price ?? "Price on request"}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function DayPill({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        // Rectangular at 2px like everything else — "pill" is the metaphor,
        // not the geometry. Pills are not part of this system.
        "rounded-edge min-h-11 shrink-0 border px-3.5 text-sm whitespace-nowrap",
        selected
          ? "border-forest bg-forest text-cream"
          : "border-cream-line bg-cream-deep",
      )}
    >
      {label}
    </button>
  );
}

function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00+05:30`);
  const today = marketToday();
  if (date === today) return "Today";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(d);
}
