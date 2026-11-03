"use client";

import { useId, useState } from "react";
import { YuvoyError } from "@/lib/api/errors";
import {
  friendsOf,
  useAnswerRequest,
  useMyFriends,
  useRemoveFriend,
  useWithdrawRequest,
} from "@/lib/people/use-people";
import {
  PEOPLE_WORDS as W,
  type Friend,
  type FriendRequest,
} from "@/lib/people/people-words";
import { Button } from "@/components/ui/button";
import { LoadingState, Skeleton, describeError } from "@/components/states";
import { Initial, Refusal, isStepRefusal } from "./people-parts";

/**
 * The three lists on People (yuvoy-app#222): requests in, requests sent and
 * friends. Names exactly as sent: `shortName` for somebody who is not a
 * friend, `name` for a friend. A refused answer is never shown to the person
 * who asked, so nothing here ever says "declined".
 */

/**
 * Only on answering: there a `404` is "not a request waiting for you". On
 * the DELETEs a `404` means People is closed to the caller, so it shows.
 */
const is404 = (e: unknown) => e instanceof YuvoyError && e.status === 404;

function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <h2
      id={id}
      className="label text-forest/75 border-paper-line border-b pb-2"
    >
      {children}
    </h2>
  );
}

/** One incoming request: Accept or Decline. A 404 says it is gone. */
function RequestIn({
  request,
  onStep,
  onGone,
}: {
  request: FriendRequest;
  onStep: (error: unknown) => void;
  onGone: () => void;
}) {
  const answer = useAnswerRequest();
  const nameId = useId();
  const mutual = request.mutualFriends ?? 0;
  const send = (choice: "accept" | "decline") =>
    answer.mutate(
      { requestId: request.requestId, answer: choice },
      {
        onError: (error) => {
          if (isStepRefusal(error)) onStep(error);
          else if (is404(error)) onGone();
        },
      },
    );
  const pending = answer.isPending ? answer.variables?.answer : undefined;
  const failure =
    answer.error && !isStepRefusal(answer.error) && !is404(answer.error)
      ? answer.error
      : null;

  return (
    <li className="py-4" data-testid="request-in">
      <div className="flex items-center gap-3">
        <Initial initial={request.person.initial} />
        <div>
          <p id={nameId} className="text-sm font-bold">
            {request.person.shortName}
          </p>
          {mutual > 0 ? (
            <p className="text-forest/70 text-sm">{W.mutual(mutual)}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex gap-3">
        <Button
          size="sm"
          aria-describedby={nameId}
          pending={pending === "accept"}
          pendingLabel={W.accept}
          onClick={() => send("accept")}
        >
          {W.accept}
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-describedby={nameId}
          pending={pending === "decline"}
          pendingLabel={W.decline}
          onClick={() => send("decline")}
        >
          {W.decline}
        </Button>
      </div>
      {failure ? <Refusal error={failure} className="mt-2" /> : null}
    </li>
  );
}

export function RequestsIn({
  requests,
  onStep,
}: {
  requests: FriendRequest[];
  onStep: (error: unknown) => void;
}) {
  const [gone, setGone] = useState(false);
  if (requests.length === 0 && !gone) return null;
  return (
    <section aria-labelledby="requests-in" className="mt-8">
      <SectionTitle id="requests-in">{W.requestsIn}</SectionTitle>
      <p role="status" className="text-forest/70 mt-2 text-sm">
        {gone ? W.gone : ""}
      </p>
      <ul className="divide-paper-line divide-y">
        {requests.map((r) => (
          <RequestIn
            key={r.requestId}
            request={r}
            onStep={onStep}
            onGone={() => setGone(true)}
          />
        ))}
      </ul>
    </section>
  );
}

/** One request sent: Take back. Nothing to take back is a 204. */
function RequestOut({ request }: { request: FriendRequest }) {
  const withdraw = useWithdrawRequest();
  const nameId = useId();
  const failure = withdraw.error;
  return (
    <li
      className="flex flex-wrap items-center gap-3 py-4"
      data-testid="request-out"
    >
      <Initial initial={request.person.initial} />
      <p id={nameId} className="flex-1 text-sm font-bold">
        {request.person.shortName}
      </p>
      <Button
        size="sm"
        variant="outline"
        aria-describedby={nameId}
        pending={withdraw.isPending}
        pendingLabel={W.takeBack}
        onClick={() => withdraw.mutate(request.requestId)}
      >
        {W.takeBack}
      </Button>
      {failure ? <Refusal error={failure} className="w-full" /> : null}
    </li>
  );
}

export function RequestsOut({ requests }: { requests: FriendRequest[] }) {
  if (requests.length === 0) return null;
  return (
    <section aria-labelledby="requests-out" className="mt-8">
      <SectionTitle id="requests-out">{W.requestsOut}</SectionTitle>
      <ul className="divide-paper-line divide-y">
        {requests.map((r) => (
          <RequestOut key={r.requestId} request={r} />
        ))}
      </ul>
    </section>
  );
}

/** One friend, with Unfriend behind a confirm. Nobody is told. */
function FriendRow({ friend }: { friend: Friend }) {
  const remove = useRemoveFriend();
  const [asking, setAsking] = useState(false);
  const nameId = useId();
  const failure = remove.error;
  return (
    <li className="py-4" data-testid="friend">
      <div className="flex flex-wrap items-center gap-3">
        <Initial initial={friend.initial} />
        <p id={nameId} className="flex-1 text-sm font-bold">
          {friend.name}
        </p>
        {asking ? null : (
          <Button
            size="sm"
            variant="ghost"
            aria-describedby={nameId}
            onClick={() => setAsking(true)}
          >
            {W.unfriend}
          </Button>
        )}
      </div>
      {asking ? (
        <div
          role="group"
          aria-label={W.unfriendAsk(friend.name)}
          className="mt-3"
        >
          <p className="text-sm font-bold">{W.unfriendAsk(friend.name)}</p>
          <p className="text-forest/70 text-sm">{W.unfriendNote}</p>
          <div className="mt-3 flex gap-3">
            <Button
              size="sm"
              pending={remove.isPending}
              pendingLabel={W.unfriend}
              onClick={() => remove.mutate(friend.personId)}
            >
              {W.unfriendConfirm}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                remove.reset();
                setAsking(false);
              }}
            >
              {W.keep}
            </Button>
          </div>
        </div>
      ) : null}
      {failure ? <Refusal error={failure} className="mt-2" /> : null}
    </li>
  );
}

