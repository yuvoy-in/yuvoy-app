"use client";

import { useTravellerSession } from "@/lib/auth/use-traveller";
import { useHasMounted } from "@/lib/react/use-has-mounted";
import { useSupportRequests } from "@/lib/support/use-support-requests";
import {
  isBeingHandled,
  isMissingReadSide,
  messageExcerpt,
  requestWhen,
  supportStatusWords,
  type SupportRequest,
} from "@/lib/support/requests";
import { isDeadToken, YuvoyError } from "@/lib/api/errors";
import { LoadingState, Skeleton, describeError } from "@/components/states";
import { Button, ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";

/**
 * "Your requests", on the Help Center (yuvoy-api#196).
 *
 * The owner asked for a Help Center with ticket tracking. Until the API had a
 * read side this was not built rather than faked: "a fake status would be
 * worse than the reference number we show today". It has one now, and this
 * is it: every help request this number sent, newest first, each with where
 * it is, what it said and when.
 *
 * ## What it must not imply
 *
 * That a reply will appear here. The API stores the traveller's own message
 * and no staff replies, because the conversation happens on WhatsApp. So a row
 * is a status, never a thread, and the section says where the answer comes
 * from in its own words.
 *
 * ## Who sees it
 *
 * Signed in only: the list takes a session and never a booking's status token.
 * Signed out, nothing is drawn and nothing is asked. And only once hydrated:
 * the server cannot know who is signed in, and this page is server rendered,
 * so a first client render that trusted a cache a sibling had already filled
 * would draw a section the server did not (React #418).
 *
 * ## An API that predates the read
 *
 * `GET /support/requests` answered `405` until yuvoy-api#209 was deployed. On
 * such an API this section draws nothing at all, which is exactly the Help
 * Center that shipped before it existed: the reference on the receipt, and
 * "a person replies on WhatsApp" under Still stuck.
 */
export function YourRequests() {
  const { signedIn, refresh } = useTravellerSession();
  const mounted = useHasMounted();
  const requests = useSupportRequests(signedIn);

  if (!mounted || signedIn !== true) return null;

  /*
    The older API, first and silently. Only on the FIRST load: a later page
    failing this way is not a statement about whether the read exists.
  */
  if (requests.isLoadingError && isMissingReadSide(requests.error)) {
    return null;
  }

  const items: SupportRequest[] =
    requests.data?.pages.flatMap((page) => page.items ?? []) ?? [];

  return (
    <section aria-labelledby="your-requests" className="mt-10">
      <h2
        id="your-requests"
        className="label text-forest/75 border-paper-line border-b pb-2"
      >
        Your requests
      </h2>

      {requests.isPending ? (
        <LoadingState label="Loading your requests">
          <div className="mt-3 space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </LoadingState>
      ) : requests.isLoadingError ? (
        <ListFailure
          error={requests.error}
          onRetry={() => void requests.refetch()}
          onSignedOut={() => void refresh()}
        />
      ) : items.length === 0 ? (
        <p className="text-forest/70 mt-3 text-sm">
          Nothing sent yet. When you message us, it shows here with where it is.
        </p>
      ) : (
        <>
          {/*
            A refresh that failed over a list already on screen. The list is
            still what we last knew, so it stays, and this says so quietly
            rather than throwing it away for an error panel.
          */}
          {requests.isRefetchError ? (
            <p role="status" className="text-forest/70 mt-3 text-xs">
              Could not refresh just now. This is the list as we last had it.
            </p>
          ) : null}

          <ul className="divide-paper-line mt-1 divide-y">
            {items.map((request) => (
              <li key={request.reference} className="py-4">
                <RequestRow request={request} />
              </li>
            ))}
          </ul>

          {requests.hasNextPage ? (
            <div className="mt-2 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                disabled={requests.isFetchingNextPage}
                onClick={() => void requests.fetchNextPage()}
              >
                {requests.isFetchingNextPage ? "Loading…" : "Show more"}
              </Button>
            </div>
          ) : null}
          {requests.isFetchNextPageError ? (
            <p role="alert" className="text-terra-deep mt-3 text-sm">
              That page did not load. Try again.
            </p>
          ) : null}
        </>
      )}

      {/*
        Where the answer comes from, said beside the list rather than left to
        be inferred from it. Without this a status list reads as an inbox, and
        somebody waits for a reply here that is already on their phone.
      */}
      <p className="text-forest/70 mt-3 text-xs">
        Replies come on WhatsApp, to your number. They are not shown here.
      </p>
    </section>
  );
}

/** One request: where it is, when, and the traveller's own words. */
function RequestRow({ request }: { request: SupportRequest }) {
  const words = supportStatusWords(request.status);
  const when = requestWhen(request);
  const excerpt = messageExcerpt(request.message);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/*
          No chip for a status this build does not know, rather than a guess.
          See `supportStatusWords`.
        */}
        {words ? (
          <Chip
            size="sm"
            tone={isBeingHandled(request.status) ? "accent" : "neutral"}
          >
            {words}
          </Chip>
        ) : (
          <span />
        )}
        {when ? <span className="text-forest/70 text-xs">{when}</span> : null}
      </div>
      {excerpt ? (
        <p className="text-forest/80 mt-2 text-sm">{excerpt}</p>
      ) : null}
      <p className="text-forest/70 mt-2 font-mono text-xs tracking-wider">
        {request.reference}
        {request.bookingReference ? ` · about ${request.bookingReference}` : ""}
      </p>
    </div>
  );
}

/** Why the list is not here, and the one thing that helps. */
function ListFailure({
  error,
  onRetry,
  onSignedOut,
}: {
  error: unknown;
  onRetry: () => void;
  onSignedOut: () => void;
}) {
  /*
    Signed out underneath us: the session ended here or on another device,
    and the proxy has already dropped the cookie. `retry: false` means this
    will not resolve itself, so it says so and offers the way back in.
  */
  if (isDeadToken(error)) {
    return (
      <Panel className="mt-3 px-4 py-3">
        <p className="text-sm font-bold">Your sign-in has ended</p>
        <p className="text-forest/70 mt-1 text-sm">
          Sign in again to see the requests you have sent.
        </p>
        <ButtonLink
          href="/account?next=/help"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onSignedOut}
        >
          Sign in again
        </ButtonLink>
      </Panel>
    );
  }

  const rateLimited = error instanceof YuvoyError && error.status === 429;
  return (
    <Panel role="alert" className="mt-3 px-4 py-3">
      <p className="text-sm font-bold">Your requests did not load</p>
      <p className="text-forest/70 mt-1 text-sm">
        {rateLimited
          ? "That is a lot of checks in a short time. Try again shortly."
          : describeError(error).body}
      </p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </Panel>
  );
}
