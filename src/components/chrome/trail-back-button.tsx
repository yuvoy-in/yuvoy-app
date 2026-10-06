"use client";

import { usePathname } from "next/navigation";
import { markStepBack, originOf, useCameFrom } from "@/lib/site/route-trail";
import { BackButton } from "./back-button";

/**
 * Back, to wherever the traveller came from (the approved redesign, traveller
 * A, 3 Oct 2026).
 *
 * Still a link with a named destination (`BackButton`'s rule): the trail only
 * chooses which one. The screen the traveller came from when it is one of
 * ours that Back can name, and the screen's own fallback otherwise: on a hard
 * load, after a reload, or for a traveller who arrived from outside.
 *
 * The fallback is also the first paint of a loaded page, on the server and
 * through hydration, so the two always agree (see `useCameFrom`).
 */
export function TrailBackButton({
  href,
  label,
  over,
}: {
  /** Where Back leads when there is no trail to follow. */
  href: string;
  label: string;
  over?: "stage" | "media";
}) {
  const pathname = usePathname();
  const came = useCameFrom(pathname);
  const origin = came ? originOf(came) : null;

  if (!origin) return <BackButton href={href} label={label} over={over} />;
  return (
    <BackButton
      href={origin.href}
      label={origin.label}
      over={over}
      // Pressing it is a step back, so the trail takes this screen off rather
      // than adding the one it returns to (see `route-trail`). No argument:
      // `landedOn` is the browser's traversal, and Next passes an event.
      onNavigate={() => markStepBack()}
    />
  );
}
