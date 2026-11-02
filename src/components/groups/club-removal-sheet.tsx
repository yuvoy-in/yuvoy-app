"use client";

import { useRef, useState } from "react";
import {
  CLUB_REMOVAL_REASONS,
  CLUB_REMOVAL_WORDS,
  type ClubRemovalReason,
} from "@/lib/groups/club-words";
import { clubFailure } from "@/lib/groups/clubs";
import { useRequestClubRemoval } from "@/lib/groups/use-clubs";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { FormGone, FormLine, FormSent, ReasonChips } from "./form-parts";

const W = CLUB_REMOVAL_WORDS;

/** The API's message after a 202, and whether Done leaves for the directory. */
type Sent = { text: string; leaves: boolean };

/**
 * Remove this listing (yuvoy-mobile#386), for anyone, signed in or not. One
 * of three reasons and Remove the listing, which waits for a reason. No email
 * field: the request sends no mail.
 *
 * One request goes however often the button is pressed. The answer:
 *   - 202 `removed: true`: hidden now. The API's message, and Done goes back
 *     to the directory, read again (`onLeave`);
 *   - 202 `removed: false`: a person will look and the group stays. The API's
 *     message, and Done closes the form;
 *   - 404: People closed, or the group is not there (read again): that line
 *     as an alert, never a receipt, and its one button goes back to the
 *     directory (`onLeave`). A 404 is never the same as hidden;
 *   - 429: the API's message, and the button stays held;
 *   - anything else: a line, with the reason still picked, to send again.
 *
 * The web has no toast, so the message the app shows after the sheet on
 * mobile is said in the sheet here, before the page goes.
 */
export function ClubRemovalSheet({
  clubId,
  name,
  onClose,
  onLeave,
}: {
  clubId: string;
  name: string;
  onClose: () => void;
  onLeave: () => void;
}) {
  const removal = useRequestClubRemoval(clubId);
  const [reason, setReason] = useState<ClubRemovalReason | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [held, setHeld] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const busy = useRef(false);
  const done = useRef(false);

  const send = async () => {
    if (!reason || busy.current || done.current || held) return;
    busy.current = true;
    setLine(null);
    try {
      const receipt = await removal.mutateAsync({ reason });
      done.current = true;
      setSent({ text: receipt.message, leaves: receipt.removed });
    } catch (error) {
      const why = clubFailure("removal", error);
      if (why.kind === "gone" || why.kind === "closed") {
        done.current = true;
        setGone(why.line);
        return;
      }
      setLine("line" in why ? why.line : null);
      if (why.kind === "limit") setHeld(true);
    } finally {
      busy.current = false;
    }
  };

  if (gone !== null) return <FormGone line={gone} onLeave={onLeave} />;

  if (sent !== null) {
    const leave = sent.leaves ? onLeave : onClose;
    return (
      <Sheet
        open
        onClose={leave}
        title={W.title}
        footer={
          <Button block onClick={leave}>
            {W.done}
          </Button>
        }
      >
        <FormSent text={sent.text} />
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={W.title}
      footer={
        <Button
          block
          pending={removal.isPending}
          pendingLabel={W.sending}
          disabled={!reason || held}
          onClick={() => void send()}
        >
          {W.send}
        </Button>
      }
    >
      <p className="text-body text-forest/70 mb-5 text-pretty">
        {W.lead(name)}
      </p>

      <ReasonChips
        legend={W.reasons}
        reasons={CLUB_REMOVAL_REASONS}
        value={reason}
        onChange={(next) => {
          setReason(next);
          if (!held) setLine(null);
        }}
      />

      <FormLine text={line} />
    </Sheet>
  );
}
