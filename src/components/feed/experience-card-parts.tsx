"use client";

import { useState, type RefObject } from "react";
import Link from "@/components/ui/link";
import { cn } from "@/lib/cn";
import type { components } from "@/lib/api/schema.gen";
import type { useSaved } from "@/lib/feed/use-saved";
import type { useSaveGate } from "@/components/auth/invite-guard";
import type { NextDeparture } from "@/lib/feed/availability";
import { IconButton } from "@/components/ui/icon-button";
import {
  BookmarkFilledIcon,
  BookmarkIcon,
  VolumeIcon,
  VolumeOffIcon,
} from "@/components/ui/icons";
import { ShareLink } from "@/components/ui/share-link";
import type { OutcomeSurface } from "@/lib/analytics/outcomes";

type ExperienceSummary = components["schemas"]["ExperienceSummary"];
type Media = components["schemas"]["Media"];

/**
 * The rail at the foot of `ExperienceCard`: sound, save, share and Book.
 * Moved here from `experience-card.tsx` (yuvoy-app#243) as it was, and drawn
 * in the same place. The card keeps the state and passes it in.
 */
export function CardRail({
  playable,
  muted,
  toggleMuted,
  saved,
  experience,
  askToSave,
  toggle,
  surface,
  index,
  media,
  href,
  departure,
}: {
  playable: boolean;
  muted: boolean;
  toggleMuted: () => void;
  saved: boolean;
  experience: ExperienceSummary;
  askToSave: ReturnType<typeof useSaveGate>;
  /** The latest `toggleSaved`, kept by the card (see the note there). */
  toggle: RefObject<ReturnType<typeof useSaved>["toggleSaved"]>;
  surface: OutcomeSurface;
  index: number;
  media?: Media;
  href: string;
  departure: NextDeparture;
}) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-3">
      {playable ? (
        <IconButton
          label={muted ? "Unmute" : "Mute"}
          variant="onDark"
          size="md"
          onClick={toggleMuted}
        >
          {muted ? <VolumeOffIcon /> : <VolumeIcon />}
        </IconButton>
      ) : null}

      {/*
        Save: a private wishlist, not a like.

        Nothing here is counted, published, or shown to an operator, which
        is why it is a bookmark and not a heart. Signed in it is kept on the
        account (yuvoy-api#192), signed out on this device; `use-saved`
        chooses, so this control never has to know which.
      */}
      <IconButton
        label={
          saved
            ? `Saved. Remove ${experience.title}`
            : `Save ${experience.title}`
        }
        variant="onDark"
        size="md"
        aria-pressed={saved}
        className={cn(
          "save-toggle",
          saved && "text-terra-soft ring-terra-soft/45",
        )}
        onClick={() =>
          askToSave(() =>
            toggle.current(experience.id, experience.slug, {
              surface,
              position: index,
            }),
          )
        }
      >
        {/*
          Both glyphs, always drawn, so a save is ONE change (T13 A): the
          outline gives way to the filled mark as it settles from 0.9,
          while the ring and the colour arrive, all in 150ms. Quiet on
          purpose: a pop would read as a like, and saves are private.
        */}
        <span className="save-glyphs" aria-hidden="true">
          <BookmarkIcon data-glyph="off" data-motion="" />
          <BookmarkFilledIcon data-glyph="on" data-motion="" />
        </span>
      </IconButton>

      {/*
        The REEL, not the listing. Somebody sharing a clip means the clip.
        A card with no clip has nothing to share but the listing, and says
        so in its own label rather than sending a `/r/` address for a reel
        that does not exist.
      */}
      <ShareLink
        path={media ? `/r/${media.id}` : href}
        title={experience.title}
        label={media ? "Share this reel" : "Share this experience"}
        variant="onDark"
        size="md"
        outcome={{
          subjectId: experience.id,
          surface,
          position: index,
        }}
      />

      <Link href={href} className="feed-book">
        {departure.bookable ? "Book" : "View"}
      </Link>
    </div>
  );
}

/**
 * The operator's mark on a card with no clip, in a box that is its full height
 * before it has loaded. The image alone had no size until it arrived, so the
 * centred title under it jumped by up to 80px when it did (stability audit,
 * 6 Oct 2026).
 *
 * A logo that fails to load leaves the box empty, never its alt text in the
 * middle of a reel. The check on mount catches one that failed before the page
 * hydrated, whose error event nothing was listening for yet.
 */
export function PlateLogo({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex h-20 w-full items-center justify-center">
      {failed ? null : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={(node) => {
            if (node?.complete && node.naturalWidth === 0) setFailed(true);
          }}
          src={src}
          alt={name}
          className="max-h-20 w-auto max-w-[40%] object-contain opacity-80"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
