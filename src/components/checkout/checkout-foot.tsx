import type { RefObject } from "react";
import type { YuvoyError } from "@/lib/api/errors";
import {
  FailurePanel,
  RECOVER_PATH,
  type DescribedError,
} from "@/components/states";
import { InviteGate, type GateView } from "@/components/auth/invite-gate";
import { InsideAnotherForm } from "@/components/ui/own-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StickyBar } from "@/components/ui/sticky-bar";
import { FadeText } from "@/components/ui/fade-text";

/**
 * The refusal at the foot of the form: the invite gate, or the failure
 * panel. The panel is keyed by the attempt, so each refusal is its own
 * arrival, and `refusalRef` is the node the form makes room for.
 */
export function CheckoutRefusal({
  refusal,
  refusalRef,
  showGate,
  gateView,
  retryAction,
  failure,
  capacityError,
  onBookRemaining,
}: {
  refusal: string;
  refusalRef: RefObject<HTMLDivElement | null>;
  showGate: boolean;
  gateView: GateView;
  retryAction: string;
  failure: DescribedError | null;
  capacityError: YuvoyError | null;
  onBookRemaining: (guests: number) => void;
}) {
  return (
    <div
      key={refusal}
      ref={refusalRef}
      // Focusable by script only: it takes focus as it lands.
      tabIndex={-1}
      data-motion=""
      className="motion-rise-in"
    >
      {showGate ? (
        <Panel tone="alert" role="alert">
          {/*
            Inside THIS form, so the gate's own forms must not nest in it:
            a browser stops a nested form's submit at this element, and the
            gate's sign-in then reloaded checkout onto its first step with
            everything typed gone. See `OwnForm`.
          */}
          <InsideAnotherForm>
            <InviteGate
              view={gateView}
              variant="panel"
              purpose="book"
              retryLabel={retryAction}
            />
          </InsideAnotherForm>
        </Panel>
      ) : failure ? (
        <FailurePanel failure={failure}>
          {/* capacity_unavailable carries what is left: offer it. */}
          {capacityError?.remaining ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBookRemaining(capacityError.remaining!)}
              className="mt-3"
            >
              Book {capacityError.remaining} instead
            </Button>
          ) : null}
        </FailurePanel>
      ) : null}
    </div>
  );
}

/**
 * The server made the reservation and returned no token to open it with:
 * say so, with the way in that does exist.
 */
export function TokenMissingPanel() {
  return (
    <Panel tone="alert" role="alert">
      <p className="text-sm font-bold">
        Your seats are held, and we could not open the page for them
      </p>
      <p className="text-forest/70 mt-1.5 text-sm">
        The booking went through. To reach it, ask for your link with the number
        you just used. It arrives the same way it always does.
      </p>
      <ButtonLink
        href={RECOVER_PATH}
        variant="outline"
        size="sm"
        className="mt-4"
      >
        Get my link
      </ButtonLink>
    </Panel>
  );
}

/** The one action, in the sticky bar at the foot, with the total on it. */
export function CheckoutBar({
  barRef,
  summaryLine,
  action,
  canSubmit,
  working,
  isRequest,
  cashAtCounter,
  blockers,
}: {
  barRef: RefObject<HTMLDivElement | null>;
  summaryLine: string[];
  action: string;
  canSubmit: boolean;
  working: boolean;
  isRequest: boolean;
  cashAtCounter: boolean;
  blockers: string[];
}) {
  return (
    <StickyBar ref={barRef} className="mt-auto">
      {/*
        The whole choice in one line (yuvoy-app#62 item 7). It is the last
        thing read before committing, and on a page where the day, the time
        and the party were each chosen several scrolls apart, it is the only
        place they appear together.
      */}
      <p className="text-forest/75 mb-3 text-center text-xs tabular-nums">
        <FadeText block>{summaryLine.join(" · ")}</FadeText>
      </p>
      <Button
        type="submit"
        size="lg"
        block
        // Not while it works: a working button keeps its colour (T08 A).
        disabled={!canSubmit && !working}
        pending={working}
        pendingLabel={isRequest ? "Sending" : "Booking"}
        // Two lines when the amount makes it long, rather than running to
        // the pill's ends on a phone.
        className="h-auto min-h-13 py-3.5 text-balance whitespace-normal"
      >
        {/* A new party or departure changes its amount: it fades through. */}
        <FadeText>{action}</FadeText>
      </Button>
      <p className="text-forest/70 mt-3 text-center text-xs">
        {isRequest
          ? "You pay only once the operator says yes."
          : cashAtCounter
            ? "You pay the operator at the meeting point. Nothing is charged now."
            : "We hold your seats while you pay."}
      </p>
      {blockers.length > 0 ? (
        <p className="text-forest/70 mt-1 text-center text-xs">
          Still needed: {blockers.join(", ")}.
        </p>
      ) : null}
    </StickyBar>
  );
}
