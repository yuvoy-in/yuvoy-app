"use client";

import Link from "@/components/ui/link";
import type { components } from "@/lib/api/schema.gen";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format/money";
import { NO_LONGER_LISTED } from "@/lib/trigo/words";

export type TrigoCard = components["schemas"]["TrigoCard"];

/**
 * The cards under a Trigo reply (yuvoy-app#223 (b)): up to 6 listings or
 * found events the server took out of the reply's text. Every line on a live
 * card is the server's own (title, place, when, price words, check line), so
 * nothing here is the model's and nothing is made up on the web.
 *
 * A live card opens its page (`href`, an app path). A card whose listing or
 * event is gone (`available: false`) still shows, so the reply reads right,
 * but greyed, with no link, and "No longer listed on Yuvoy." where the price
 * would be.
 */
export function ReplyCards({ cards }: { cards: TrigoCard[] }) {
  if (cards.length === 0) return null;
  return (
    <ul className="flex w-full max-w-[85%] flex-col gap-2" aria-label="Cards">
      {cards.map((card) => (
        <li key={card.cardId}>
          <ReplyCard card={card} />
        </li>
      ))}
    </ul>
  );
}

const BOX =
  "border-paper-line bg-paper rounded-card text-forest flex flex-col gap-1 border px-4 py-3";

/** The price line: the server's words, after the amount when there is one. */
function priceOf(card: TrigoCard): string | null {
  const amount = card.price ? formatMoney(card.price) : null;
  const words = card.priceText ?? null;
  if (amount && words) return `${amount} ${words}`;
  return amount ?? words;
}

function ReplyCard({ card }: { card: TrigoCard }) {
  const where = [card.placeName, card.whenText].filter(Boolean).join(" · ");

  if (!card.available) {
    return (
      <div className={BOX} data-testid="trigo-card-gone">
        <p className="text-body text-forest/70 font-medium text-pretty">
          {card.title}
        </p>
        {where ? (
          <p className="text-body text-forest/70 text-pretty">{where}</p>
        ) : null}
        <p className="text-body text-pretty">{NO_LONGER_LISTED}</p>
      </div>
    );
  }

  const price = priceOf(card);
  return (
    <Link
      href={card.href}
      className={cn(BOX, "hover:border-forest focus-visible:border-forest")}
      data-testid="trigo-card"
    >
      <span className="text-body font-medium text-pretty underline">
        {card.title}
      </span>
      {where ? <span className="text-body text-pretty">{where}</span> : null}
      {price ? <span className="text-body text-pretty">{price}</span> : null}
      <span className="label text-forest/75">{card.checkLabel}</span>
    </Link>
  );
}
