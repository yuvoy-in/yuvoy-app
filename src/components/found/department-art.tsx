import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Category } from "@/lib/found/found-words";

/**
 * A found card's picture, which is not a picture (yuvoy-app#179).
 *
 * A found item carries no image the web may draw: what the finder saw on an
 * organiser's page is theirs, and a hot-linked poster is a request to their
 * server from every reader of our feed. So the department stands in: one
 * glyph each on one of three grounds, as the phone app draws it
 * (yuvoy-mobile `department-art.tsx`, the approved R2 page): forest for the
 * outdoors and the body, terra for what is made, eaten or performed, paper
 * for everyday life. A card with no department, or one this build has no
 * glyph for, takes the compass on forest.
 *
 * Decoration only, hidden from assistive technology: the department's NAME is
 * beside it in words when the vocabulary gives one, and the art claims
 * nothing the words do not.
 *
 * Strokes on the app's 24-unit grid at the icon set's one weight
 * (`components/ui/icons.tsx`), drawn here rather than added to that set
 * because nothing else uses them.
 */

type Tone = "forest" | "terra" | "paper";

const GROUND: Record<Tone, string> = {
  forest: "bg-forest text-paper",
  terra: "bg-terra-deep text-paper",
  paper: "bg-paper-deep text-forest ring-1 ring-paper-line ring-inset",
};

const GLYPHS: Record<Category, { tone: Tone; glyph: ReactNode }> = {
  adventure: {
    tone: "forest",
    glyph: <path d="M3 20 9.5 8l4 7 2.5-4L21 20z" />,
  },
  nature_wildlife: {
    tone: "forest",
    glyph: (
      <>
        <path d="M5 19C5 11 10 5 19 5c0 9-6 14-14 14z" />
        <path d="m5 19 8-8" />
      </>
    ),
  },
  food_drink: {
    tone: "terra",
    glyph: (
      <>
        <path d="M5 9h12v4a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z" />
        <path d="M17 10.5h1a2.5 2.5 0 0 1 0 5h-1.5" />
        <path d="M9 3.5v2.5" />
        <path d="M13 3.5v2.5" />
      </>
    ),
  },
  arts_creativity: {
    tone: "terra",
    glyph: (
      <>
        <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1.2.3-2.2 1.5-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z" />
        <circle cx="7.5" cy="11" r="1" />
        <circle cx="10" cy="7" r="1" />
        <circle cx="14.5" cy="7" r="1" />
      </>
    ),
  },
  learning: {
    tone: "paper",
    glyph: (
      <>
        <path d="M3 6c3-1 6-1 9 1v13c-3-2-6-2-9-1z" />
        <path d="M21 6c-3-1-6-1-9 1v13c3-2 6-2 9-1z" />
      </>
    ),
  },
  culture_heritage: {
    tone: "terra",
    glyph: (
      <>
        <path d="M3 10 12 4l9 6" />
        <path d="M5.5 10v8" />
        <path d="M10 10v8" />
        <path d="M14 10v8" />
        <path d="M18.5 10v8" />
        <path d="M3 20h18" />
      </>
    ),
  },
  wellness: {
    tone: "forest",
    glyph: (
      <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
    ),
  },
  entertainment: {
    tone: "terra",
    glyph: (
      <>
        <path d="M9 18V6l10-2v12" />
        <circle cx="6.5" cy="18" r="2.5" />
        <circle cx="16.5" cy="16" r="2.5" />
      </>
    ),
  },
  community: {
    tone: "paper",
    glyph: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M16 14.2a5 5 0 0 1 5 5.8" />
      </>
    ),
  },
  sports: {
    tone: "forest",
    glyph: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c3 3 3 15 0 18" />
        <path d="M12 3c-3 3-3 15 0 18" />
      </>
    ),
  },
  local_life: {
    tone: "paper",
    glyph: (
      <>
        <path d="M3 10l2-6h14l2 6z" />
        <path d="M5 10v10h14V10" />
        <path d="M10 20v-5h4v5" />
      </>
    ),
  },
  events: {
    tone: "terra",
    glyph: (
      <>
        <path d="M12 3v4" />
        <path d="M12 17v4" />
        <path d="M3 12h4" />
        <path d="M17 12h4" />
        <path d="m6 6 2.5 2.5" />
        <path d="m15.5 15.5 2.5 2.5" />
        <path d="m6 18 2.5-2.5" />
        <path d="m15.5 8.5 2.5-2.5" />
      </>
    ),
  },
};

const NO_DEPARTMENT: { tone: Tone; glyph: ReactNode } = {
  tone: "forest",
  glyph: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z" />
    </>
  ),
};

/** The art for a department: its own, or the compass. */
function artFor(department: Category | null | undefined) {
  if (
    !department ||
    !Object.prototype.hasOwnProperty.call(GLYPHS, department)
  ) {
    return NO_DEPARTMENT;
  }
  return GLYPHS[department];
}

export function DepartmentArt({
  department,
  className,
}: {
  department: Category | null;
  /** The tile's size; a card's is 48px. */
  className?: string;
}) {
  const { tone, glyph } = artFor(department);
  return (
    <div
      aria-hidden="true"
      data-tone={tone}
      className={cn(
        "rounded-tile flex size-12 shrink-0 items-center justify-center",
        GROUND[tone],
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        className="size-1/2"
      >
        {glyph}
      </svg>
    </div>
  );
}
