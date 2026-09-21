"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSheet } from "./message-sheet";
import { cn } from "@/lib/cn";

/**
 * The way to a person, as one line.
 *
 * ## What this used to be
 *
 * A heading, a panel and two full-width buttons, stapled to the bottom of the
 * booking page and of Account. On the booking page it sat in a stack of about
 * twenty other surfaces and the page ALSO closed with a paragraph telling
 * everybody to reply to the WhatsApp message we sent, so help was offered
 * twice within a screen of itself. The revamp brief named it directly: "Need
 * Help?" should not clutter the booking page.
 *
 * So the reading moved to `/help`, which can actually answer a question, and
 * what is left here is the shortest thing that still works.
 *
 * ## Why the message sheet stays here rather than moving to /help
 *
 * The token, and it is not a detail. `createSupportRequest` takes a booking
 * link's status token as well as a session, and that is the only reason
 * somebody who booked WITHOUT signing in can ask for help at all. The token
 * lives in this page's URL fragment and does not survive a navigation, so a
 * guest sent to `/help` would arrive with no way to send anything. Checkout is
 * unauthenticated on purpose, so that is not a rare case.
 *
 * The Help Center therefore gets the reading and the signed-in form; this
 * keeps the one capability that cannot follow it.
 */
export interface HelpSupport {
  whatsappE164?: string | null;
  hours?: string | null;
}

export function HelpSection({
  support,
  bookingReference,
  whatsappMessage,
  token,
  className,
}: {
  support: HelpSupport | undefined;
  /** Attached to the request. Absent on Account, and on an unanswered request. */
  bookingReference?: string | null;
  /** What the WhatsApp thread opens with, already written. */
  whatsappMessage: string;
  /**
   * A booking link's status token, when there is one.
   *
   * With it the request goes straight to the API bearing the token, which is
   * what lets somebody who booked without signing in ask for help at all.
   * Without it the request goes through this app's own server, which holds the
   * session in an HttpOnly cookie that no browser code can read (app#57).
   */
  token?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const number = support?.whatsappE164?.trim();
  /*
    `wa.me` takes the number with no plus and no punctuation. Stripping
    everything but digits is deliberate rather than trimming a leading `+`: the
    field is E.164 by contract, and a stray space or dash in the data would
    otherwise produce a URL that opens WhatsApp on an empty search.
  */
  const digits = number ? number.replace(/\D+/g, "") : "";
  const waHref = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(whatsappMessage)}`
    : null;

  /* On a booking, "message us" means this booking. On Account it means us. */
  const onBooking = Boolean(token);

  return (
    <div className={cn("border-paper-line mt-8 border-t pt-6", className)}>
      {/*
        EVERY CONTROL HERE CARRIES `tap-target`, and that was a fix.

        This row was cut down from a panel of full-width buttons to one line of
        inline text, and the first version of that line shipped its three
        controls as plain text: about 20px tall on a phone, under the repo's
        own 28px floor, and separated by nothing but a dot. A thumb aiming for
        WhatsApp hit "Message us". Found in the accessibility pass, not by a
        report, and pinned by a test.
      */}
      <p className="text-forest/70 text-sm">
        Need a hand?{" "}
        <Link
          href="/help"
          className="text-forest tap-target font-bold underline underline-offset-4"
        >
          Help centre
        </Link>
        {waHref ? (
          <>
            {" · "}
            {/*
              `rel="noopener"` because `target="_blank"` otherwise hands the
              opened page a live `window.opener` back to this one, and this one
              may be a booking. `noreferrer` keeps the booking URL, token and
              all, out of the referrer header.
            */}
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-forest tap-target font-bold underline underline-offset-4"
            >
              Chat on WhatsApp
            </a>
          </>
        ) : null}
        {" · "}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-forest tap-target font-bold underline underline-offset-4"
        >
          {onBooking ? "Message us about this trip" : "Message us"}
        </button>
      </p>

      {/*
        The hours, kept even though this row was cut to one line.

        It is the one piece of the old panel that changes behaviour rather than
        describing it: somebody messaging at 2am with no idea when anybody
        reads it has a worse night than somebody who was told. One short line
        is worth that.
      */}
      {support?.hours ? (
        <p className="text-forest/70 mt-1.5 text-xs">{support.hours}</p>
      ) : null}

      {open ? (
        <MessageSheet
          onClose={() => setOpen(false)}
          bookingReference={bookingReference}
          token={token}
        />
      ) : null}
    </div>
  );
}
