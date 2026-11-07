"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CREW_INVITE_WORDS,
  crewInviteFailure,
  crewInviteLine,
  planPickerLine,
} from "@/lib/people/crew-invite";
import { useInviteCrewToPlan } from "@/lib/people/use-crew-invite";
import { planMoment } from "@/lib/plans/format";
import { useInvitablePlans, type PlanSummary } from "@/lib/plans/use-my-plans";
import { useRelease } from "@/lib/site/use-release";

/**
 * Invite to a plan, on a crew's page (yuvoy-mobile#392, web half).
 *
 * Shown only while People and plans are both open to this traveller and the
 * crew has someone in it. A tap opens the picker of their own plans (the
 * ones they made, open or decided); a tap on a plan sends one invite and
 * says how many came in, counts only, never names.
 *
 * The picker reads every page of upcoming plans before it says there are
 * none. A page that fails stops there and shows its line with Try again,
 * never a wait that does not end.
 *
 * The crew page (yuvoy-app#227) renders it under the members. Waits for
 * #222 (the age and name steps; until then those refusals show their line).
 */
export function CrewInvite({
  crewId,
  memberCount,
}: {
  crewId: string;
  memberCount: number;
}) {
  const people = useRelease("people");
  const plans = useRelease("plans");
  const [open, setOpen] = useState(false);
  if (!people.open || !plans.open || memberCount < 1) return null;
  if (!open) {
    return (
      <Button variant="outline" block onClick={() => setOpen(true)}>
        {CREW_INVITE_WORDS.button}
      </Button>
    );
  }
  return <PlanPicker crewId={crewId} />;
}

function PlanPicker({ crewId }: { crewId: string }) {
  const plans = useInvitablePlans(true);
  const invite = useInviteCrewToPlan(crewId);
  const box = useRef<HTMLElement>(null);

  // The phone scrolls the picker into view; on the web, focus moves to it.
  useEffect(() => {
    box.current?.focus();
  }, []);

  const failed =
    plans.isLoadingError || plans.isRefetchError || plans.isFetchNextPageError;
  const tryReadAgain = () => {
    if (plans.isFetchNextPageError) void plans.fetchNextPage();
    else void plans.refetch();
  };

  return (
    <section
      ref={box}
      tabIndex={-1}
      aria-label={CREW_INVITE_WORDS.button}
      className="outline-none"
    >
      <h2 className="text-lg font-bold">{CREW_INVITE_WORDS.button}</h2>
      <InviteOutcome invite={invite} />
      {failed ? (
        <ReadFailed
          error={plans.error}
          retrying={plans.isFetching}
          onRetry={tryReadAgain}
        />
      ) : !plans.complete ? (
        <p role="status" className="text-forest/70 mt-3 text-sm">
          {CREW_INVITE_WORDS.loading}
        </p>
      ) : plans.plans.length === 0 ? (
        <p className="text-forest/70 mt-3 text-sm">
          {CREW_INVITE_WORDS.noPlans}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {plans.plans.map((plan) => (
            <li key={plan.id}>
              <PlanRow
                plan={plan}
                sending={invite.isPending && invite.variables === plan.id}
                onPick={() => invite.invite(plan.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PlanRow({
  plan,
  sending,
  onPick,
}: {
  plan: PlanSummary;
  sending: boolean;
  onPick: () => void;
}) {
  const when = plan.startsAt ? planMoment(plan.startsAt, plan.timeZone) : null;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-busy={sending || undefined}
      className="border-forest/15 hover:border-forest w-full rounded-2xl border px-4 py-3 text-left"
    >
      <span className="block font-bold">{plan.title}</span>
      {when ? (
        <span className="text-forest/70 block text-sm">{when}</span>
      ) : null}
      {plan.placeText ? (
        <span className="text-forest/70 block text-sm">{plan.placeText}</span>
      ) : null}
      {sending ? (
        <span className="text-forest/70 block text-sm">
          {CREW_INVITE_WORDS.sending}
        </span>
      ) : null}
    </button>
  );
}

/** The line after an invite: how many came in, or why nobody did. */
function InviteOutcome({
  invite,
}: {
  invite: ReturnType<typeof useInviteCrewToPlan>;
}) {
  if (invite.data) {
    return (
      <p role="status" className="mt-3 text-sm font-bold">
        {crewInviteLine(invite.data)}
      </p>
    );
  }
  if (!invite.error) return null;
  const failure = crewInviteFailure(invite.error);
  const planId = invite.variables;
  return (
    <div role="alert" className="mt-3">
      <p className="text-sm">{failure.line}</p>
      {failure.retry && planId ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() => invite.invite(planId)}
        >
          {CREW_INVITE_WORDS.tryAgain}
        </Button>
      ) : null}
    </div>
  );
}

function ReadFailed({
  error,
  retrying,
  onRetry,
}: {
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
}) {
  const said = planPickerLine(error);
  return (
    <div role="alert" className="mt-3">
      <p className="text-sm">{said.line}</p>
      {said.retry ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          pending={retrying}
          pendingLabel={CREW_INVITE_WORDS.tryingAgain}
          onClick={onRetry}
        >
          {CREW_INVITE_WORDS.tryAgain}
        </Button>
      ) : null}
    </div>
  );
}
