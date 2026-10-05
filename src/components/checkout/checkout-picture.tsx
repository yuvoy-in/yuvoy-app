import { formatFromPrice } from "@/lib/format/money";
import { PictureStrip } from "@/components/chrome/picture-strip";
import type { components } from "@/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];

/**
 * The listing's picture, kept at the top of checkout (the approved redesign,
 * traveller A, 3 Oct 2026): a strip of it, with the price and the title over
 * its foot, and the sheet rising over it as on the listing. The traveller
 * filling in a form is still looking at the thing they are booking.
 *
 * Null for a listing with no picture at all, and the screen keeps its plain
 * stage header.
 */
export function CheckoutPicture({ experience }: { experience: Experience }) {
  const media = experience.heroMedia ?? experience.gallery?.[0];
  if (!media) return null;
  const price = formatFromPrice(experience.fromPrice);

  return (
    <PictureStrip src={media.posterUrl}>
      {price ? (
        <p className="label text-paper">
          {/* The server's unit phrase, verbatim, as on the listing. */}
          {experience.pricingUnitLabel
            ? `${price} ${experience.pricingUnitLabel} · all-in`
            : `${price} · all-in`}
        </p>
      ) : null}
      <p className="voice-host text-paper leading-display mt-1 line-clamp-2 text-[22px] text-balance">
        {experience.title}
      </p>
    </PictureStrip>
  );
}
