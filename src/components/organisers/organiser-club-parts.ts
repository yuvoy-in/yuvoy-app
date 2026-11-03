"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { YuvoyError } from "@/lib/api/errors";
import type { Organiser } from "@/lib/organisers/types";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { handOverLinked } from "./organiser-form-parts";

/**
 * A group's setup form, the parts that are not drawn (yuvoy-app#225). Split
 * out of `organiser-form.tsx` to keep it short.
 */

/**
 * The form opened again for a group that has its organiser already (by
 * Back, or from a kept link): that page opens in place of the form, as a
 * `409 club_already_linked` would open it, with the same sentence. A replace,
 * so Back from the page does not come back here. Pass the organisers only
 * while the group is not offered: once the form has drawn, a list read after
 * its own 201 must not move the person. True while it is opening.
 */
export function useOpenClubOrganiser(
  clubId: string,
  items: readonly Organiser[] | undefined,
): boolean {
  const router = useRouter();
  const id =
    items?.find((organiser) => organiser.clubId === clubId)?.id ?? null;
  // Opened once, whatever renders follow before the move lands.
  const opened = useRef<string | null>(null);

  useEffect(() => {
    if (id === null || opened.current === id) return;
    opened.current = id;
    handOverLinked(id, W.clubLinked);
    router.replace(`/organiser/${encodeURIComponent(id)}`);
  }, [id, router]);

  return id !== null;
}

/**
 * Whether a group's create was refused because the group is no longer one
 * to offer: 404 (hidden, removed or not there), 403 `not_club_holder` or 403
 * `people_paused`. The hub's list is read again, so it stops offering it.
 */
export function clubOfferChanged(error: unknown): boolean {
  if (!(error instanceof YuvoyError)) return false;
  const code: string = error.code;
  return (
    error.status === 404 ||
    (error.status === 403 &&
      (code === "not_club_holder" || code === "people_paused"))
  );
}
