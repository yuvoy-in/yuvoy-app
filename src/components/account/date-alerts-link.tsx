"use client";

import { ButtonLink } from "@/components/ui/button";
import { TRIGO_LISTS_WORDS as W } from "@/lib/trigo/lists-words";
import { useTrigoListsOpen } from "@/lib/trigo/use-lists";

/**
 * Account's "Date alerts" (yuvoy-app#220), only while the `trigo` release is
 * open, and only once the browser has drawn the page so the server's HTML
 * and the first paint agree. Here rather than in `account-screen.tsx`, which
 * is over the 500-line limit.
 */
export function DateAlertsLink() {
  const open = useTrigoListsOpen();
  if (!open) return null;
  return (
    <ButtonLink
      href="/account/date-alerts"
      variant="outline"
      block
      className="mt-3"
    >
      {W.alertsTitle}
    </ButtonLink>
  );
}
