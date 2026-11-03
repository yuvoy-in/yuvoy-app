"use client";

import { ButtonLink } from "@/components/ui/button";
import { civilInZone, clockTime, dayMonth } from "@/lib/format/date";
import { ASK_THE_TEAM, LIMIT_LINE } from "@/lib/trigo/words";
import { HELP_PATH } from "./message-list";
import { LIMIT_LABEL, RESET_LEAD } from "./ui-words";

/** The day's messages reset at midnight in India (A19, DEC-38 B). */
const RESET_ZONE = "Asia/Kolkata";

/**
 * The day's 20 messages are used (`429 daily_limit_reached`, or a read that
 * says `remainingToday` 0). Send is off while this shows; the way on is a
 * person, which is the help route until R5-T2's in-chat hand-off is built.
 *
 * The reset time is `resetsAt` drawn in IST with the repo's date helpers,
 * never `toLocale*`, and left out when the API sent none.
 */
export function LimitPanel({ resetsAt }: { resetsAt: string | null }) {
  const civil = resetsAt ? civilInZone(resetsAt, RESET_ZONE) : null;
  return (
    <section
      aria-label={LIMIT_LABEL}
      className="border-paper-line bg-paper-deep rounded-card flex flex-col gap-3 border px-4 py-4"
    >
      <p className="text-forest text-body text-pretty">{LIMIT_LINE}</p>
      {civil && resetsAt ? (
        <p className="text-forest/75 text-body text-pretty">
          {RESET_LEAD}{" "}
          <time dateTime={resetsAt}>
            {clockTime(civil)} on {dayMonth(civil)}
          </time>
          .
        </p>
      ) : null}
      <div>
        <ButtonLink href={HELP_PATH} variant="outline" size="sm">
          {ASK_THE_TEAM}
        </ButtonLink>
      </div>
    </section>
  );
}
