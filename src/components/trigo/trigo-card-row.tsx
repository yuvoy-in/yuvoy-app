"use client";

import Link from "@/components/ui/link";
import { ChevronRightIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format/money";
import {
  trigoCardListed,
  trigoCheckLook,
  trigoListCardPath,
} from "@/lib/trigo/lists";
import {
  TRIGO_LISTS_WORDS as W,
  type TrigoCard,
} from "@/lib/trigo/lists-words";

/**
 * One Trigo card in a list (yuvoy-app#220), the phone's `TrigoCardRow`
 * (yuvoy-mobile#456): the title, where and when, the price and the check
 * line, and for a found event the place it was found.
 *
 * It opens the card's own page only when the card is still listed and its
 * `cardId` names one (`trigoListCardPath`). `href` is never followed. A card
 * that is gone, or a found event that lost its title, says "No longer listed"
 * and opens nothing.
 */

/** The source line, only where the check line does not already name it. */
function sourceOf(card: TrigoCard, source: boolean, listed: boolean) {
  if (!source || card.kind !== "event" || !listed) return null;
  const name = card.sourceName?.trim();
  if (!name || card.checkLabel.includes(name)) return null;
  return name;
}

/** `₹4,500 per person`, the server's words alone, or nothing. */
function priceOf(card: TrigoCard): string {
  const money = card.price ? formatMoney(card.price) : "";
  const words = card.priceText?.trim() ?? "";
  if (money && words) return `${money} ${words}`;
  return money || words;
}

export function TrigoCardRow({
  card,
  source = false,
  small = false,
}: {
  card: TrigoCard;
  /** Show where a found event came from. */
  source?: boolean;
  /** The smaller title, for a card inside a trip draft's day. */
  small?: boolean;
}) {
  const listed = trigoCardListed(card);
  const title = card.title.trim();
  const path = listed ? trigoListCardPath(card) : null;
  const meta = [card.placeName?.trim(), listed ? card.whenText?.trim() : null]
    .filter(Boolean)
    .join(" · ");
  const price = listed ? priceOf(card) : "";
  const from = sourceOf(card, source, listed);
  const found = trigoCheckLook(card) === "found";

  const body = (
    <div className="min-w-0 flex-1">
      <p
        className={cn(
          "voice-host text-balance break-words",
          small ? "text-base" : "text-lg",
          !listed && "text-forest/70",
        )}
      >
        {title || W.noLonger}
      </p>
      {meta ? (
        <p className="text-forest/75 mt-1 text-sm break-words">{meta}</p>
      ) : null}
      {listed ? (
        <p className="mt-1 text-sm break-words">
          {price ? <span className="font-bold">{price}</span> : null}
          {price ? " · " : null}
          <span className={found ? "text-terra-deep" : "text-forest/80"}>
            {card.checkLabel}
          </span>
        </p>
      ) : title ? (
        <p className="text-forest/80 mt-1 text-sm">{W.noLonger}</p>
      ) : null}
      {from ? (
        <p className="text-forest/75 mt-1 text-sm break-words">{from}</p>
      ) : null}
    </div>
  );

  if (!path) {
    return <div className="flex items-start gap-3 py-3">{body}</div>;
  }

  const label = [
    title,
    card.placeName?.trim(),
    card.whenText?.trim(),
    price,
    card.checkLabel,
    from,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      href={path}
      aria-label={label}
      className="hover:bg-paper-deep ease-interaction -mx-2 flex items-start gap-3 rounded-xl px-2 py-3 transition-colors duration-200"
    >
      {body}
      <ChevronRightIcon className="text-forest/70 mt-1" />
    </Link>
  );
}
