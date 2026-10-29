import { mapLink, planMoment, planTimeRange } from "@/lib/plans/format";
import type { PlanView } from "@/lib/plans/types";
import { planWords } from "@/lib/plans/words";
import { MapPinIcon, CalendarIcon } from "@/components/ui/icons";

/**
 * The top of a plan: who made it, what it is, where and when, and the
 * planner's own notes (yuvoy-app#193, yuvoy-mobile#373).
 *
 * "When" is the decided time once there is one, and until then the line that
 * says friends are choosing: the offered times are answered further down, and
 * repeating three of them here would make the top of the page a list.
 *
 * The planner's map link is drawn only when it is a Google Maps link
 * (`mapLink`): it is typed by a person and opened under Yuvoy's name.
 */
export function PlanHeading({ plan }: { plan: PlanView }) {
  const decided = plan.decidedTimeId
    ? plan.times.find((t) => t.id === plan.decidedTimeId)
    : undefined;
  const when = decided
    ? planTimeRange(decided.startsAt, decided.endsAt, plan.timeZone)
    : null;
  const map = mapLink(plan.mapUrl);
  const idea = plan.decidedIdeaId
    ? plan.ideas.find((i) => i.id === plan.decidedIdeaId)
    : undefined;
  const replyBy = plan.replyBy ? planMoment(plan.replyBy, plan.timeZone) : null;

  return (
    <header>
      <p className="eyebrow text-terra-deep">
        {plan.role === "planner"
          ? planWords.youArePlanning
          : planWords.invitedYou(plan.planner.name)}
      </p>
      <h1 className="font-display tracking-display leading-display mt-2 text-3xl text-balance">
        {plan.title}
      </h1>

      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex items-start gap-2">
          <MapPinIcon className="text-forest/70 mt-0.5 size-4 shrink-0" />
          <span>
            {plan.placeText
              ? planWords.where(plan.placeText)
              : planWords.placeToDecide}
            {map ? (
              <>
                {" "}
                <a
                  href={map}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline"
                >
                  {planWords.openMap}
                </a>
              </>
            ) : null}
          </span>
        </li>
        <li className="flex items-start gap-2">
          <CalendarIcon className="text-forest/70 mt-0.5 size-4 shrink-0" />
          <span>{when ? planWords.when(when) : planWords.choosingTime}</span>
        </li>
      </ul>

      {idea ? <p className="mt-3 text-sm">{planWords.doing(idea.title)}</p> : null}
      {replyBy && !decided && plan.canReply ? (
        <p className="text-forest/70 mt-2 text-sm">{planWords.replyBy(replyBy)}</p>
      ) : null}

      {plan.note ? (
        <section className="mt-6">
          <h2 className="label text-forest/75">
            {planWords.noteFrom(plan.planner.name)}
          </h2>
          <p className="text-body mt-1 whitespace-pre-line text-pretty">
            {plan.note}
          </p>
        </section>
      ) : null}
      {plan.gettingHome ? (
        <section className="mt-4">
          <h2 className="label text-forest/75">{planWords.gettingHome}</h2>
          <p className="text-body mt-1 whitespace-pre-line text-pretty">
            {plan.gettingHome}
          </p>
        </section>
      ) : null}
    </header>
  );
}
