"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { YuvoyError } from "@/lib/api/errors";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import {
  useInvitePreview,
  useAcceptInviteLink,
  GUEST_TRIP_STATUS,
} from "@/lib/trips/use-invites";
import { civilFromDate, weekdayDayMonth } from "@/lib/format/date";
import { Screen } from "@/components/chrome/screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { LoadingState, Skeleton } from "@/components/states";
import { CalendarIcon } from "@/components/ui/icons";

/** The two states where a place can still be taken. */
const OPEN = ["pending", "confirmed"];

/**
 * An invitation link (yuvoy-app#38 item 11), at `/i/{token}`.
 *
 * ## It works signed out, and that is the whole point
 *
 * `GET /invites/{token}` needs no credential: somebody arriving from a
 * WhatsApp message has no context and no account, and asking them to sign in
 * before saying what they are signing in FOR is how an invitation gets
 * ignored. So the trip is named first and the sign-in is the second step.
 *
 * "Nothing personal and nothing about money" is the server's own guarantee,
 * and it has to be, because this page is one forward of a group chat.
 *
 * ## `next` carries them back
 *
 * Sign-in lands on `/account`, so the link carries `?next=/i/{token}` and the
 * traveller returns here with a session, where the button has become "Join
 * this trip". Same mechanism as the Login button in yuvoy-app#56, and
 * `safeNextPath` on the other end refuses anything that is not a path on this
 * origin.
 */
export function InviteLanding({ token }: { token: string }) {
  const router = useRouter();
  const { signedIn } = useTravellerSession();
  const preview = useInvitePreview(token);
  const accept = useAcceptInviteLink();

  if (preview.isPending || signedIn === undefined) {
    return (
      <Screen>
        <LoadingState label="Loading this invitation">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="mt-4 h-28 w-full" />
        </LoadingState>
      </Screen>
    );
  }

  if (preview.isError) {
    const gone =
      preview.error instanceof YuvoyError && preview.error.status === 404;

    /*
      404 covers unknown, revoked, declined and finished, deliberately: telling
      them apart would confirm that a particular invitation once existed. So
      one sentence, and it points at the person who sent it rather than at us.
    */
    return (
      <Screen>
        <h1 className="font-display tracking-display text-3xl leading-tight">
          {gone
            ? "This invitation does not work"
            : "We could not load this invitation"}
        </h1>
        <p className="text-forest/70 mt-3 text-sm">
          {gone
            ? "Ask the person who invited you to send it again."
            : "That is our side, not yours. Try again in a moment."}
        </p>
        {gone ? (
          <ButtonLink href="/" variant="outline" className="mt-6">
            Look around Yuvoy
          </ButtonLink>
        ) : (
          <Button
            variant="outline"
            onClick={() => void preview.refetch()}
            className="mt-6"
          >
            Try again
          </Button>
        )}
      </Screen>
    );
  }

  const trip = preview.data;
  if (!trip) return null;

  const day = civilFromDate(trip.localDate);
  const when = day
    ? `${weekdayDayMonth(day)}${trip.localTime ? ` · ${trip.localTime.slice(0, 5)}` : ""}`
    : null;

  const open = OPEN.includes(trip.status);
  const conflict =
    accept.error instanceof YuvoyError && accept.error.status === 409;
  const needsSignIn =
    accept.error instanceof YuvoyError && accept.error.status === 401;

  return (
    <Screen stageLabel="You are invited">
      <p className="eyebrow text-terra-deep">You are invited</p>

      <h1 className="font-display tracking-display mt-2 text-3xl leading-tight">
        <Link href={`/e/${trip.experienceSlug}`} className="underline">
          {trip.experience}
        </Link>
      </h1>

      <p className="text-forest/80 mt-2 text-sm">{trip.operator}</p>

      <Panel className="mt-6">
        {when ? (
          <p className="flex items-center gap-2 text-sm">
            <CalendarIcon className="text-forest/70 size-4 shrink-0" />
            {when}
          </p>
        ) : null}
        <p className="mt-3">
          <Chip
            size="sm"
            tone={trip.status === "confirmed" ? "accent" : undefined}
          >
            {GUEST_TRIP_STATUS[trip.status] ?? trip.status}
          </Chip>
        </p>
      </Panel>

      {!open ? (
        <p className="text-forest/70 mt-6 text-sm">This trip was cancelled.</p>
      ) : signedIn && !needsSignIn ? (
        <>
          <Button
            block
            size="lg"
            disabled={accept.isPending}
            onClick={() =>
              accept.mutate(token, {
                onSuccess: (joined) => {
                  if (joined?.id) router.push(`/trips/invited/${joined.id}`);
                },
              })
            }
            className="mt-8"
          >
            {accept.isPending ? "Joining…" : "Join this trip"}
          </Button>

          {accept.error ? (
            <p role="alert" className="text-terra-deep mt-3 text-sm">
              {conflict
                ? "This trip was cancelled, or it is your own booking."
                : accept.error instanceof YuvoyError
                  ? accept.error.message
                  : "That did not work. Try again."}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <ButtonLink
            href={`/account?next=/i/${token}`}
            size="lg"
            block
            className="mt-8"
          >
            Sign in to join
          </ButtonLink>
          <p className="text-forest/70 mt-3 text-xs">
            With your own number. There is no account to make, and it takes a
            code on WhatsApp.
          </p>
        </>
      )}
    </Screen>
  );
}
