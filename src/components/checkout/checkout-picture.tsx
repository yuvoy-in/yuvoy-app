import Image from "next/image";
import { formatFromPrice } from "@/lib/format/money";
import type { components } from "@/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];

/** The strip's height: a glance, not a hero. Held while checkout loads too. */
export const PICTURE_HEIGHT = "h-[24svh] min-h-36 lg:h-48";

/**
 * The listing's picture, kept at the top of checkout (the approved redesign,
 * traveller A, 3 Oct 2026): a strip of it, with the price and the title over
 * its foot, and the sheet rising over it as on the listing. The traveller
 * filling in a form is still looking at the thing they are booking.
 *
 * Decorative (`alt=""`): the title is written over it, and a second reading
 * of the same picture in a form is noise to a screen reader. The scrim is
 * measured (`strip-scrim`), and the caption sits above the sheet's rise
 * (`--hero-overlap`), so neither the sheet nor a bright frame can hide it.
 *
 * Null for a listing with no picture at all, and the screen keeps its plain
 * stage header.
 */
export function CheckoutPicture({ experience }: { experience: Experience }) {
  const media = experience.heroMedia ?? experience.gallery?.[0];
  if (!media) return null;
  const price = formatFromPrice(experience.fromPrice);

  return (
    <div className={`bg-abyss relative overflow-hidden ${PICTURE_HEIGHT}`}>
      <Image
        src={media.posterUrl}
        alt=""
        fill
        sizes="(min-width: 1024px) 576px, 100vw"
        className="object-cover"
        unoptimized={media.posterUrl.startsWith("data:")}
      />
      <div aria-hidden="true" className="strip-scrim absolute inset-0" />
      <div className="container-page absolute inset-x-0 bottom-[calc(var(--hero-overlap,0px)+1rem)] max-w-xl">
        {price ? (
          <p className="label text-paper">
            {/* The server's unit phrase, verbatim, as on the listing. */}
            {experience.pricingUnitLabel
              ? `${price} ${experience.pricingUnitLabel} · all-in`
              : `${price} · all-in`}
          </p>
        ) : null}
        <p className="font-display tracking-display text-paper mt-1 line-clamp-2 text-[22px] leading-[1.1]">
          {experience.title}
        </p>
      </div>
    </div>
  );
}

/**
 * The strip's ground while checkout loads, so the sheet does not jump down by
 * the height of the picture when it arrives.
 */
export function PicturePlaceholder() {
  return <div aria-hidden="true" className={`bg-abyss ${PICTURE_HEIGHT}`} />;
}
