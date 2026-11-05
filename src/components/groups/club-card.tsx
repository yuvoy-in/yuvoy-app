import Link from "@/components/ui/link";
import { cn } from "@/lib/cn";
import { CLUB_WORDS } from "@/lib/groups/club-words";
import { clubLabel, clubMeta, type Club } from "@/lib/groups/clubs";
import { Chip } from "@/components/ui/chip";
import { panelVariants } from "@/components/ui/panel";
import { groupHref } from "./form-parts";

/** "On Yuvoy" or "Not on Yuvoy yet", as a chip. */
export function ClubLabel({ club }: { club: Pick<Club, "onYuvoy"> }) {
  return (
    <Chip tone={club.onYuvoy ? "accent" : "neutral"} size="sm">
      {clubLabel(club)}
    </Chip>
  );
}

/**
 * One group in the directory (yuvoy-mobile#386): its emoji, name, the line
 * of what, when and where, "From {sourceName}" and the label. The whole card
 * opens the group's page. Nothing on it counts followers or shows a contact.
 * A long name or line wraps rather than run off the card.
 */
export function ClubCard({ club }: { club: Club }) {
  return (
    <Link
      href={groupHref(club.slug)}
      className={cn(
        panelVariants({ tone: "outline" }),
        "ease-interaction hover:border-forest/40 flex gap-4 transition-colors duration-200",
      )}
    >
      <span aria-hidden="true" className="text-3xl leading-none">
        {club.emoji}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-lg font-bold break-words">{club.name}</span>
        <span className="text-forest/70 text-sm break-words">
          {clubMeta(club)}
        </span>
        <span className="text-forest/70 text-sm break-words">
          {CLUB_WORDS.from(club.sourceName)}
        </span>
        <span className="mt-1">
          <ClubLabel club={club} />
        </span>
      </span>
    </Link>
  );
}
