"use client";

import { useEffect, useRef } from "react";
import { recordOutcome, type OutcomeSurface } from "@/lib/analytics/outcomes";

/**
 * `opened` for a page about one card (yuvoy-app#181): the listing page, which
 * is a server render with nothing of its own in the browser to say it.
 *
 * Recorded once, as the page arrives, under the answer that stands then: a
 * yes given later does not reach back to count an open that happened before
 * it. Renders nothing.
 */
export function RecordOpened({
  subjectId,
  surface,
}: {
  subjectId: string;
  surface: OutcomeSurface;
}) {
  // Once per card arrived at, and once under React's development double run.
  const recorded = useRef<string | null>(null);
  useEffect(() => {
    const card = `${surface} ${subjectId}`;
    if (recorded.current === card) return;
    recorded.current = card;
    recordOutcome({ kind: "opened", subjectId, surface });
  }, [subjectId, surface]);
  return null;
}
