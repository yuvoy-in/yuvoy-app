"use client";

import { EmptyState, LoadingState, Skeleton } from "@/components/states";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { TrigoCardRow } from "@/components/trigo/trigo-card-row";
import {
  ChangeFailed,
  GoneNotice,
  ListFailed,
  useListChange,
} from "@/components/trigo/list-parts";
import {
  draftDateRange,
  draftDayHeading,
  draftDays,
  trigoListFault,
} from "@/lib/trigo/lists";
import {
  TRIGO_LISTS_API_WORDS as API,
  TRIGO_LISTS_WORDS as W,
  type TripDraft,
} from "@/lib/trigo/lists-words";
import { useDeleteTripDraft, useMyTripDrafts } from "@/lib/trigo/use-lists";

/**
 * The Drafts tab on Trips (yuvoy-app#220, the phone's yuvoy-mobile#456): the
 * trip drafts Trigo planned and the traveller kept, newest first. Each one is
 * its title, its dates, its days with what is on them, and Delete draft.
 *
 * Only drawn signed in and with the `trigo` release open (`TripsScreen`
 * decides). A `401` says the sign-in expired, the way the trips list does; a
 * list that did not load says so with Try again (a `503` too, never the empty
 * line). A `404` on delete is a draft already gone: the API's sentence shows
 * over the list, and the list is read again.
 */
export function TripDrafts() {
  const list = useMyTripDrafts(true);
  const remove = useDeleteTripDraft();
  const change = useListChange((id) => remove.mutateAsync(id), {
    gone: API.draftGone,
    failed: W.deleteFailed,
  });

  if (
    change.expired ||
    (list.error !== null && trigoListFault(list.error) === "sign-in")
  ) {
    return (
      <Panel role="alert" className="mt-4 px-4 py-3">
        <p className="text-sm font-bold">{W.draftsExpired.title}</p>
        <p className="text-forest/70 mt-1 text-sm">{W.draftsExpired.body}</p>
        <ButtonLink
          href="/account"
          variant="outline"
          size="sm"
          className="mt-3"
        >
          {W.draftsExpired.action}
        </ButtonLink>
      </Panel>
    );
  }

  if (list.isPending) {
    return (
      <LoadingState label={W.draftsLoading}>
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </LoadingState>
    );
  }

  if (list.isLoadingError) {
    return (
      <ListFailed
        error={list.error}
        title={W.draftsFailed}
        retrying={list.isFetching}
        onRetry={() => void list.refetch()}
      />
    );
  }

  const drafts = list.data.drafts;
  const off = change.working !== null;
  return (
    <>
      {change.gone ? <GoneNotice message={change.gone} /> : null}
      {drafts.length === 0 ? (
        <EmptyState title={W.draftsEmpty} />
      ) : (
        <ul className="mt-6 space-y-3">
          {drafts.map((draft) => {
            const failure = change.failureOf(draft.id);
            return (
              <li key={draft.id}>
                <Panel>
                  <Draft
                    draft={draft}
                    deleting={change.working === draft.id}
                    off={off}
                    onDelete={() => change.run(draft.id)}
                  />
                  {failure ? (
                    <ChangeFailed
                      failure={failure}
                      off={off}
                      onRetry={() => change.run(draft.id)}
                    />
                  ) : null}
                </Panel>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Draft({
  draft,
  deleting,
  off,
  onDelete,
}: {
  draft: TripDraft;
  deleting: boolean;
  off: boolean;
  onDelete: () => void;
}) {
  const title = draft.title.trim() || W.draftsTitle;
  const range = draftDateRange(draft);
  return (
    <>
      <h2 className="text-base font-bold text-balance">{title}</h2>
      {range ? <p className="text-forest/70 mt-1 text-sm">{range}</p> : null}
      {draftDays(draft).map((day) => {
        const heading = draftDayHeading(day.date);
        return (
          <section key={day.date} className="mt-4">
            {heading ? (
              <h3 className="text-terra-deep text-sm font-bold">{heading}</h3>
            ) : null}
            {day.cards.map((card, i) => (
              <TrigoCardRow key={`${card.cardId}-${i}`} card={card} small />
            ))}
          </section>
        );
      })}
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        aria-label={`${W.deleteDraft}: ${title}`}
        disabled={off}
        pending={deleting}
        pendingLabel={W.deleting}
        onClick={onDelete}
      >
        {W.deleteDraft}
      </Button>
    </>
  );
}
