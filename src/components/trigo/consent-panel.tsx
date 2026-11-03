"use client";

import { Button } from "@/components/ui/button";
import { EVENTS } from "@/lib/analytics/events";
import { captureEvent } from "@/lib/observability/report";
import {
  classifyTrigoError,
  useAcceptTrigoConsent,
  type TrigoConsent,
} from "@/lib/trigo/api";
import { ACCEPT, NOT_RELEASED_LINE, SIGNED_OUT_LINE } from "@/lib/trigo/words";
import { CONSENT_LABEL, SAVE_FAILED } from "./ui-words";

/**
 * The notice before the first message, word for word as `getTrigoConsent`
 * sends it (R5-T5). Never rewritten here: the version accepted is the text
 * the traveller read, and the API keeps which one that was.
 *
 * Accept sends `acceptTrigoConsent` with the notice's version (`surface: web`
 * is set by the hook). A `409 consent_required` on a turn brings this back.
 */
export function ConsentPanel({
  consent,
  onAccepted,
}: {
  consent: TrigoConsent;
  onAccepted: () => void;
}) {
  const accept = useAcceptTrigoConsent();
  const failure = accept.error ? classifyTrigoError(accept.error) : null;

  return (
    <section aria-label={CONSENT_LABEL} className="flex flex-col gap-4">
      <p className="text-forest text-body text-pretty whitespace-pre-line">
        {consent.noticeText}
      </p>
      {failure ? (
        <p role="alert" className="text-terra-deep text-body text-pretty">
          {failure.kind === "signed_out"
            ? SIGNED_OUT_LINE
            : failure.kind === "not_released"
              ? NOT_RELEASED_LINE
              : SAVE_FAILED}
        </p>
      ) : null}
      <Button
        block
        pending={accept.isPending}
        pendingLabel={ACCEPT}
        onClick={() =>
          accept.mutate(
            { noticeVersion: consent.noticeVersion },
            {
              onSuccess: () => {
                captureEvent(EVENTS.trigoConsent, { accepted: true });
                onAccepted();
              },
            },
          )
        }
      >
        {ACCEPT}
      </Button>
    </section>
  );
}
