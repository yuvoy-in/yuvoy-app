"use client";

import { cn } from "@/lib/cn";
import { YuvoyError } from "@/lib/api/errors";
import { FORM_GONE_WORDS, PEOPLE_CLOSED_WORDS } from "@/lib/groups/club-words";
import { PeopleClosedError } from "@/lib/groups/clubs";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

/**
 * Small parts the three group forms share (yuvoy-mobile#386): the reason
 * chips, the line under a form and the answer once it is sent.
 */

/** A reason a form offers: the contract's value, and its words. */
export type Reason<K extends string> = { key: K; label: string };

/** One reason picked from a few, each a toggle button with `aria-pressed`. */
export function ReasonChips<K extends string>({
  legend,
  reasons,
  value,
  onChange,
}: {
  legend: string;
  reasons: readonly Reason<K>[];
  value: K | null;
  onChange: (next: K) => void;
}) {
  return (
    <fieldset>
      <legend className="label text-forest/75">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {reasons.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={value === option.key}
            onClick={() => onChange(option.key)}
            className={cn(
              "rounded-control ease-interaction tap-target border px-3 py-2 text-left text-sm transition-colors duration-200",
              value === option.key
                ? "border-forest bg-forest text-paper"
                : "border-paper-line bg-paper text-forest hover:border-forest/40",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** A refusal under the form, said once to a screen reader. */
export function FormLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="text-terra-deep mt-4 text-sm text-pretty">
      {text}
    </p>
  );
}

/** The API's answer once a form is done, read out as it appears. */
export function FormSent({ text }: { text: string }) {
  return (
    <p role="status" className="text-body text-pretty">
      {text}
    </p>
  );
}

/**
 * What a form shows when a 404 means People closed or the group is gone. It
 * is not a receipt: the line is an alert, not a status, the sheet carries no
 * form title and no Done, and the one button leaves for the directory.
 */
export function FormGone({
  line,
  onLeave,
}: {
  line: string;
  onLeave: () => void;
}) {
  return (
    <Sheet
      open
      onClose={onLeave}
      title={FORM_GONE_WORDS.title}
      footer={
        <Button block onClick={onLeave}>
          {FORM_GONE_WORDS.back}
        </Button>
      }
    >
      <FormLine text={line} />
    </Sheet>
  );
}

/**
 * People is closed to this reader: a 404, and the release read again says so
 * (`PeopleClosedError`, from the hooks in `@/lib/groups/use-clubs`).
 */
export function isPeopleClosed(error: unknown): boolean {
  return error instanceof PeopleClosedError;
}

/** People closed, as a page: never an error, never the empty list. */
export function PeopleClosed() {
  return (
    <EmptyState
      title={PEOPLE_CLOSED_WORDS.title}
      body={PEOPLE_CLOSED_WORDS.body}
    />
  );
}

/** A 404 with People still open: the group or the place is not there. */
export function isNotFound(error: unknown): boolean {
  return error instanceof YuvoyError && error.status === 404;
}

/** The app's one not-found screen, in its own words (src/app/not-found.tsx). */
export const NOT_FOUND_WORDS = Object.freeze({
  title: "We do not have this one",
  body: "It may have been taken off sale, or the link may be wrong.",
  action: "Back to the feed",
});

/** The directory on a place, read again when it opens. */
export function groupsHref(destinationKey?: string | null): string {
  return destinationKey
    ? `/groups?place=${encodeURIComponent(destinationKey)}`
    : "/groups";
}

export function groupHref(slug: string): string {
  return `/groups/${encodeURIComponent(slug)}`;
}

/** Sign in, then back to the group's page. */
export function signInHref(slug: string): string {
  return `/account?next=${groupHref(slug)}`;
}
