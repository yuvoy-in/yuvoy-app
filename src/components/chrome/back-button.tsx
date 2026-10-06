import { IconLink } from "@/components/ui/icon-button";
import type { LinkProps } from "@/components/ui/link";
import { ArrowLeftIcon } from "@/components/ui/icons";

/**
 * The way back from a focused screen.
 *
 * A plain link to a stated fallback, never `history.back()`. History is not
 * ours to read: a traveller who opened a shared link in a fresh tab has no
 * in-app history, one who typed the address has somebody else's, and a
 * "back" that leaves the site from inside it reads as a crash. The search
 * screen keeps its results in component state, so a true back would not
 * restore them either. A link is deterministic on every path in.
 *
 * `over="media"` draws the forest disc that floats on a photograph;
 * `over="stage"` draws the translucent one, where a forest disc would vanish
 * into the forest stage behind it.
 */
export function BackButton({
  href,
  label,
  over = "stage",
  onNavigate,
}: {
  href: string;
  /** Where it leads, for the name: "Back to the feed". */
  label: string;
  over?: "stage" | "media";
  /**
   * Called when pressing it navigates this tab (Next's `onNavigate`), so a
   * modifier-click that opens a new tab is not mistaken for a step back here.
   *
   * Next's own signature, event and all. It was `() => void`, which let a
   * function taking a path be passed straight in and handed the event as
   * that path (stability audit, 6 Oct 2026).
   */
  onNavigate?: LinkProps["onNavigate"];
}) {
  return (
    <IconLink
      href={href}
      label={`Back to ${label}`}
      variant={over === "media" ? "chrome" : "onDark"}
      onNavigate={onNavigate}
      // The screen it leaves drops away (T01 C), or slides back off a reel
      // (T02 C): a step back, not a step forward.
      back
    >
      <ArrowLeftIcon />
    </IconLink>
  );
}
