"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { isDeadToken } from "@/lib/api/errors";
import { qk } from "@/lib/query/policy";
import { crewMissing, useMyCrews } from "@/lib/people/use-crews";
import { CREWS_WORDS as W, type Crew } from "@/lib/people/crews-words";
import { PEOPLE_WORDS } from "@/lib/people/people-words";
import { Screen, type BackTarget } from "@/components/chrome/screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { LoadingState, Skeleton } from "@/components/states";
import { UnderAgeClosed, refusalText } from "./people-parts";

/**
 * What a crew's page and the crew editor share (yuvoy-app#227): the frame,
 * and the gate in front of both. The gate answers signed out, an expired
 * sign-in, People closed (a list `404` that `GET /me/people` confirms) and a
 * list that did not load, then hands the crews to the page. There is no single-crew read: the page finds its
 * crew in the list.
 *
 * An under-18 answer in the age step closes the account and signs out. Its
 * sentence is held here, above the signed-in check, as on People.
 */
export function CrewsGate({
  next,
  back,
  children,
}: {
  /** This page's path, to come back to after signing in. */
  next: string;
  back: BackTarget;
  children: (crews: Crew[], onUnderAge: (message: string) => void) => ReactNode;
}) {
  const qc = useQueryClient();
  const { signedIn, signOut, refresh } = useTravellerSession();
  const crews = useMyCrews(signedIn === true);
  const [closed, setClosed] = useState<string | null>(null);

  // A later read (on focus, or after a change) that says the sign-in ended
  // or answers 404 replaces the crews on screen: they are not true any more,
  // and Edit and Delete would only answer 404 (as people-screen.tsx). A 404
  // the release read cannot explain is not known to be closed, so it shows
  // our own "could not check" line with Try again, never the old crews.
  const why = crewMissing(crews.error);
  const closedNow = why === "closed";
  const ended =
    crews.isRefetchError && (isDeadToken(crews.error) || why !== null);
  const sessionEnded =
    (crews.isLoadingError || ended) && isDeadToken(crews.error);
  useEffect(() => {
    if (sessionEnded) void qc.invalidateQueries({ queryKey: qk.session() });
  }, [sessionEnded, qc]);

  if (closed) {
    return (
      <CrewShell back={back}>
        <UnderAgeClosed message={closed} />
      </CrewShell>
    );
  }

  if (signedIn === undefined) return <CrewLoading back={back} />;

  if (!signedIn) {
    return (
      <CrewShell back={back}>
        <CrewTitle>{PEOPLE_WORDS.signedOut.title}</CrewTitle>
        <CrewBody>{PEOPLE_WORDS.signedOut.body}</CrewBody>
        <ButtonLink
          href={`/account?next=${encodeURIComponent(next)}`}
          size="lg"
          className="mt-6"
        >
          {PEOPLE_WORDS.signedOut.action}
        </ButtonLink>
      </CrewShell>
    );
  }

  if (crews.isPending) return <CrewLoading back={back} />;

  if (crews.isLoadingError || ended) {
    if (sessionEnded) {
      return (
        <CrewShell back={back}>
          <CrewTitle>{PEOPLE_WORDS.sessionEnded.title}</CrewTitle>
          <CrewBody>{PEOPLE_WORDS.sessionEnded.body}</CrewBody>
          <Button size="lg" className="mt-6" onClick={() => void refresh()}>
            {PEOPLE_WORDS.sessionEnded.action}
          </Button>
        </CrewShell>
      );
    }
    if (closedNow) {
      return (
        <CrewShell back={back}>
          <CrewTitle>{PEOPLE_WORDS.closed.title}</CrewTitle>
          <CrewBody>{PEOPLE_WORDS.closed.body}</CrewBody>
        </CrewShell>
      );
    }
    return (
      <CrewShell back={back}>
        <div role="alert">
          <CrewTitle>{W.failed}</CrewTitle>
          <CrewBody>
            {why === null ? refusalText(crews.error) : W.notChecked}
          </CrewBody>
        </div>
        <Button
          size="lg"
          className="mt-6"
          pending={crews.isFetching}
          pendingLabel={PEOPLE_WORDS.retrying}
          onClick={() => void crews.refetch()}
        >
          {PEOPLE_WORDS.retry}
        </Button>
      </CrewShell>
    );
  }

  return (
    <CrewShell back={back}>
      {children(crews.data.crews, (message) => {
        setClosed(message);
        void signOut();
      })}
    </CrewShell>
  );
}

/** A crew that is not in the list, or a change that answered `404`. */
export function CrewGone() {
  return (
    <>
      <CrewTitle>{W.gone.title}</CrewTitle>
      <CrewBody>{W.gone.body}</CrewBody>
      <ButtonLink href="/people" size="lg" className="mt-6">
        {W.gone.action}
      </ButtonLink>
    </>
  );
}

export function CrewShell({
  back,
  children,
}: {
  back: BackTarget;
  children: ReactNode;
}) {
  return <Screen back={back}>{children}</Screen>;
}

export function CrewTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="font-display tracking-display leading-display text-3xl text-balance break-words">
      {children}
    </h1>
  );
}

export function CrewBody({ children }: { children: ReactNode }) {
  return (
    <p className="text-forest/70 text-body mt-3 text-pretty">{children}</p>
  );
}

function CrewLoading({ back }: { back: BackTarget }) {
  return (
    <CrewShell back={back}>
      <LoadingState label={W.loading}>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="mt-4 h-32 w-full" />
      </LoadingState>
    </CrewShell>
  );
}

/** The crew with this id in the list, matched as the API might case it. */
export function findCrew(crews: Crew[], crewId: string): Crew | undefined {
  const id = crewId.toLowerCase();
  return crews.find((c) => c.crewId.toLowerCase() === id);
}
