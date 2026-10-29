"use client";

import { useEffect, useId, useState, type MouseEvent } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetPresence } from "@/components/ui/sheet";
import { hostOf, safeExternalUrl } from "@/lib/found/link-out";
import { leaveNoticeOff, setLeaveNoticeOff } from "@/lib/found/device-store";
import { recordFound } from "@/lib/found/found-outcomes";
import type { components } from "@/lib/api/schema.gen";

type FoundItem = components["schemas"]["FoundItem"];
type FoundSurface = "found_feed" | "found_detail";

/**
 * The leaving sheet's words and See details' own (yuvoy-app#179, R2-T4).
 *
 * Kept here rather than in `found-words.ts`, which holds the feed's and the
 * card's: these are said only by this control and its sheet. The body says
 * "in a new tab" where mobile says "in Yuvoy's browser", because that is
 * where a web link goes (`leave-sheet.tsx` in yuvoy-mobile, the same table
 * otherwise).
 */
export const SEE_DETAILS_WORDS = Object.freeze({
  seeDetails: "See details",
  opens: (host: string) => `Opens ${host}`,
  title: "You're leaving Yuvoy",
  body: (host: string) =>
    `This opens ${host} in a new tab. Check the date, price and tickets on their page. Yuvoy doesn't sell these tickets.`,
  open: (host: string) => `Open ${host}`,
  stay: "Stay on Yuvoy",
  skip: "Don't show this again on this device",
});

/**
 * Whether the box was ticked in this tab, for every See details on the page.
 *
 * Each control reads the device's answer once, as it mounts. A feed holds
 * twenty of them, so one ticked in a sheet would leave the other nineteen
 * holding the answer they read before it, and the next tap would ask again
 * the question the person just said not to. This is the answer as it stands
 * now, for the tab; the device store is the answer for the next visit.
 */
let turnedOffHere = false;

/** For tests: a tab that has not ticked the box. */
export function __resetSeeDetails(): void {
  turnedOffHere = false;
}

/**
 * See details on a found card, and the sheet that comes before it.
 *
 * The organiser's page is one Yuvoy does not control and does not sell
 * through, so the first tap says so: where it opens, what to check there,
 * and that the tickets are not ours. Ticked once, this device goes straight
 * there from then on.
 *
 * ## A real link, both times
 *
 * See details and the sheet's Open are each an `<a target="_blank">` with the
 * address exactly as the API stored it: nothing appended, no tracking
 * parameter, no redirect through us. The browser opens it, so a pop-up
 * blocker sees the person's own tap and a middle click works as on any link.
 * The notice is the one thing that holds the first one back.
 *
 * `rel="noopener"` and NOT `noreferrer` (R2-T4): the organiser may see that a
 * visitor came from Yuvoy, which is how a venue learns the listing is worth
 * keeping right, and the opened page still gets no handle on this one.
 *
 * ## Nothing without a safe address
 *
 * http and https only (`safeExternalUrl`), with a host to name. A
 * `javascript:` or `data:` address, or one with no host, draws nothing at all
 * rather than a button that cannot say where it goes.
 *
 * ## `link_out`
 *
 * Counted in the click handler, before the browser leaves, on the tap that
 * actually opens the page: See details when the notice is off, Open in the
 * sheet when it is on. Stay on Yuvoy, the X and Escape count nothing.
 */
export function SeeDetails({
  item,
  surface,
  position,
}: {
  item: FoundItem;
  surface: FoundSurface;
  position?: number;
}) {
  const url = safeExternalUrl(item.seeDetailsUrl);
  const host = url ? hostOf(url) : null;
  const opensId = useId();
  const [asking, setAsking] = useState(false);
  /** The device's answer; null until it is read, and asked until then. */
  const [noticeOff, setNoticeOff] = useState<boolean | null>(null);

  useEffect(() => {
    if (!url) return;
    let live = true;
    leaveNoticeOff().then(
      (off) => {
        if (live) setNoticeOff(off);
      },
      () => {
        // Storage refused: the notice stays, which is the side to fail on.
      },
    );
    return () => {
      live = false;
    };
  }, [url]);

  if (!url || !host) return null;

  const counted = () => recordFound("link_out", item.id, surface, position);

  const onSeeDetails = (e: MouseEvent<HTMLAnchorElement>) => {
    if (turnedOffHere || noticeOff === true) {
      counted();
      return;
    }
    // The notice first. A device whose answer is not read yet is asked too.
    e.preventDefault();
    setAsking(true);
  };

  return (
    <div className="flex flex-col items-stretch gap-1.5">
      <a
        href={url}
        target="_blank"
        rel="noopener"
        aria-describedby={opensId}
        onClick={onSeeDetails}
        className={buttonVariants({ block: true })}
        data-testid="see-details"
      >
        {SEE_DETAILS_WORDS.seeDetails}
      </a>
      <p id={opensId} className="text-forest/70 text-center text-xs">
        {SEE_DETAILS_WORDS.opens(host)}
      </p>

      <SheetPresence open={asking}>
        <LeaveSheet
          url={url}
          host={host}
          onOpen={(skip) => {
            if (skip) {
              turnedOffHere = true;
              setNoticeOff(true);
              void setLeaveNoticeOff(true).catch(() => {
                // Remembered for this tab only; the next visit asks again.
              });
            }
            counted();
            setAsking(false);
          }}
          onClose={() => setAsking(false)}
        />
      </SheetPresence>
    </div>
  );
}

/**
 * You're leaving Yuvoy. Mounted only while asked, inside `SheetPresence`, so
 * the box starts unticked on every opening.
 */
function LeaveSheet({
  url,
  host,
  onOpen,
  onClose,
}: {
  url: string;
  host: string;
  /** The person opened the page; `skip` is the box. */
  onOpen: (skip: boolean) => void;
  onClose: () => void;
}) {
  const [skip, setSkip] = useState(false);
  return (
    <Sheet
      open
      onClose={onClose}
      title={SEE_DETAILS_WORDS.title}
      footer={
        <div className="flex flex-col gap-2">
          {/*
            The same link as See details, and the tap that follows it. The
            sheet closes as the tab opens, so coming back finds the card, not
            the question.
          */}
          <a
            href={url}
            target="_blank"
            rel="noopener"
            onClick={() => onOpen(skip)}
            className={buttonVariants({ block: true, size: "lg" })}
            data-testid="leave-open"
          >
            {SEE_DETAILS_WORDS.open(host)}
          </a>
          <Button variant="ghost" size="lg" block onClick={onClose}>
            {SEE_DETAILS_WORDS.stay}
          </Button>
        </div>
      }
    >
      <p className="text-body text-pretty">{SEE_DETAILS_WORDS.body(host)}</p>
      <label className="rounded-control border-paper-line bg-paper-deep mt-4 flex cursor-pointer items-center gap-3 border px-3.5 py-3">
        <input
          type="checkbox"
          checked={skip}
          onChange={(e) => setSkip(e.target.checked)}
          className="accent-forest size-6 shrink-0"
        />
        <span className="text-sm">{SEE_DETAILS_WORDS.skip}</span>
      </label>
    </Sheet>
  );
}
