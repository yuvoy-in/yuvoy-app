"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "@/components/ui/link";
import { YuvoyError } from "@/lib/api/errors";
import { qk } from "@/lib/query/policy";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { isSignedOut, useTable, type TableView } from "@/lib/tables/use-table";
import { SEAT_LINE, STATUS_LINE, TABLE_WORDS } from "@/lib/tables/table-words";
import { clockOffsetMs } from "@/lib/booking/clock";
import { civilInZone, clockTime, weekdayDayMonth } from "@/lib/format/date";
import { dedashText } from "@/lib/format/dedash";
import { Screen } from "@/components/chrome/screen";
import { Button, ButtonLink, buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { SheetPresence } from "@/components/ui/sheet";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from "@/components/states";
import {
  CalendarIcon,
  MapPinIcon,
  TicketIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { WithdrawSeat } from "./withdraw-seat";
import { ReportTableSheet } from "./report-table-sheet";

const W = TABLE_WORDS;

/**
 * One table, where every table email links (yuvoy-app#194, R8-T1).
 *
 * ## Read only, and only the reader's own part
 *
 * Somebody who gets one of these letters has already asked to join, so the
 * page shows the table and their request, and lets them do two things: take
 * the request back (or give back the seat) and report a problem. Asking to
 * join is not here, nor any list of tables, and nothing else in the app links
 * to this page yet.
 *
 * ## Signed out shows nothing of the table
 *
 * Not the title, not the time, not the area: a forwarded letter must not
 * show a stranger where somebody will be. Nothing is read for the table
 * until the session says signed in.
 *
 * ## One not-found for every 404
 *
 * A malformed id, a table the reader may not see, one that stopped taking
 * requests after theirs was turned down, and every table while the release is
 * closed for them: the server answers each with the same 404, and the page
 * says the same words for each, never that the table exists.
 */
export function TableScreen({ id }: { id: string }) {
  const qc = useQueryClient();
  const { signedIn } = useTravellerSession();
  const table = useTable(id, signedIn === true);
  const [reporting, setReporting] = useState(false);

  /*
    A 401 while the cache says signed in: the session ended somewhere else,
    and the proxy has already dropped the cookie. Reading the session again
    turns this into the sign-in branch.
  */
  const sessionEnded = isSignedOut(table.error);
  useEffect(() => {
    if (sessionEnded) void qc.invalidateQueries({ queryKey: qk.session() });
  }, [sessionEnded, qc]);

  const report = (
    <SheetPresence open={reporting}>
      <ReportTableSheet id={id} onClose={() => setReporting(false)} />
    </SheetPresence>
  );

  /*
    The session is settled first, then the query: a disabled query reports
    `isPending`, so checking both at once would hold a signed-out reader on
    the skeleton for good (the same trap `InvitedTripScreen` notes).
  */
  if (signedIn === undefined) return <Loading />;

  if (!signedIn) {
    return (
      <Screen back={W.back}>
        <h1 className="font-display tracking-display leading-display text-3xl text-balance">
          {W.signedOut.title}
        </h1>
        <p className="text-forest/70 text-body mt-3 text-pretty">
          {W.signedOut.body}
        </p>
        <ButtonLink
          href={`/account?next=/tables/${id}`}
          size="lg"
          className="mt-6"
        >
          {W.signedOut.action}
        </ButtonLink>
      </Screen>
    );
  }

  if (table.isPending || sessionEnded) return <Loading />;

  /*
    Whenever the latest read says 404, data on screen or not: after a
    withdraw that answered 404 the table is read again, and what that read
    says is what the page shows.
  */
  if (table.error instanceof YuvoyError && table.error.status === 404) {
    return (
      <Screen back={W.back}>
        <EmptyState
          title={W.notFound.title}
          body={W.notFound.body}
          action={<ButtonLink href="/">{W.notFound.action}</ButtonLink>}
        />
      </Screen>
    );
  }

  if (
    table.isLoadingError &&
    table.error instanceof YuvoyError &&
    table.error.code === "tables_unavailable"
  ) {
    /*
      Paused, not broken: its own words and its own Try again. Report a
      problem stays, because the server takes reports while tables are paused
      and the table itself is not drawn now.
    */
    return (
      <Screen back={W.back}>
        <div role="alert" className="py-10 text-center">
          <h1 className="font-display tracking-display leading-display text-2xl text-balance">
            {W.paused.title}
          </h1>
          <p className="text-forest/70 text-body mx-auto mt-3 max-w-sm text-pretty">
            {W.paused.body}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button
            onClick={() => void table.refetch()}
            pending={table.isFetching}
            pendingLabel="Trying again"
          >
            {W.paused.action}
          </Button>
          <Button variant="outline" onClick={() => setReporting(true)}>
            {W.report.open}
          </Button>
        </div>
        {report}
      </Screen>
    );
  }

  if (table.isLoadingError) {
    return (
      <Screen back={W.back}>
        <ErrorState
          error={table.error}
          onRetry={() => void table.refetch()}
          retrying={table.isFetching}
        />
      </Screen>
    );
  }

  const data = table.data;
  if (!data) return null;

  return (
    <Screen back={W.back}>
      <TableDetail
        table={data}
        id={id}
        readAt={table.dataUpdatedAt + clockOffsetMs()}
      />
      <Button
        variant="ghost"
        block
        className="mt-6"
        onClick={() => setReporting(true)}
      >
        {W.report.open}
      </Button>
      {report}
    </Screen>
  );
}

function Loading() {
  return (
    <Screen back={W.back}>
      <LoadingState label={W.loading}>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="mt-4 h-32 w-full" />
      </LoadingState>
    </Screen>
  );
}

/** The table, as `TableView` gives it. */
function TableDetail({
  table,
  id,
  readAt,
}: {
  table: TableView;
  id: string;
  readAt: number;
}) {
  /*
    Always in the table's own zone. A table at six in the evening in
    Bengaluru read in a browser still on another zone is somebody at the
    wrong place at the wrong hour.
  */
  const start = civilInZone(table.startsAt, table.timeZone);
  const end = civilInZone(table.endsAt, table.timeZone);
  const when =
    start && end
      ? W.when(weekdayDayMonth(start), clockTime(start), clockTime(end))
      : null;

  /*
    Both with a fallback: a state the server adds later reads as no line,
    never as a crash on the page somebody opened from a letter.
  */
  const seatLine = table.myRequest
    ? (SEAT_LINE[table.myRequest.state] ?? null)
    : null;
  const statusLine = STATUS_LINE[table.status] ?? null;
  const names = table.whoIsGoing ?? [];

  return (
    <>
      {table.womenOnly || table.full ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {table.womenOnly ? <Chip size="sm">{W.womenOnly}</Chip> : null}
          {table.full ? <Chip size="sm">{W.full}</Chip> : null}
        </div>
      ) : null}

      <h1 className="voice-host leading-display text-3xl text-balance">
        {table.title}
      </h1>
      <p className="voice-host text-forest/80 mt-2 text-sm">
        {W.ledBy(table.leader)}
      </p>

      {statusLine || seatLine ? (
        <div className="mt-4 space-y-1">
          {statusLine ? (
            <p className="text-body font-bold text-pretty">{statusLine}</p>
          ) : null}
          {seatLine ? (
            <p className="text-body text-pretty">{seatLine}</p>
          ) : null}
        </div>
      ) : null}

      <Panel className="mt-6">
        {when ? (
          <p className="flex items-center gap-2 text-sm tabular-nums">
            <CalendarIcon className="text-forest/70 size-4 shrink-0" />
            {when}
          </p>
        ) : null}

        {table.venue ? null : (
          <p className="mt-3 flex items-start gap-2 text-sm">
            <MapPinIcon className="text-forest/70 mt-0.5 size-4 shrink-0" />
            <span className="leading-body text-pretty">
              {W.where(table.venueKind, table.venueArea)}
            </span>
          </p>
        )}

        <p className="mt-3 flex items-center gap-2 text-sm tabular-nums">
          <UsersIcon className="text-forest/70 size-4 shrink-0" />
          {W.seats(table.seatsTaken, table.seatsMax)}
        </p>

        {/*
          The event as plain words for now: its page at `/f/{id}` is not on
          dev yet, and the link comes with whichever of this and yuvoy-app#179
          merges second. The experience page exists, so that one links.
        */}
        {table.event ? (
          <p className="mt-3 flex items-center gap-2 text-sm">
            <TicketIcon className="text-forest/70 size-4 shrink-0" />
            {table.event.title}
          </p>
        ) : null}
        {table.experience ? (
          <p className="mt-3 flex items-center gap-2 text-sm">
            <TicketIcon className="text-forest/70 size-4 shrink-0" />
            <Link href={`/e/${table.experience.slug}`} className="underline">
              {table.experience.title}
            </Link>
          </p>
        ) : null}
      </Panel>

      {table.venue ? (
        <Venue venue={table.venue} dayOfContact={table.dayOfContact} />
      ) : null}

      {table.about ? (
        <p className="voice-host text-body leading-body mt-6 text-pretty">
          {dedashText(table.about)}
        </p>
      ) : null}

      {/*
        The names only when the server sends them: never to somebody without
        a live request, and on a women-only table only to approved guests.
        The page shows what it gets and never works the rest out.
      */}
      <div className="mt-6">
        <p className="label text-forest/75">{W.whoIsGoing}</p>
        {names.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {names.map((name, i) => (
              <li key={`${name}-${i}`}>
                <Chip size="sm">{name}</Chip>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body mt-2 text-pretty">
            {W.soFar(table.seatsTaken)}
          </p>
        )}
      </div>

      <p className="text-body mt-6 text-pretty">
        {dedashText(table.costNote) || W.costDefault}
      </p>

      <div className="mt-6">
        <p className="label text-forest/75">{W.gettingHome}</p>
        <p className="voice-host text-body leading-body mt-2 text-pretty">
          {dedashText(table.gettingHome)}
        </p>
      </div>

      <p className="text-forest/70 mt-6 text-sm text-pretty">
        {W.safety(table.leader)}
      </p>

      {table.myRequest ? (
        <WithdrawSeat id={id} table={table} readAt={readAt} />
      ) : null}
    </>
  );
}

/** A map link only when it is `https:`: the value is somebody's typing. */
function httpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/** The place itself, and the day's number: an approved guest's alone. */
function Venue({
  venue,
  dayOfContact,
}: {
  venue: NonNullable<TableView["venue"]>;
  dayOfContact: string | undefined;
}) {
  const map = httpsUrl(venue.mapUrl);
  return (
    <Panel className="mt-4">
      <p className="flex items-start gap-2 text-sm">
        <MapPinIcon className="text-forest/70 mt-0.5 size-4 shrink-0" />
        <span className="leading-body text-pretty">
          <span className="block font-bold">{venue.name}</span>
          {venue.address}
          <span className="text-forest/70 block">{venue.meetingPoint}</span>
        </span>
      </p>
      {map ? (
        <a
          href={map}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: "mt-4",
          })}
        >
          {W.openInMaps}
        </a>
      ) : venue.mapUrl ? (
        <p className="text-forest/70 mt-3 text-xs break-all">{venue.mapUrl}</p>
      ) : null}

      {dayOfContact ? (
        <p className="text-body mt-3 text-pretty">
          {W.dayOfContact}{" "}
          <a
            href={`tel:${dayOfContact.replace(/[^\d+]/g, "")}`}
            className="tabular-nums underline"
          >
            {dayOfContact}
          </a>
          .
        </p>
      ) : null}
    </Panel>
  );
}
