import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * A chip: a fact, a filter or a state, in a pill.
 *
 * Two surfaces, three tones. The accent tone on a DARK surface is outline
 * only, with no fill — measured, a `cream/10` tint under `terra-soft` drops
 * the pairing to 4.05:1, below AA; on plain forest it holds 5.36:1 and on
 * abyss 7.86:1. `palette.test.ts` pins that composite so it cannot creep back.
 *
 * `Chip` is a fact (a span). `ChipButton` is a filter (a button with
 * `aria-pressed`), the day picker's primary control.
 */
export const chipVariants = cva(
  [
    "inline-flex shrink-0 items-center gap-1.5 rounded-full border whitespace-nowrap",
    "transition-[background-color,border-color,color] duration-200 ease-interaction",
  ],
  {
    variants: {
      surface: {
        cream: "",
        dark: "",
      },
      tone: {
        neutral: "",
        accent: "",
        selected: "",
      },
      size: {
        sm: "h-7 px-2.5 text-[11px]",
        md: "h-9 px-3.5 text-sm",
        lg: "min-h-11 px-4 text-sm",
      },
    },
    compoundVariants: [
      {
        surface: "cream",
        tone: "neutral",
        class: "border-cream-line bg-cream-deep text-forest",
      },
      {
        surface: "cream",
        tone: "accent",
        class: "border-terra-deep/30 bg-cream-deep text-terra-deep",
      },
      {
        surface: "cream",
        tone: "selected",
        class: "border-forest bg-forest text-cream",
      },
      {
        surface: "dark",
        tone: "neutral",
        class: "border-cream/15 bg-cream/10 text-cream",
      },
      {
        surface: "dark",
        tone: "accent",
        class: "border-terra-soft/50 bg-transparent text-terra-soft",
      },
      {
        surface: "dark",
        tone: "selected",
        class: "border-cream bg-cream text-forest",
      },
    ],
    defaultVariants: {
      surface: "cream",
      tone: "neutral",
      size: "md",
    },
  },
);

type Variants = VariantProps<typeof chipVariants>;

export function Chip({
  surface,
  tone,
  size,
  className,
  ...props
}: Variants & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(chipVariants({ surface, tone, size }), className)}
      {...props}
    />
  );
}

export function ChipButton({
  surface,
  size,
  pressed,
  className,
  type = "button",
  ...props
}: Omit<Variants, "tone"> & {
  pressed: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cn(
        chipVariants({ surface, size, tone: pressed ? "selected" : "neutral" }),
        !pressed &&
          (surface === "dark"
            ? "hover:border-cream/40"
            : "hover:border-forest/40"),
        className,
      )}
      {...props}
    />
  );
}
