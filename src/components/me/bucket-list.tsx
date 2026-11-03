"use client";

import Image from "next/image";
import Link from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { LoadingState, Skeleton } from "@/components/states";
import { useAccountSavedList } from "@/lib/feed/use-saved";
import { ME_WORDS } from "@/lib/me/words";

/**
 * The Bucket list tab (yuvoy-mobile#444): everything the person saved, which
 * is the account's saved list (`/me/saved`), newest first, a page at a time.
 * Not a second list: a save made anywhere shows here, and removing one is
 * done where it was saved or on Saved.
 */
export function BucketList() {
  const list = useAccountSavedList(true);

  if (list.isPending) {
    return (
      <LoadingState label={ME_WORDS.loadingLifeList}>
        <div className="space-y-2">
          <Skeleton className="h-18 w-full" />
          <Skeleton className="h-18 w-full" />
        </div>
      </LoadingState>
    );
  }
  if (list.isLoadingError) {
    return (
      <p role="alert" className="text-forest/80 text-sm text-pretty">
        {ME_WORDS.lifeListError}
      </p>
    );
  }

  // Each id once, as Saved does: a page read again can repeat a row.
  const seen = new Set<string>();
  const items = (list.data?.pages ?? [])
    .flatMap((page) => page.items)
    .filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));

  if (items.length === 0) {
    return (
      <p className="text-forest/75 text-sm text-pretty">
        {ME_WORDS.emptyBucket}
      </p>
    );
  }

  return (
    <div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/e/${encodeURIComponent(item.slug)}`}
              className="border-paper-line bg-paper-deep rounded-card hover:border-forest/40 flex items-center gap-3 border p-3"
            >
              <span className="rounded-tile bg-paper relative size-18 shrink-0 overflow-hidden">
                {item.heroMedia?.posterUrl ? (
                  <Image
                    src={item.heroMedia.posterUrl}
                    alt=""
                    fill
                    sizes="72px"
                    className="object-cover"
                    unoptimized={item.heroMedia.posterUrl.startsWith("data:")}
                  />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-body block leading-snug font-bold text-pretty">
                  {item.title}
                </span>
                {item.location ? (
                  <span className="text-forest/70 block text-xs">
                    {item.location}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {list.isFetchNextPageError ? (
        <p role="alert" className="text-terra-deep mt-3 text-xs">
          {ME_WORDS.moreFailed}
        </p>
      ) : null}
      {list.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            pending={list.isFetchingNextPage}
            pendingLabel={ME_WORDS.loadingMore}
            onClick={() => {
              if (!list.isFetchingNextPage) void list.fetchNextPage();
            }}
          >
            {ME_WORDS.showMore}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
