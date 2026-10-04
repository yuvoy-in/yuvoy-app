import Image from "next/image";
import type { ReactNode } from "react";

/**
 * The strip's height: a glance, not a hero. Held while a screen loads too.
 * Said once, as `--hero-height`, so the far side's recede (T15 A) runs over
 * exactly the height the strip is drawn at.
 */
export const PICTURE_HEIGHT =
  "[--hero-height:max(24svh,9rem)] h-(--hero-height) lg:h-48";

/**
 * A strip of the listing's picture over the top of a screen, for `Screen`'s
 * `hero` (the approved redesign, traveller A, 3 Oct 2026): checkout keeps the
 * thing being booked in view, and a booking keeps the thing booked.
 *
 * Decorative (`alt=""`): the screen names the listing in words, and a second
 * reading of the same picture is noise to a screen reader. A caption, when
 * there is one, sits above the sheet's rise (`--hero-overlap`) under a
 * measured ramp (`strip-scrim`, pinned in `palette.test.ts`); with no caption
 * there is nothing to protect and the picture is left as it is, since the
 * floating Back disc carries its own ground.
 */
export function PictureStrip({
  src,
  children,
}: {
  src: string;
  /** Written over the picture's foot: a price, a title. */
  children?: ReactNode;
}) {
  return (
    <div
      // It recedes as the sheet covers it (T15 A, `far-side-picture`).
      data-motion=""
      className={`bg-abyss far-side-picture relative overflow-hidden ${PICTURE_HEIGHT}`}
    >
      <Image
        src={src}
        alt=""
        fill
        sizes="(min-width: 1024px) 576px, 100vw"
        className="object-cover"
        unoptimized={src.startsWith("data:")}
      />
      {children ? (
        <>
          <div aria-hidden="true" className="strip-scrim absolute inset-0" />
          <div className="container-page absolute inset-x-0 bottom-[calc(var(--hero-overlap,0px)+1rem)] max-w-xl">
            {children}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * The strip's ground while a screen loads, so the sheet does not jump down by
 * the height of the picture when it arrives.
 */
export function PicturePlaceholder() {
  return <div aria-hidden="true" className={`bg-abyss ${PICTURE_HEIGHT}`} />;
}
