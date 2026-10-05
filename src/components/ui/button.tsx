import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import Link from "@/components/ui/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { ArrowRightIcon } from "./icons";

/**
 * The one button.
 *
 * CTAs are MONOCHROME (owner direction, 2026-08-05): on a paper sheet the pair
 * is `primary` (solid forest) + `outline`; on the dark stage it is `paper`
 * (solid paper) + `outlineOnDark`. Both fills measure 13.11:1. Terracotta is
 * never a button fill — it is the accent for type, dots and marks.
 *
 * Every button is a pill (v2.7). The label is the system's tracked caps, so
 * a button reads as an instruction rather than a sentence; the press
 * compresses (`active:scale`) on the interaction budget, never slower.
 *
 * ## Working on it (T08 A, approved 4 Oct 2026)
 *
 * A button whose tap has started something long (booking, on island signal)
 * says so without looking switched off: `pending` keeps its full colour and
 * its focus (`aria-busy`, `aria-disabled`, never `disabled`, which faded it
 * to 40% for as long as the answer took), cross-fades its label to
 * `pendingLabel` (the working verb), and shows a 16px ring beside it only if
 * the wait lasts 300ms, so a quick answer never flashes one. A tap while it
 * works does nothing. The two labels share one cell, so the button never
 * changes size, and the one not showing is hidden from assistive technology.
 */
export const buttonVariants = cva(
  [
    "group inline-flex shrink-0 items-center justify-center gap-2 rounded-full",
    "label font-bold whitespace-nowrap select-none",
    "motion-control active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
  ],
  {
    variants: {
      variant: {
        primary: "bg-forest text-paper hover:bg-forest/90",
        paper: "bg-paper text-forest hover:bg-paper-deep",
        outline:
          "border border-forest/25 text-forest hover:border-forest hover:bg-forest/5",
        outlineOnDark:
          "border border-paper/25 text-paper hover:border-paper/60 hover:bg-paper/8",
        ghost: "text-forest/75 hover:bg-forest/5 hover:text-forest",
        ghostOnDark: "text-paper/70 hover:bg-paper/8 hover:text-paper",
      },
      size: {
        sm: "h-9 px-4 text-[11px]",
        md: "h-11 px-5",
        lg: "h-13 px-6",
      },
      block: {
        true: "flex w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type Variants = VariantProps<typeof buttonVariants>;

export function Button({
  variant,
  size,
  block,
  className,
  type = "button",
  pending,
  pendingLabel,
  children,
  onClick,
  ...props
}: Variants &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    /** Working on what the tap asked for. Needs `pendingLabel`. */
    pending?: boolean;
    /** The working verb shown while pending: "Booking", never "Booking…". */
    pendingLabel?: ReactNode;
  }) {
  const working = pendingLabel !== undefined && pending === true;
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
      aria-busy={working || undefined}
      aria-disabled={working || props["aria-disabled"]}
      data-pending={working ? "" : undefined}
      onClick={
        working
          ? // A second tap while it works: neither a click nor a submit.
            (e) => e.preventDefault()
          : onClick
      }
    >
      {pendingLabel === undefined ? (
        children
      ) : (
        <span className="button-labels">
          <span
            className="button-label"
            data-motion=""
            data-shown={!working}
            aria-hidden={working || undefined}
          >
            {children}
          </span>
          <span
            className="button-label"
            data-motion=""
            data-shown={working}
            aria-hidden={!working || undefined}
          >
            {pendingLabel}
            <span className="button-ring" data-motion="" aria-hidden="true" />
          </span>
        </span>
      )}
    </button>
  );
}

/** A `<Link>` styled as a button, for a forward action that is a navigation. */
export function ButtonLink({
  variant,
  size,
  block,
  className,
  href,
  ...props
}: Variants & { href: string } & Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    "href"
  >) {
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  );
}

/**
 * The trailing arrow on a forward action, nested in its own disc so it reads
 * as part of the button's hardware rather than a glyph left beside the text.
 * On hover the disc eases forward; on the interaction budget.
 */
export function ButtonArrow({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "-mr-2 ml-1 inline-flex size-7 items-center justify-center rounded-full bg-current/10",
        "ease-interaction transition-transform duration-200 group-hover:translate-x-0.5",
        className,
      )}
    >
      <ArrowRightIcon className="size-4" />
    </span>
  );
}
