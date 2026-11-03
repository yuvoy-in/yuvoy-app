"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { LoadingState, Skeleton } from "@/components/states";
import { ME_WORDS, lifeDate, progressLine } from "@/lib/me/words";
import { useMarkBadgesSeen } from "@/lib/me/use-badges";
import { nextNewBadge } from "@/lib/me/me-helpers";
import type { Badge, BadgeProgress } from "@/lib/me/types";

/**
 * Badges on Me (yuvoy-mobile#444): a badge the person has not been shown yet,
 * once; the earned ones with their emoji, name and date (a tap opens what
 * earned it); then those on their way, "1 of 2". No grid, no streak, no tier.
 */
export function Badges({
  earned,
  inProgress,
}: {
  earned: readonly Badge[];
  inProgress: readonly BadgeProgress[];
}) {
  const ids = useId();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section aria-labelledby={`${ids}-head`} className="space-y-3">
      <h2 id={`${ids}-head`} className="label text-forest/75">
        {ME_WORDS.badges}
      </h2>
      <NewBadge earned={earned} />
      {earned.length === 0 ? (
        <p className="text-forest/75 text-sm text-pretty">
          {ME_WORDS.emptyBadges}
        </p>
      ) : null}
      {earned.length > 0 || inProgress.length > 0 ? (
        <ul className="space-y-2">
          {earned.map((badge) => (
            <EarnedRow
              key={badge.key}
              badge={badge}
              open={open === badge.key}
              onToggle={() =>
                setOpen((was) => (was === badge.key ? null : badge.key))
              }
            />
          ))}
          {inProgress.map((badge) => (
            <ProgressRow key={badge.key} badge={badge} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** The badges' place while their first read is out. */
export function BadgesLoading() {
  return (
    <LoadingState label={ME_WORDS.loadingLifeList}>
      <Skeleton className="h-14 w-full" />
    </LoadingState>
  );
}

function EarnedRow({
  badge,
  open,
  onToggle,
}: {
  badge: Badge;
  open: boolean;
  onToggle: () => void;
}) {
  const ids = useId();
  const date = lifeDate(badge.earnedAt);
  const evidenceId = `${ids}-from`;
  // No evidence, no heading: "Earned from" over nothing says nothing.
  const hasEvidence = badge.evidence.length > 0;
  const head = (
    <>
      <span aria-hidden="true" className="text-3xl leading-none">
        {badge.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-body block font-bold">{badge.name}</span>
        {date ? (
          <span className="text-forest/70 block text-xs">{date}</span>
        ) : null}
      </span>
    </>
  );
  return (
    <li className="border-paper-line bg-paper-deep rounded-card border p-3">
      {/* A button only where the tap opens something. */}
      {hasEvidence ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={evidenceId}
          onClick={onToggle}
          className="flex min-h-11 w-full items-center gap-3 text-left"
        >
          {head}
        </button>
      ) : (
        <div className="flex items-center gap-3">{head}</div>
      )}
      <p className="text-forest/75 mt-2 text-xs">{badge.description}</p>
      {badge.checked ? null : (
        <p className="text-forest/75 mt-1 text-xs">{ME_WORDS.onlyYouBadge}</p>
      )}
      {hasEvidence ? (
        <div id={evidenceId} hidden={!open} className="mt-2">
          <p className="label text-forest/70">{ME_WORDS.earnedFrom}</p>
          <ul className="mt-1 space-y-0.5">
            {badge.evidence.map((entry) => (
              <li key={entry.entryId} className="text-xs">
                {[entry.title, lifeDate(entry.happenedAt)]
                  .filter(Boolean)
                  .join(" · ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function ProgressRow({ badge }: { badge: BadgeProgress }) {
  return (
    <li className="border-paper-line rounded-card flex items-center gap-3 border p-3">
      <span aria-hidden="true" className="text-3xl leading-none opacity-50">
        {badge.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-body block font-bold">{badge.name}</span>
        <span className="text-forest/70 block text-xs">
          {progressLine(badge)}
        </span>
      </span>
    </li>
  );
}

/**
 * A badge earned since the person last looked: "New badge: {name}", once,
 * with Nice, which marks it seen. It goes at the tap and does not come back
 * while the mark is out; with two new, the second follows the first. A Nice
 * that did not save brings it back with the line that says so.
 */
function NewBadge({ earned }: { earned: readonly Badge[] }) {
  const ids = useId();
  const seen = useMarkBadgesSeen();
  const [asked, setAsked] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState<string | null>(null);
  const badge = nextNewBadge(earned, asked);
  if (!badge) return null;

  const nice = () => {
    const key = badge.key;
    setFailed(null);
    setAsked((was) => new Set(was).add(key));
    seen.mutate([key], {
      onError: () => {
        setAsked((was) => {
          const next = new Set(was);
          next.delete(key);
          return next;
        });
        setFailed(key);
      },
    });
  };

  return (
    <Panel role="status" aria-labelledby={`${ids}-name`} className="space-y-2">
      <p aria-hidden="true" className="text-4xl leading-none">
        {badge.emoji}
      </p>
      <h3 id={`${ids}-name`} className="text-body font-bold">
        {ME_WORDS.newBadge(badge.name)}
      </h3>
      <p className="text-forest/75 text-sm">{badge.description}</p>
      <Button size="sm" onClick={nice}>
        {ME_WORDS.nice}
      </Button>
      {failed === badge.key ? (
        <p role="alert" className="text-terra-deep text-xs">
          {ME_WORDS.saveFailed}
        </p>
      ) : null}
    </Panel>
  );
}
