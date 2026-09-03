import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * A circular control holding one icon.
 *
 * The name is REQUIRED, not optional: an icon is decorative and the button is
 * what a screen reader announces, so a circle with no label is a control with
 * no name. `pnpm qa` cannot see inside an SVG, which is why the type does.
 *
 *   chrome  — the forest disc that floats over media and cream alike
 *   onDark  — a translucent disc on the stage, where a forest disc would vanish
 *   onCream — a raised disc on a sheet (steppers, dismiss)
 *   paper   — a solid cream disc on the stage
 */
export const iconButtonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center rounded-full",
    "transition-[transform,background-color,color,border-color] duration-200 ease-interaction",
    "active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40",
  ],
  {
    variants: {
      variant: {
        chrome: "app-chrome ring-1 ring-cream/12 hover:bg-forest/90",
        onDark: "bg-cream/10 text-cream ring-1 ring-cream/12 hover:bg-cream/15",
        onCream:
          "border border-cream-line bg-cream-deep text-forest hover:border-forest/40",
        paper: "bg-cream text-forest hover:bg-cream-deep",
      },
      size: {
        sm: "size-9",
        md: "size-11",
        lg: "size-13",
      },
    },
    defaultVariants: {
      variant: "chrome",
      size: "md",
    },
  },
);

type Variants = VariantProps<typeof iconButtonVariants>;

export function IconButton({
  label,
  variant,
  size,
  className,
  type = "button",
  ...props
}: Variants & { label: string } & Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "aria-label"
  >) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export function IconLink({
  label,
  variant,
  size,
  className,
  href,
  ...props
}: Variants & { label: string; href: string } & Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    "aria-label" | "href"
  >) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
