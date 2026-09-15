"use client";

import { useEffect, useState } from "react";
import { shareUrl } from "@/lib/share";
import { IconButton } from "./icon-button";
import { ShareIcon } from "./icons";
import { cn } from "@/lib/cn";

/**
 * The share disc — over a reel, and over a detail hero.
 *
 * Shares a PUBLIC address, never a booking or a token. The origin is read from
 * the window at the moment of the tap, so a preview host shares itself and
 * production shares itself, with nothing baked in at build time.
 *
 * The outcome is said next to the disc and announced to a screen reader:
 * "Link copied" where there was no share sheet, and where even the clipboard
 * refused, the honest fallback rather than a silent tap.
 *
 * ## Why it takes a path rather than a slug
 *
 * It used to be `ShareExperience` and build `/e/{slug}` itself, which made
 * "share" mean "share the listing" everywhere it appeared. On a reel that is
 * the wrong thing to send: somebody sharing a clip means the clip, and the
 * person opening it should land on the clip rather than on a page about it
 * (yuvoy-app#36). The reel card now passes `/r/{media.id}` and the detail page
 * passes `/e/{slug}`, so the component no longer decides what a share is
 * about — the surface does, and there is one implementation of the sheet, the
 * clipboard fallback and the notice.
 */
export function ShareLink({
  path,
  title,
  label,
  variant = "chrome",
  size,
}: {
  /** Root-relative, e.g. `/e/dawn-kayak` or `/r/9acb347f`. */
  path: string;
  /** What the share sheet offers as the subject. */
  title: string;
  /** The button's accessible name. Says what is being shared. */
  label: string;
  variant?: "chrome" | "onDark";
  /** Matches the discs it sits with. The feed's rail is `sm`. */
  size?: "sm" | "md" | "lg";
}) {
  const [notice, setNotice] = useState<"copied" | "unavailable" | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function share() {
    const url = `${window.location.origin}${path}`;
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
        label={label}
        variant={variant}
        size={size}
        onClick={() => void share()}
      >
        <ShareIcon />
      </IconButton>
      <span
        role="status"
        aria-live="polite"
        className={cn(
          "label app-chrome ring-paper/12 absolute top-1/2 right-full mr-3 -translate-y-1/2 rounded-full px-3 py-1.5 text-[11px] whitespace-nowrap ring-1",
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
