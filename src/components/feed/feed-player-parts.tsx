import { cn } from "@/lib/cn";

/**
 * The round play control over a stopped clip. When it is drawn, and why, is
 * `FeedPlayer`'s to say. Moved out of `feed-player.tsx` as it was
 * (yuvoy-app#243).
 */
export function PlayDisc({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2",
        "grid size-16 place-items-center rounded-full",
        "bg-abyss/55 text-paper backdrop-blur-sm",
        "motion-disc hover:bg-abyss/70 active:scale-95",
        "focus-visible:ring-paper focus-visible:ring-2 focus-visible:outline-none",
      )}
    >
      {/*
        A triangle, nudged right of centre. An optically centred play glyph
        sits about 8% right of true centre, and the difference reads as a
        wobble at this size.
      */}
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className="size-7 translate-x-[2px]"
      >
        <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.29-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
      </svg>
    </button>
  );
}

/**
 * A clip that is taking its time, saying so. See `slowStart` in
 * `feed-player.tsx`: `slow` is that.
 *
 * Deliberately not the play button's twin: it is smaller, it is not a
 * target, and it carries no glyph anybody could read as "tap here". A
 * traveller must never learn to tap a thing that is already working.
 *
 * `role="status"` with a label rather than a bare spinner, because on a
 * screen reader an unlabelled spinning div is nothing at all.
 */
export function SlowRing({ slow }: { slow: boolean }) {
  return (
    <div
      role={slow ? "status" : undefined}
      aria-label={slow ? "Loading video" : undefined}
      aria-hidden={slow ? undefined : true}
      data-shown={slow}
      data-motion=""
      className="feed-slow-ring absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
    >
      <span className="border-paper/30 border-t-paper block size-8 rounded-full border-2" />
    </div>
  );
}
