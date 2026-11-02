"use client";

import { Button } from "@/components/ui/button";
import {
  FOLLOW_WORDS,
  followFailure,
  isFollowing,
  type ClubFollows,
  type FollowedClub,
} from "@/lib/groups/follows";
import { useFollowClub, useUnfollowClub } from "@/lib/groups/use-follows";

/**
 * Follow a group, on its card and on its page (yuvoy-mobile#392, web half).
 *
 * The page reads the follows list once and passes it down; the button never
 * reads per card. It reads Following once followed, and a tap on Following
 * stops following. The list changes only once the API has taken the tap.
 *
 * Each button keeps its own writes, so one group's Sending or refusal never
 * shows on another (review-392, low 8).
 *
 * Waits for yuvoy-app#386 (the card and the group page render it) and #222
 * (the age and name steps; until then those refusals show their line).
 */
export function FollowButton({
  club,
  follows,
}: {
  club: FollowedClub;
  follows: ClubFollows | undefined;
}) {
  const follow = useFollowClub();
  const unfollow = useUnfollowClub();
  const following = isFollowing(follows, club.clubId);
  const busy = follow.isPending || unfollow.isPending;
  const error = following ? unfollow.error : follow.error;

  const tap = () => {
    if (following) {
      follow.reset();
      unfollow.unfollow({ clubId: club.clubId });
    } else {
      unfollow.reset();
      follow.follow({ clubId: club.clubId, club });
    }
  };

  const failure = error ? followFailure(error) : null;
  return (
    <div>
      <Button
        size="sm"
        variant={following ? "outline" : "primary"}
        aria-pressed={following}
        aria-label={
          following
            ? FOLLOW_WORDS.followingLabel(club.name)
            : FOLLOW_WORDS.followLabel(club.name)
        }
        pending={busy}
        pendingLabel={FOLLOW_WORDS.sending}
        onClick={tap}
      >
        {following ? FOLLOW_WORDS.following : FOLLOW_WORDS.follow}
      </Button>
      {failure ? (
        <div role="alert" className="mt-2">
          <p className="text-sm">{failure.line}</p>
          {failure.retry ? (
            <Button size="sm" variant="ghost" className="mt-1" onClick={tap}>
              {FOLLOW_WORDS.tryAgain}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * In place of every Follow button while the follows list cannot be read:
 * one line and Try again. The directory and the group page stay as they are.
 */
export function FollowsUnavailable({
  retrying,
  onRetry,
}: {
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div role="alert">
      <p className="text-sm">{FOLLOW_WORDS.unavailable}</p>
      <Button
        size="sm"
        variant="outline"
        className="mt-2"
        pending={retrying}
        pendingLabel="Trying again"
        onClick={onRetry}
      >
        {FOLLOW_WORDS.tryAgain}
      </Button>
    </div>
  );
}
