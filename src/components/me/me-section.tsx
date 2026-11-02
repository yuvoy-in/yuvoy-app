"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { ChipButton } from "@/components/ui/chip";
import { LoadingState, Skeleton } from "@/components/states";
import { useRelease } from "@/lib/site/use-release";
import { usePlaceList } from "@/lib/site/use-place";
import { useSaved } from "@/lib/feed/use-saved";
import { ME_WORDS, headerLine } from "@/lib/me/words";
import {
  isMeClosed,
  useLifeList,
  useSetEntryVisibility,
} from "@/lib/me/use-life-list";
import { useBadges } from "@/lib/me/use-badges";
import { Badges, BadgesLoading } from "./badges";
import { BucketList } from "./bucket-list";
import { DidYouGo } from "./did-you-go";
import { LifeEntryCard } from "./life-entry-card";
import { placeName } from "./me-format";

/*
  Me on the signed-in Account screen (yuvoy-mobile#444), behind the `me`
  release. Each part checks the release itself, so with `me` closed, or not
  decided yet, every one of them draws nothing and asks the API nothing: the
  Account screen is exactly the one before Me.
*/

/** Whether Me is open to this traveller: shut while the release is unknown. */
export function useMeOpen(): boolean {
  return useRelease("me").open;
}

/**
 * Under the name: "Done {n} · Bucket list {n} · Badges {n}", once the life
 * list's first page and the badges have both answered. Before that, and when
 * either failed, no line rather than a row of zeros that is not true.
 */
export function MeCounts() {
  return useMeOpen() ? <Counts /> : null;
}

function Counts() {
  const list = useLifeList(true);
  const badges = useBadges(true);
  const { savedIds } = useSaved();
  if (list.closed || !list.counts || !badges.data) return null;
  return (
    <p className="text-forest/80 mt-1 text-sm">
      {headerLine({
        done: list.counts.done,
        saved: savedIds.length,
        badges: badges.data.earned.length,
      })}
    </p>
  );
}

/**
 * What the person did: Did you go?, the life list with its two tabs, then
 * the badges. A failed read says so once, in its place, and the rest of
 * Account goes on working under it.
 */
export function MeSection({ className }: { className?: string }) {
  return useMeOpen() ? <Section className={className} /> : null;
}

function Section({ className }: { className?: string }) {
  const list = useLifeList(true);
  const badges = useBadges(true);
  // Closed to this person (every `me` route answers 404): nothing at all.
  if (list.closed || isMeClosed(badges.error)) return null;
  // Failed with nothing read: a read again that fails keeps what is shown.
  const listFailed = list.status === "error" && !list.counts;
  return (
    <div className={className}>
      <div className="space-y-8">
        {list.didYouGo.length > 0 ? <DidYouGo items={list.didYouGo} /> : null}
        {listFailed ? <Failed /> : <LifeListTabs />}
        {badges.data ? (
          <Badges earned={badges.data.earned} inProgress={badges.data.inProgress} />
        ) : badges.isLoadingError ? (
          // One failure line for the two reads, not two of the same.
          listFailed ? null : (
            <Failed />
          )
        ) : (
          <BadgesLoading />
        )}
      </div>
    </div>
  );
}

function Failed() {
  return (
    <p role="alert" className="text-forest/80 text-sm text-pretty">
      {ME_WORDS.lifeListError}
    </p>
  );
}

type Tab = "done" | "bucket";
const TABS: readonly { value: Tab; label: string }[] = [
  { value: "done", label: ME_WORDS.done },
  { value: "bucket", label: ME_WORDS.bucketList },
];

/**
 * Done and Bucket list as tabs, the pattern Trips uses (`trip-tabs.tsx`):
 * only the chosen tab is in the Tab order, and the arrow keys move between
 * them.
 */
function LifeListTabs() {
  const ids = useId();
  const [tab, setTab] = useState<Tab>("done");
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({
    done: null,
    bucket: null,
  });

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next: Tab = tab === "done" ? "bucket" : "done";
    setTab(next);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={ME_WORDS.lifeListLabel}
        className="flex gap-2"
        onKeyDown={onKey}
      >
        {TABS.map((t) => (
          <ChipButton
            key={t.value}
            ref={(node: HTMLButtonElement | null) => {
              refs.current[t.value] = node;
            }}
            role="tab"
            id={`${ids}-tab-${t.value}`}
            aria-selected={tab === t.value}
            aria-controls={`${ids}-panel-${t.value}`}
            tabIndex={tab === t.value ? 0 : -1}
            pressed={tab === t.value}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </ChipButton>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${ids}-panel-${tab}`}
        aria-labelledby={`${ids}-tab-${tab}`}
        className="mt-4"
      >
        {tab === "done" ? <Done /> : <BucketList />}
      </div>
    </div>
  );
}

/** The Done tab: each entry newest first, a page at a time. */
function Done() {
  const list = useLifeList(true);
  const visibility = useSetEntryVisibility();
  const keyed = list.entries.some((entry) => entry.destinationKey);
  // The places list names a destination; only asked for once an entry has one.
  const places = usePlaceList({ initial: null, signedIn: true, enabled: keyed });

  if (list.status === "pending") {
    return (
      <LoadingState label={ME_WORDS.loadingLifeList}>
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </LoadingState>
    );
  }
  if (list.entries.length === 0) {
    return <p className="text-forest/75 text-sm text-pretty">{ME_WORDS.emptyDone}</p>;
  }

  // The hook shows a change at once and puts it back when it fails; the
  // page only says which entry's last change did not go through.
  const lastTried = visibility.variables?.entry.entryId;

  return (
    <div>
      <ul className="space-y-3">
        {list.entries.map((entry) => (
          <li key={entry.entryId}>
            <LifeEntryCard
              entry={entry}
              place={placeName(entry.destinationKey, places.data)}
              failed={Boolean(visibility.error) && lastTried === entry.entryId}
              onVisibility={(next) => visibility.mutate({ entry, visibility: next })}
              // A dead photo link is five minutes old: read the list again.
              onPhotoDied={list.refetch}
            />
          </li>
        ))}
      </ul>
      {list.moreFailed ? (
        <p role="alert" className="text-terra-deep mt-3 text-xs">
          {ME_WORDS.moreFailed}
        </p>
      ) : null}
      {list.hasMore ? (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            pending={list.loadingMore}
            pendingLabel={ME_WORDS.loadingMore}
            onClick={list.loadMore}
          >
            {ME_WORDS.showMore}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
