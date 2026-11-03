"use client";

import { YuvoyError } from "@/lib/api/errors";
import { needsAge, needsName } from "@/lib/people/use-people";
import { PEOPLE_WORDS as W } from "@/lib/people/people-words";
import { describeError } from "@/components/states";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Small parts every People screen shares (yuvoy-app#222): the refusal line,
 * the initial disc, and the page an under-18 answer leaves behind.
 */

/**
 * What a refusal says. People's refusals (`people_paused`,
 * `friend_limit_reached`, `friend_link_full`, `friend_link_expired`,
 * `age_locked`, a `429`) are shown in the API's own sentence, as sent. Only
 * a failure with no sentence of its own (a 5xx, or a body that was not an
 * error envelope, which the client names `internal_error`) falls back to the
 * app's general words.
 */
export function refusalText(error: unknown): string {
  if (
    error instanceof YuvoyError &&
    error.status < 500 &&
    error.code !== "internal_error" &&
    error.message
  ) {
    return error.message;
  }
  return describeError(error).body;
}

/** A refusal that opens a step (age or name) rather than being shown. */
export function isStepRefusal(error: unknown): boolean {
  return needsAge(error) || needsName(error);
}

/** The refusal under the control that was refused. */
export function Refusal({
  error,
  className,
}: {
  error: unknown;
  className?: string;
}) {
  return (
    <p role="alert" className={cn("text-terra-deep text-sm", className)}>
      {refusalText(error)}
    </p>
  );
}

/** The person's initial in a disc. Decoration: the name is always beside it. */
export function Initial({
  initial,
  size = "md",
}: {
  initial: string;
  size?: "md" | "lg";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "bg-forest/10 text-forest inline-flex shrink-0 items-center justify-center rounded-full font-bold",
        size === "lg" ? "size-14 text-xl" : "size-10 text-base",
      )}
    >
      {initial}
    </span>
  );
}

/**
 * After `under_age_sign_up`: the API has closed the account and ended its
 * sessions. Its sentence is kept by the screen above its signed-in check, so
 * the sign-out that follows does not swap it for the sign-in page.
 */
export function UnderAgeClosed({ message }: { message: string }) {
  return (
    <div>
      <h1 className="font-display tracking-display leading-display text-3xl text-balance">
        {W.title}
      </h1>
      <p role="alert" className="text-body mt-3 text-pretty">
        {message}
      </p>
      <ButtonLink href="/" size="lg" className="mt-6">
        {W.age.closedAction}
      </ButtonLink>
    </div>
  );
}
