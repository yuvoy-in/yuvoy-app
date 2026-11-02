"use client";

import { useId, useState } from "react";
import Link from "@/components/ui/link";
import { chipVariants } from "@/components/ui/chip";
import { DepartmentArt } from "@/components/found/department-art";
import { cn } from "@/lib/cn";
import {
  ME_WORDS,
  canSetVisibility,
  cheersLine,
  lifeDate,
  proofLine,
} from "@/lib/me/words";
import type { EntryVisibility, LifeEntry } from "@/lib/me/types";
import { entryTarget, starsOf } from "./me-format";

const CHOICES: readonly { value: EntryVisibility; label: string }[] = [
  { value: "friends", label: ME_WORDS.friends },
  { value: "only_me", label: ME_WORDS.onlyMe },
];

/**
 * One entry of the owner's life list (yuvoy-mobile#444): the photo or the
 * department's art, the title, the date and the place, the line that says
 * what proves it, the owner's stars, the cheers (a tap on them names who
 * cheered), then who sees it.
 *
 * A trip opens its listing and a went entry its card; a plan or a table opens
 * nothing, so its title is plain text rather than a link that goes nowhere.
 */
export function LifeEntryCard({
  entry,
  place,
  failed,
  onVisibility,
  onPhotoDied,
}: {
  entry: LifeEntry;
  /** The place's name from the places list, or empty. */
  place: string;
  /** The last change on this entry did not go through. */
  failed: boolean;
  onVisibility: (next: EntryVisibility) => void;
  /** The photo did not load: its five-minute link may have run out. */
  onPhotoDied: () => void;
}) {
  const ids = useId();
  const [names, setNames] = useState(false);
  const target = entryTarget(entry);
  const when = [lifeDate(entry.happenedAt), place].filter(Boolean).join(" · ");
  const stars = starsOf(entry.rating);
  const cheers = cheersLine(entry.cheers);
  const cheeredBy = entry.cheeredBy ?? [];
  const titleId = `${ids}-title`;
  const namesId = `${ids}-names`;

  return (
    <article
      aria-labelledby={titleId}
      className="border-paper-line bg-paper-deep rounded-card border p-3"
    >
      <div className="flex gap-3">
        <Photo entry={entry} onDied={onPhotoDied} />
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-body leading-snug font-bold">
            {target ? (
              <Link href={target} className="underline-offset-2 hover:underline">
                {entry.title}
              </Link>
            ) : (
              entry.title
            )}
          </h3>
          {when ? <p className="text-forest/70 mt-0.5 text-xs">{when}</p> : null}
          <p className="mt-1 text-sm font-medium">{proofLine(entry)}</p>
          {stars ? (
            <p
              role="img"
              aria-label={ME_WORDS.stars(stars)}
              className="text-terra-deep mt-0.5 text-sm"
            >
              {"★".repeat(stars)}
            </p>
          ) : null}
          {cheers && cheeredBy.length > 0 ? (
            <button
              type="button"
              aria-expanded={names}
              aria-controls={namesId}
              onClick={() => setNames((was) => !was)}
              className="text-forest mt-1 min-h-6 text-xs underline underline-offset-2"
            >
              {cheers}
            </button>
          ) : cheers ? (
            <p className="text-forest/70 mt-1 text-xs">{cheers}</p>
          ) : null}
          {cheers && cheeredBy.length > 0 ? (
            <p id={namesId} hidden={!names} className="text-forest/70 mt-1 text-xs">
              {cheeredBy.map((person) => person.shortName).join(", ")}
            </p>
          ) : null}
        </div>
      </div>
      <WhoSees entry={entry} onChange={onVisibility} name={`${ids}-who`} />
      {failed ? (
        <p role="alert" className="text-terra-deep mt-2 text-xs">
          {ME_WORDS.changeFailed}
        </p>
      ) : null}
    </article>
  );
}

/**
 * The photo, or the department's art in its place.
 *
 * A plain `<img>` on purpose: `photoUrl` is a signed read that lasts five
 * minutes and must never be stored, and the image optimiser would fetch it
 * from the server and keep a copy. A photo that does not load (the link ran
 * out, no signal) shows the art and asks for the list again, which carries a
 * fresh link; the same URL failing twice is not tried a second time.
 */
function Photo({ entry, onDied }: { entry: LifeEntry; onDied: () => void }) {
  const [broken, setBroken] = useState<string | null>(null);
  const url = entry.photoUrl ?? null;
  if (url && broken !== url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        data-testid="life-photo"
        className="rounded-tile size-18 shrink-0 object-cover"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => {
          setBroken(url);
          onDied();
        }}
      />
    );
  }
  return (
    <span data-testid="life-art" className="shrink-0">
      <DepartmentArt department={entry.category ?? null} className="size-18" />
    </span>
  );
}

/**
 * Who sees this: Friends or Only me, as two real radio buttons, on a trip, a
 * went entry or a table. A plan says it is only ever the owner's, with
 * nothing to change. An entry with no way to change it (a went entry with no
 * event) shows neither, rather than a choice that cannot be saved.
 */
function WhoSees({
  entry,
  onChange,
  name,
}: {
  entry: LifeEntry;
  onChange: (next: EntryVisibility) => void;
  name: string;
}) {
  if (!canSetVisibility(entry)) {
    if (entry.kind !== "plan") return null;
    return <p className="text-forest/70 mt-3 text-xs">{ME_WORDS.plansOnlyYou}</p>;
  }
  return (
    <fieldset
      className="mt-3 flex flex-wrap items-center gap-2"
      // Which entry it is about, as the phone says it ("Who sees {title}").
      aria-label={ME_WORDS.whoSeesLabel(entry.title)}
    >
      <span aria-hidden="true" className="text-forest/70 mr-1 text-xs">
        {ME_WORDS.whoSeesThis}
      </span>
      {CHOICES.map((choice) => {
        // Shown at once: the hook writes the choice before it is sent.
        const on = entry.visibility === choice.value;
        return (
          <label
            key={choice.value}
            className={cn(
              chipVariants({ size: "md", tone: on ? "selected" : "neutral" }),
              "cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
              !on && "hover:border-forest/40",
            )}
          >
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={on}
              onChange={() => {
                if (!on) onChange(choice.value);
              }}
              className="sr-only"
            />
            {choice.label}
          </label>
        );
      })}
    </fieldset>
  );
}
