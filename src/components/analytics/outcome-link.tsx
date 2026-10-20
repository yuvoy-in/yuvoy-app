"use client";

import type { AnchorHTMLAttributes } from "react";
import { recordOutcome, type OutcomeSurface } from "@/lib/analytics/outcomes";

/**
 * A link that leaves Yuvoy, counted as `link_out` when it is followed
 * (yuvoy-app#181): the meeting point's "Open in maps" today.
 *
 * A plain anchor in every other way, so the browser opens it as it would any
 * link. A middle click is a follow too, into a new tab; a right click is not.
 */
export function OutcomeLink({
  outcome,
  onClick,
  onAuxClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  outcome: { subjectId: string; surface: OutcomeSurface };
}) {
  const followed = () => recordOutcome({ kind: "link_out", ...outcome });
  return (
    <a
      {...props}
      onClick={(event) => {
        followed();
        onClick?.(event);
      }}
      onAuxClick={(event) => {
        if (event.button === 1) followed();
        onAuxClick?.(event);
      }}
    />
  );
}
