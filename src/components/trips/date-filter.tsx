"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { CloseIcon } from "@/components/ui/icons";
import { dateLabel } from "@/lib/search/labels";

export interface DateRange {
  from?: string;
  to?: string;
}

/**
 * Narrowing Trips to a date range (yuvoy-app#38 item 2).
 *
 * Two `type="date"` inputs rather than the month calendar the search sheet
 * uses, and that is the issue's instruction rather than an oversight. The two
 * are asking different questions: search picks ONE departure day inside a
 * 90-day selling window, where this picks a span that may reach years back
 * through somebody's history. A month grid is the wrong shape for the second,
 * and the platform's own date picker already handles a decade of scrolling.
 *
 * The range is sent to the API as `from` and `to`, and applied to invited
 * trips in the client, because that endpoint takes no parameters.
 */
export function DateFilterSheet({
  range,
  onApply,
  onClose,
}: {
  range: DateRange;
  onApply: (next: DateRange) => void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(range.from ?? "");
  const [to, setTo] = useState(range.to ?? "");

  /*
    "To cannot be before From." Enforced with `min` so the browser's own picker
    greys out the impossible days, AND checked here, because `min` on a date
    input is advisory: a typed value can still violate it, and on some Android
    keyboards typing is the only way in.
  */
  const backwards = Boolean(from && to && to < from);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Filter by date"
      footer={
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setFrom("");
              setTo("");
              onApply({});
              onClose();
            }}
          >
            Clear
          </Button>
          <Button
            className="flex-1"
            disabled={backwards}
            onClick={() => {
              onApply({ from: from || undefined, to: to || undefined });
              onClose();
            }}
          >
            Apply
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field
          label="From"
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Field
          label="To"
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
          error={backwards ? "That is before the From date." : undefined}
        />
      </div>
    </Sheet>
  );
}

/** What the Dates button reads while a range is applied: "12 Sep to 20 Sep". */
export function dateRangeLabel(range: DateRange): string | null {
  const short = (date: string) => dateLabel(date).replace(/^\w+ /, "");
  if (range.from && range.to) {
    return `${short(range.from)} to ${short(range.to)}`;
  }
  if (range.from) return `From ${short(range.from)}`;
  if (range.to) return `Until ${short(range.to)}`;
  return null;
}

/** The applied range as a button with its own way off. */
export function DateFilterButton({
  range,
  onOpen,
  onClear,
}: {
  range: DateRange;
  onOpen: () => void;
  onClear: () => void;
}) {
  const label = dateRangeLabel(range);

  if (!label) {
    return (
      <Button variant="outline" size="sm" className="shrink-0" onClick={onOpen}>
        Dates
      </Button>
    );
  }

  /*
    Two controls, not one. The label opens the sheet to change the range and
    the x clears it, which is the same shape the search pills use: a filter
    whose only control reopens a sheet is one somebody has to go into to get
    out of.
  */
  return (
    <span className="border-forest/25 flex h-9 shrink-0 items-center gap-1 rounded-full border pr-1 pl-3 text-sm">
      <button type="button" onClick={onOpen} className="tap-target">
        {label}
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label}`}
        className="text-forest/70 hover:bg-forest/8 hover:text-forest ease-interaction flex size-11 shrink-0 items-center justify-center rounded-full transition-[background-color,color] duration-200"
      >
        <CloseIcon className="size-4" />
      </button>
    </span>
  );
}
