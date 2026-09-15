import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * A panel: the raised card every sheet composes from.
 *
 *   raised  — the default, a paper-deep card on the sheet
 *   outline — a hairline only, for a group that should not read as an object
 *   alert   — a failure or a warning: the accent hairline, never a red
 *   dark    — a translucent card on the stage, used sparingly
 *
 * Hairlines still do the work shadows do elsewhere. There is no shadow token
 * in this system and this component adds none.
 */
export const panelVariants = cva("rounded-card p-5", {
  variants: {
    tone: {
      raised: "border border-paper-line bg-paper-deep text-forest",
      outline: "border border-paper-line text-forest",
      alert: "border border-terra-deep/30 bg-paper-deep text-forest",
      dark: "border border-paper/12 bg-paper/6 text-paper",
    },
  },
  defaultVariants: {
    tone: "raised",
  },
});

export function Panel({
  tone,
  className,
  ...props
}: VariantProps<typeof panelVariants> & HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(panelVariants({ tone }), className)} {...props} />;
}
