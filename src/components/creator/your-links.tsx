"use client";

import { useId } from "react";
import { useRelease } from "@/lib/site/use-release";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import {
  isReleaseClosed,
  useMyCreatorLinks,
} from "@/lib/creator/use-creator-links";
import {
  CREATOR_WORDS as W,
  latestBooking,
  linkCounts,
  type CreatorLink,
} from "@/lib/creator/creator-words";
import { isDeadToken } from "@/lib/api/errors";
import { LoadingState, Skeleton, describeError } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { CreatorLinkActions } from "./creator-link-actions";

/**
 * "Your links", on Account (yuvoy-app#207, R12-T2; the phone's is
 * yuvoy-mobile#389).
 *
 * A traveller who went on something can get one share link to it, and every
 * open and booking through it is counted here. Counts only: no amount, no
 * earning, nothing about who booked.
 *
 * ## When it is drawn
 *
 * Only while the `creator` release is open to this traveller, and then when
 * creator tools are on or there is at least one link: somebody who turned the
 * tools off still sees a link they made on the phone. While either is still
 * being found out nothing is drawn, so the section never shows for a moment
 * to somebody it is not for. A `404` from the list is the API saying the
 * release is closed to them, and the section is not drawn either.
 *
 * With the tools on it has every state: loading, the list, empty, and a
 * failure with Try again. With them off a failed read draws nothing, since
 * there is no telling whether there was anything to show.
 *
 * Mounted by the signed-in Account only, so it never asks signed out.
 */
export function YourLinks({ toolsOn }: { toolsOn: boolean }) {
  const { refresh } = useTravellerSession();
  const release = useRelease("creator");
  const links = useMyCreatorLinks(release.open);

  if (!release.open) return null;
  if (links.isLoadingError && isReleaseClosed(links.error)) return null;

  const items = links.data?.items ?? [];
  if (!toolsOn && items.length === 0) return null;

  return (
    <section aria-labelledby="your-links" className="mt-10">
      <h2
        id="your-links"
        className="label text-forest/75 border-paper-line border-b pb-2"
      >
        {W.title}
      </h2>
      <p className="text-forest/70 text-body mt-3 text-pretty">{W.intro}</p>

      {links.isPending ? (
        <LoadingState label={W.loading}>
          <div className="mt-3 space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </LoadingState>
      ) : links.isLoadingError ? (
        <Panel role="alert" className="mt-3 px-4 py-3">
          <p className="text-sm font-bold">
            {isDeadToken(links.error) ? W.signedOut.title : W.failed}
          </p>
          <p className="text-forest/70 mt-1 text-sm">
            {isDeadToken(links.error)
              ? W.signedOut.body
              : describeError(links.error).body}
          </p>
          {isDeadToken(links.error) ? (
            /*
              The proxy has already dropped the cookie. Reading the session
              again turns Account into its sign-in, which is the way back.
            */
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void refresh()}
            >
              {W.signedOut.action}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              pending={links.isFetching}
              pendingLabel={W.retrying}
              onClick={() => void links.refetch()}
            >
              {W.retry}
            </Button>
          )}
        </Panel>
      ) : items.length === 0 ? (
        <p className="text-forest/70 text-body mt-3 text-pretty">{W.empty}</p>
      ) : (
        <ul className="divide-paper-line mt-1 divide-y">
          {items.map((link) => (
            <li key={link.code} className="py-4" data-testid="creator-link">
              <LinkRow link={link} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One link: what it is to, its counts, the day of its latest booking, and
 * the two ways to pass it on. A listing that is no longer listed keeps its
 * row and its counts: the API does not filter on listing state, and nor does
 * this.
 */
function LinkRow({ link }: { link: CreatorLink }) {
  const latest = latestBooking(link);
  // Every row's buttons are named alike, so each is described by its title.
  const titleId = useId();
  return (
    <div>
      <p id={titleId} className="text-sm font-bold text-balance">
        {link.target.title}
      </p>
      <p className="text-forest/80 mt-1 text-sm tabular-nums">
        {linkCounts(link)}
      </p>
      {latest ? (
        <p className="text-forest/70 mt-1 text-sm tabular-nums">{latest}</p>
      ) : null}
      <CreatorLinkActions link={link} describedBy={titleId} className="mt-3" />
    </div>
  );
}
