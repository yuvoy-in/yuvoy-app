"use client";

import { Panel } from "@/components/ui/panel";
import { QrCode } from "@/components/ui/qr-code";
import { cn } from "@/lib/cn";
import {
  CHECK_IN_HINT,
  CHECK_IN_TITLE,
  spokenCode,
  type CheckInView,
} from "@/lib/booking/check-in";
import { useWakeLock } from "@/lib/react/use-wake-lock";

/** The QR's side: big enough to scan from arm's length at a crowded jetty. */
export const CHECK_IN_QR = 232;

/**
 * Show at check-in (yuvoy-app#218, the web half of yuvoy-mobile#367): the QR
 * of the booking's check-in link, the code under it in large type for the
 * business to type instead, and the day it is for, or once it was used, when.
 *
 * Only on the page. The pass image (`app/api/booking-pass`) is drawn from the
 * token alone and names its fields one by one, so the code never reaches it.
 * The page draws this only when `checkInView` has one.
 *
 * While it is on screen and the page is in front, the screen stays on, so the
 * QR is still there when the queue reaches the counter.
 */
export function CheckInBlock({ view }: { view: CheckInView }) {
  useWakeLock(true);
  const used = view.checkedIn !== null;
  return (
    <Panel
      data-check-in=""
      className="mt-6 flex flex-col items-center text-center"
    >
      <p
        className={cn(
          "eyebrow text-terra-deep self-start",
          used && "eyebrow-tick",
        )}
      >
        {/* The word carries the state; the tick is for the eye. */}
        {used ? (
          <svg
            viewBox="0 0 12 12"
            aria-hidden="true"
            className="eyebrow-tick-mark"
          >
            <path d="M2.25 6.5 5 9.25 9.75 3" pathLength={1} />
          </svg>
        ) : null}
        {CHECK_IN_TITLE}
      </p>
      <QrCode
        value={view.link}
        size={CHECK_IN_QR}
        label="Check-in QR code"
        className="mt-4 h-auto max-w-full"
        data-check-in-qr=""
      />
      {/*
        The reference's face (`tracking-ref font-bold slashed-zero
        tabular-nums`), at 3xl so it reads across a counter. Selectable, for a
        traveller who wants to paste it to a friend in the group. A screen
        reader hears it one character at a time: an `aria-label` on a plain
        paragraph is ignored by most of them, so the spoken form is its own
        hidden text.
      */}
      <p className="tracking-ref mt-3 text-3xl leading-tight font-bold slashed-zero tabular-nums">
        <span className="sr-only">{`Check-in code ${spokenCode(view.code)}`}</span>
        <span aria-hidden="true" className="select-all" data-check-in-code="">
          {view.code}
        </span>
      </p>
      {used ? (
        <p className="text-body mt-1 font-bold" data-check-in-used="">
          {view.checkedIn}
        </p>
      ) : view.day ? (
        <p className="text-body mt-1" data-check-in-day="">
          {view.day}
        </p>
      ) : null}
      {used ? null : (
        <p className="text-forest/70 mt-2 text-xs text-pretty">
          {CHECK_IN_HINT}
        </p>
      )}
    </Panel>
  );
}
