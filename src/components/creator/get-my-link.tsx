"use client";

import { useRelease } from "@/lib/site/use-release";
import { useGetMyCreatorLink } from "@/lib/creator/use-creator-links";
import { CREATOR_WORDS as W } from "@/lib/creator/creator-words";
import { isDeadToken, YuvoyError } from "@/lib/api/errors";
import { describeError } from "@/components/states";
import { Button, ButtonLink } from "@/components/ui/button";
import { tripTitleId, type ServerTrip } from "@/lib/trips/tabs";
import { CreatorLinkActions } from "./creator-link-actions";

/**
 * The states of a booked trip that mean the traveller went: only `completed`,
 * as the API's own check takes only a completed booking (yuvoy-api
 * `creator_uploads.go`, `WentFor`) and the phone shows the button only there.
 * A trip still confirmed or paid and not yet closed off, a `no_show`, and a
 * cancelled or declined one would each get a button the API only refuses.
 */
const WENT: ReadonlySet<ServerTrip["state"]> = new Set<ServerTrip["state"]>([
  "completed",
]);

/** Whether a past trip is one a link can be asked for. */
export function mayGetLink(trip: Pick<ServerTrip, "state">): boolean {
  return WENT.has(trip.state);
}

/**
 * "Get my link", under a trip on the Past tab (yuvoy-app#207, R12-T2).
 *
 * Only while the `creator` release is open to this traveller, and only for a
 * trip they may have gone on (`mayGetLink`). Trips are experiences: the web
 * has no list of events a person went on, so there is no button for one, and
 * a link to an event made on the phone still shows in Your links.
 *
 * A trip names its listing by slug and the write takes the id, so the tap
 * reads the listing first (`useGetMyCreatorLink`). `201` is a link made now
 * and `200` the one they already had; both then show Copy link and Share.
 *
 * ## A refusal is said in the API's words
 *
 * `403 not_went`, `403 not_open_yet`, `429` and `503` each come with a
 * sentence written for the traveller, and it is shown as sent. A `401` is the
 * same answer Trips gives a sign-in that has ended. Outside the button, below
 * the card: the card is a link to the booking, and a button inside a link is
 * neither.
 */
export function GetMyLink({ trip }: { trip: ServerTrip }) {
  const release = useRelease("creator");
  const get = useGetMyCreatorLink();

  if (!release.open || !mayGetLink(trip)) return null;

  const signedOut = isDeadToken(get.error);
  const titleId = tripTitleId(trip);

  return (
    <div className="mt-2 px-1" data-testid="get-my-link">
      {get.data ? (
        /*
          In place of the button, and given the focus it had: the button is
          gone, and a focus left on nothing falls to the page.
        */
        <CreatorLinkActions
          link={get.data.link}
          describedBy={titleId}
          focusCopy
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          aria-describedby={titleId}
          pending={get.isPending}
          pendingLabel={W.gettingLink}
          onClick={() => get.mutate(trip.experienceSlug)}
        >
          {W.getMyLink}
        </Button>
      )}

      {/*
        Mounted from the start and written into on the answer. A live region
        that arrives already holding its sentence is one a screen reader may
        never read out. Never hidden, for the same reason: empty, it only
        gives up its margin.
      */}
      <p
        role="status"
        className="text-forest/80 mt-2 text-sm text-pretty empty:mt-0"
        data-testid="get-my-link-status"
      >
        {get.data ? (get.data.made ? W.made : W.already) : ""}
      </p>

      {signedOut ? (
        <div role="alert" className="mt-2">
          <p className="text-sm font-bold">{W.signedOut.title}</p>
          <p className="text-forest/70 mt-1 text-sm">{W.signedOut.body}</p>
          <ButtonLink
            href={W.signedOut.href}
            variant="outline"
            size="sm"
            className="mt-2"
          >
            {W.signedOut.action}
          </ButtonLink>
        </div>
      ) : get.error ? (
        <p role="alert" className="text-terra-deep mt-2 text-sm text-pretty">
          {refusal(get.error)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The API's own sentence, as sent, for anything it refused. A failure that
 * carries no sentence of the API's (no answer at all, or a body that was not
 * the error envelope) gets the app's line for it instead of a status number.
 */
function refusal(error: unknown): string {
  if (error instanceof YuvoyError && error.code !== "internal_error") {
    return error.message;
  }
  return describeError(error).body;
}
