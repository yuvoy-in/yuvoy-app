"use client";

import { useEffect, useState } from "react";
import { shareUrl } from "@/lib/share";
import { IconButton } from "@/components/ui/icon-button";
import { ShareIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * The share disc on a feed card and over a detail hero.
 *
 * Shares the listing's public address — the page a crawler may index, never
 * a booking or a token. The address is read from the window at the moment of
 * the tap, so a preview host shares itself and production shares itself,
 * with nothing baked in at build time.
 *
 * The outcome is said next to the disc and announced to a screen reader:
 * "Link copied" where there was no share sheet, and where even the clipboard
 * refused, the honest fallback rather than a silent tap.
 */
export function ShareExperience({
  slug,
  title,
  variant = "chrome",
}: {
  slug: string;
  title: string;
  variant?: "chrome" | "onDark";
}) {
  const [notice, setNotice] = useState<"copied" | "unavailable" | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function share() {
    const url = `${window.location.origin}/e/${slug}`;
    const outcome = await shareUrl({ title, url });
    setNotice(
      outcome === "copied"
        ? "copied"
        : outcome === "unavailable"
          ? "unavailable"
          : null,
    );
  }

  return (
    <div className="relative">
      <IconButton
        label="Share this experience"
        variant={variant}
        onClick={() => void share()}
      >
        <ShareIcon />
      </IconButton>
      <span
        role="status"
        aria-live="polite"
        className={cn(
          "label app-chrome ring-cream/12 absolute top-1/2 right-full mr-3 -translate-y-1/2 rounded-full px-3 py-1.5 text-[11px] whitespace-nowrap ring-1",
          !notice && "sr-only",
        )}
      >
        {notice === "copied"
          ? "Link copied"
          : notice === "unavailable"
            ? "Copy the address instead"
            : ""}
      </span>
    </div>
  );
}