/** Friends, in the API's order (newest first), a page at a time. */
export function FriendsList({ count }: { count: number }) {
  const friends = useMyFriends(true);
  const list = friendsOf(friends.data?.pages);
  return (
    <section aria-labelledby="friends" className="mt-8">
      <SectionTitle id="friends">{W.friends}</SectionTitle>
      <p className="text-forest/70 mt-2 text-sm tabular-nums">
        {W.friendCount(count)}
      </p>
      {friends.isPending ? (
        <LoadingState label={W.loading}>
          <Skeleton className="mt-3 h-14 w-full" />
        </LoadingState>
      ) : friends.isLoadingError ? (
        <div role="alert" className="mt-3">
          <p className="text-sm font-bold">{W.friendsFailed}</p>
          <p className="text-forest/70 mt-1 text-sm">
            {describeError(friends.error).body}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            pending={friends.isFetching}
            pendingLabel={W.retrying}
            onClick={() => void friends.refetch()}
          >
            {W.retry}
          </Button>
        </div>
      ) : list.length === 0 ? (
        <p className="text-forest/70 text-body mt-3 text-pretty">
          {W.friendsEmpty}
        </p>
      ) : (
        <>
          <ul className="divide-paper-line divide-y">
            {list.map((f) => (
              <FriendRow key={f.personId} friend={f} />
            ))}
          </ul>
          {friends.hasNextPage ? (
            <Button
              variant="outline"
              block
              className="mt-3"
              pending={friends.isFetchingNextPage}
              pendingLabel={W.loadingMore}
              onClick={() => void friends.fetchNextPage()}
            >
              {W.more}
            </Button>
          ) : null}
          {friends.isFetchNextPageError ? (
            <Refusal error={friends.error} className="mt-2" />
          ) : null}
        </>
      )}
    </section>
  );
}
