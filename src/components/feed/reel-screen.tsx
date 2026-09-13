"use client";

import { useReels } from "@/lib/feed/use-reels";
import { playableReels, feedTail, type Reel } from "@/lib/feed/reels";
import { ReelMasthead, ReelStrip } from "./reel-strip";

/**
 * A shared reel — `/r/{media.id}`, yuvoy-app#36.
 *
 * Somebody sharing a clip means the clip, so the link opens the clip rather
 * than a page about it. The reel itself is fetched on the server and handed
 * down here; the general feed pages in underneath it, which is exactly what
 * the contract prescribes: "This returns the reel alone. To swipe on from it,
 * page `GET /reels` as usual."
 *
 * ## The shared reel is pinned first, and cannot appear twice
 *
 * The feed's own ordering is a rotation across operators and does not know
 * about this reel, so the very clip somebody opened would otherwise turn up
 * again a few swipes down. `playableReels` already drops a media id it has
 * seen — the guard written for a cursor that repeats a row — and putting the
 * shared reel in front of the feed's pages makes that guard do this job too,
 * rather than adding a second de-duplication rule beside it.
 *
 * ## Why the feed's query is reused rather than a fresh one
 *
 * `useReels` with no initial data is the same cache entry the home feed fills,
 * so a traveller who opens a shared reel and then taps the feed tab does not
 * re-download twelve reels they are already holding.
 */
export function ReelScreen({ reel }: { reel: Reel }) {
  const {
    data,
    isFetchNextPageError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useReels();

  const items = playableReels([
    { items: [reel], complete: false },
    ...(data?.pages ?? []),
  ]);

  /*
    The tail belongs to the FEED's pages, not to the pinned reel.

    `feedTail` reads the last page, and a synthesised page for one reel is
    never the last one once anything else has loaded — but it is while the feed
    is still in flight, and it says `complete: false` with no cursor, which
    `feedTail` reads as `server_stopped`. That would tell somebody who has just
    opened a shared link that we cannot load any more, one reel in, while the
    feed is loading fine. So the tail is asked of the real pages, and until
    there are any the answer is "more", which is true: a request is out.
  */
  const tail = data?.pages.length ? feedTail(data.pages) : "more";

  return (
    <>
      {/*
        The heading names the reel rather than the page. A traveller arriving
        from a message has no context at all, and "Experiences in the Andaman
        Islands" would be a heading about a screen they did not ask for.
      */}
      <h1 className="sr-only">{reel.experience!.title}</h1>
      <ReelStrip
        items={items}
        tail={tail}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isFetchNextPageError={isFetchNextPageError}
        fetchNextPage={() => void fetchNextPage()}
        chrome={<ReelMasthead href="/" />}
      />
    </>
  );
}
