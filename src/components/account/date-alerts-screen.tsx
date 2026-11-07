"use client";

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/chrome/screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState, LoadingState, Skeleton } from "@/components/states";
import { TrigoCardRow } from "@/components/trigo/trigo-card-row";
import {
  ChangeFailed,
  GoneNotice,
  ListFailed,
  useListChange,
} from "@/components/trigo/list-parts";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { qk } from "@/lib/query/policy";
import { useHasMounted } from "@/lib/react/use-has-mounted";
import { useRelease } from "@/lib/site/use-release";
import {
  dateAlertWaits,
  trigoCardListed,
  trigoListFault,
} from "@/lib/trigo/lists";
import {
  TRIGO_LISTS_API_WORDS as API,
  TRIGO_LISTS_WORDS as W,
  type DateAlert,
} from "@/lib/trigo/lists-words";
import { useMyDateAlerts, useStopDateAlert } from "@/lib/trigo/use-lists";

/** Where signing in from here comes back to. */
const HERE = "/account/date-alerts";

/**
 * `/account/date-alerts` (yuvoy-app#220, the phone's yuvoy-mobile#456): the
 * date alerts Trigo keeps for the signed-in number, waiting ones and the
 * ones that have told. A waiting one can be stopped.
 *
 * In order: signed out asks to sign in and reads nothing; the `trigo`
 * release closed says Trigo is not open; a `401` says the sign-in expired; a
 * list that did not load says what failed, with Try again (a `503` too,
 * never the empty line); then the list or its empty line.
 *
 * One change at a time. A `404` on stop is an alert already gone: the API's
 * sentence shows over the list, and the list is read again.
 */
export function DateAlertsScreen() {
  const { signedIn } = useTravellerSession();
  const release = useRelease("trigo");
  const mounted = useHasMounted();

  if (signedIn === undefined) return <Loading />;

  if (!signedIn) {
    return (
      <Shell>
        <Title>{W.signedOut.title}</Title>
        <Body>{W.signedOut.body}</Body>
        <ButtonLink href={`/account?next=${HERE}`} size="lg" className="mt-6">
          {W.signedOut.action}
        </ButtonLink>
      </Shell>
    );
  }

  if (!mounted || release.pending) return <Loading />;

  if (!release.open) {
    return (
      <Shell>
        <Title>{W.alertsTitle}</Title>
        <EmptyState title={W.notOpen} />
      </Shell>
    );
  }

  return (
    <Shell>
      <Title>{W.alertsTitle}</Title>
      <AlertsBody />
    </Shell>
  );
}

function AlertsBody() {
  const list = useMyDateAlerts(true);
  const stop = useStopDateAlert();
  const change = useListChange((id) => stop.mutateAsync(id), {
    gone: API.alertGone,
    failed: W.stopFailed,
  });

  if (
    change.expired ||
    (list.error !== null && trigoListFault(list.error) === "sign-in")
  ) {
    return <Expired />;
  }

  if (list.isPending) return <Waiting />;

  if (list.isLoadingError) {
    return (
      <ListFailed
        error={list.error}
        title={W.alertsFailed}
        retrying={list.isFetching}
        onRetry={() => void list.refetch()}
      />
    );
  }

  const alerts = list.data.alerts;
  const off = change.working !== null;
  return (
    <>
      {change.gone ? <GoneNotice message={change.gone} /> : null}
      {alerts.length === 0 ? (
        <EmptyState title={W.alertsEmpty} />
      ) : (
        <ul className="mt-4">
          {alerts.map((alert) => {
            const failure = change.failureOf(alert.id);
            return (
              <li key={alert.id} className="border-paper-line border-b pb-4">
                <AlertRow
                  alert={alert}
                  stopping={change.working === alert.id}
                  off={off}
                  onStop={() => change.run(alert.id)}
                />
                {failure ? (
                  <ChangeFailed
                    failure={failure}
                    off={off}
                    onRetry={() => change.run(alert.id)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function AlertRow({
  alert,
  stopping,
  off,
  onStop,
}: {
  alert: DateAlert;
  stopping: boolean;
  off: boolean;
  onStop: () => void;
}) {
  const waits = dateAlertWaits(alert);
  const name = alert.card.title.trim() || W.alertsTitle;
  return (
    <>
      <TrigoCardRow card={alert.card} source />
      {!waits && trigoCardListed(alert.card) ? (
        <p className="text-terra-deep text-sm font-bold">{W.fired}</p>
      ) : null}
      {waits ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          aria-label={`${W.stopAlert}: ${name}`}
          disabled={off}
          pending={stopping}
          pendingLabel={W.stopping}
          onClick={onStop}
        >
          {W.stopAlert}
        </Button>
      ) : null}
    </>
  );
}

/**
 * The sign-in ended. The proxy dropped the cookie with the `401`, so the
 * session is marked stale here and Account reads it again when it opens.
 */
function Expired() {
  const qc = useQueryClient();
  useEffect(() => {
    void qc.invalidateQueries({ queryKey: qk.session(), refetchType: "none" });
  }, [qc]);
  return (
    <div role="alert">
      <h2 className="mt-6 text-base font-bold text-balance">
        {W.alertsExpired.title}
      </h2>
      <Body>{W.alertsExpired.body}</Body>
      <ButtonLink href={`/account?next=${HERE}`} size="lg" className="mt-6">
        {W.alertsExpired.action}
      </ButtonLink>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <Screen back={W.back}>{children}</Screen>;
}

function Title({ children }: { children: ReactNode }) {
  return (
    <h1 className="font-display tracking-display leading-display text-3xl text-balance">
      {children}
    </h1>
  );
}

function Body({ children }: { children: ReactNode }) {
  return (
    <p className="text-forest/70 text-body mt-3 text-pretty">{children}</p>
  );
}

function Waiting() {
  return (
    <LoadingState label={W.alertsLoading}>
      <div className="mt-6 space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </LoadingState>
  );
}

function Loading() {
  return (
    <Shell>
      <Title>{W.alertsTitle}</Title>
      <Waiting />
    </Shell>
  );
}
