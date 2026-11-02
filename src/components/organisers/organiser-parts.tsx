"use client";

import type { ReactNode } from "react";
import { Screen, type BackTarget } from "@/components/chrome/screen";
import { LoadingState, Skeleton } from "@/components/states";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  organiserRefusal,
  type OrganiserRefusalKind,
} from "@/lib/organisers/refusal";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { useRelease } from "@/lib/site/use-release";

/**
 * Small pieces the organiser page screens share (yuvoy-app#224): where Back
 * goes, the heading, the loading frame, and the notice a read again leaves
 * when it failed over an answer already on screen.
 */

export const BACK_TO_ACCOUNT: BackTarget = {
  href: "/account",
  label: "your account",
};

export const BACK_TO_HUB: BackTarget = { href: "/organiser", label: W.title };

export function backToOrganiser(id: string): BackTarget {
  return {
    href: `/organiser/${encodeURIComponent(id)}`,
    label: W.backToOrganiser,
  };
}

export function OrganiserHeading({
  children,
  id,
}: {
  children: ReactNode;
  id?: string;
}) {
  return (
    <h1
      id={id}
      className="font-display tracking-display leading-display text-3xl text-balance break-words"
    >
      {children}
    </h1>
  );
}

/** A whole screen still reading: its heading where it has one, and grey rows. */
export function OrganiserLoading({
  label,
  back,
  title,
}: {
  label: string;
  back: BackTarget;
  title?: string;
}) {
  return (
    <Screen back={back}>
      {title ? <OrganiserHeading>{title}</OrganiserHeading> : null}
      <LoadingState label={label}>
        <div className="mt-6 space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </LoadingState>
    </Screen>
  );
}

/**
 * The refusals that end what is on screen, even when an older answer is
 * there: the sign-in ended, the age is asked, or the organiser, the event or
 * the person's place in it is gone (a helper removed while the page is open).
 */
const ENDS_THE_PAGE: ReadonlySet<OrganiserRefusalKind> = new Set([
  "signedOut",
  "age",
  "notFound",
  "notMember",
  "notOwner",
]);

/**
 * Whether a read again was refused in a way that ends the page: the screen
 * then draws the refusal block (or the age step) in place of the old answer,
 * as a first read would, so Post and Edit do not stay on screen.
 */
export function refusedAgain(query: {
  isRefetchError: boolean;
  error: unknown;
}): boolean {
  return (
    query.isRefetchError &&
    ENDS_THE_PAGE.has(organiserRefusal(query.error).kind)
  );
}

/**
 * A read again failed while its last answer is on screen, for a reason that
 * leaves the answer standing (no answer, a fault, a pause): the answer stays,
 * and this says so above it, with Try again. A pause says the API's sentence.
 * A refusal that ends the page is `refusedAgain`'s, and draws nothing here.
 */
export function RefetchNotice({
  query,
}: {
  query: {
    isRefetchError: boolean;
    error: unknown;
    refetch: () => unknown;
  };
}) {
  if (!query.isRefetchError || refusedAgain(query)) return null;
  const refusal = organiserRefusal(query.error);
  const line = refusal.kind === "paused" ? refusal.message : W.notNow;
  return (
    <div
      role="status"
      className="border-paper-line rounded-card mt-4 border px-4 py-3"
      data-testid="organiser-stale"
    >
      <p className="text-forest/80 text-sm text-pretty">{line}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => void query.refetch()}
      >
        {W.tryAgain}
      </Button>
    </div>
  );
}

/** A row's frame: a card that a link or a block fills. */
export const ROW_CLASS =
  "rounded-card border-paper-line bg-paper hover:bg-forest/5 ease-interaction block min-w-0 border px-4 py-3.5 transition-colors duration-200";

/**
 * Account's "Organiser pages", only while `supply` is open. Here rather than
 * in `account-screen.tsx`, which is at the 500-line limit.
 */
export function OrganiserAccountLink() {
  const supply = useRelease("supply");
  if (!supply.open) return null;
  return (
    <ButtonLink href="/organiser" variant="outline" block className="mt-3">
      {W.title}
    </ButtonLink>
  );
}
