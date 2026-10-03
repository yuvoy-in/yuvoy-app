"use client";

import { useSavedReels } from "@/lib/feed/saved-reels";
import {
  ReelFrame,
  ReelStrip,
  REEL_WELL_CENTRED,
} from "@/components/feed/reel-strip";
import { BackButton } from "@/components/chrome/back-button";
import { EmptyState, LoadingState, Skeleton } from "@/components/states";
import { Button } from "@/components/ui/button";

/**
 * Your saves, playing (the approved redesign: "Saved plays as a reel, with a
 * grid toggle", traveller A, 3 Oct 2026).
 *
 * The grid is where a traveller decides; this is where they remember why they
 * saved something. One reel per saved listing, its headline clip, in the
 * order they were saved, opened on the one they tapped. Back is the way to the
 * grid: it is the toggle's other half.
 *
 * Opened on a listing by its experience id. A save removed since, or one with
 * no clip, says so with the way back rather than playing something else.
 */
export function SavedReelScreen({ experienceId }: { experienceId: string }) {
  const saved = useSavedReels();
  const index = saved.items.findIndex(
    (reel) => reel.experience?.id === experienceId,
  );

  const back = <BackButton href="/saved" label="your saved experiences" />;

  if (saved.state === "pending") {
    return (
      <LoadingState label="Loading your saves">
        <ReelFrame>
          <Skeleton className="absolute inset-0 rounded-none" />
        </ReelFrame>
      </LoadingState>
    );
  }

  if (saved.state === "error") {
    return (
      <ReelFrame className={REEL_WELL_CENTRED}>
        <EmptyState
          tone="dark"
          title="Your saves did not load"
          body="They are still saved. Try again, or see them as a grid."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="paper" onClick={saved.retry}>
                Try again
              </Button>
              {back}
            </div>
          }
        />
      </ReelFrame>
    );
  }

  if (index === -1) {
    return (
      <ReelFrame className={REEL_WELL_CENTRED}>
        <EmptyState
          tone="dark"
          title="This one is not in your saves any more"
          body="It may have been removed, or it has no clip to play. The rest are in the grid."
          action={back}
        />
      </ReelFrame>
    );
  }

  return (
    <>
      <h1 className="sr-only">
        {saved.items[index].experience?.title ?? "A saved experience"}
      </h1>
      <ReelStrip
        items={saved.items}
        tail={saved.tail}
        initialIndex={index}
        hasNextPage={saved.hasNextPage}
        isFetchingNextPage={saved.isFetchingNextPage}
        isFetchNextPageError={saved.isFetchNextPageError}
        fetchNextPage={saved.fetchNextPage}
        emptyTailNote="That is everything you have saved."
        chrome={
          /*
            The way back to the grid, as on a business's reels: the tab bar is
            hidden here, so this is the only exit, on every viewport.
          */
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start px-4 pt-4 pb-20">
            <span className="pointer-events-auto">{back}</span>
          </div>
        }
      />
    </>
  );
}
