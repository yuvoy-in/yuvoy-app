import type { PlanPerson, PlanView } from "@/lib/plans/types";
import { namesList, planWords } from "@/lib/plans/words";

/**
 * Who is on the plan (yuvoy-app#193, yuvoy-mobile#373).
 *
 * Before the pick a reply says only that somebody answered, never what, so
 * the lists are "Replied" and "Not replied yet". After it, each person's
 * answer for the decided time: Going, Maybe, Can't make it. The reader is
 * "You" in whichever list they are in.
 *
 * First names only, as the API sends them: no phone number, email or id of
 * anybody is drawn, and none is on the response to draw.
 */
export function PlanPeople({ plan }: { plan: PlanView }) {
  if (plan.people.length === 0) return null;
  const name = (p: PlanPerson) => (p.you ? planWords.you : p.name);
  const by = (...replies: PlanPerson["reply"][]) =>
    plan.people.filter((p) => replies.includes(p.reply)).map(name);

  const lines: [(names: string) => string, string[]][] = plan.decidedTimeId
    ? [
        [planWords.going, by("going")],
        [planWords.maybe, by("maybe")],
        [planWords.cantMakeIt, by("cant")],
        [planWords.notRepliedYet, by("none", "answered")],
      ]
    : [
        [planWords.replied, by("answered", "going", "maybe", "cant")],
        [planWords.notRepliedYet, by("none")],
      ];

  return (
    <section aria-labelledby="plan-people" className="mt-10">
      <h2
        id="plan-people"
        className="font-display tracking-display leading-display text-2xl text-balance"
      >
        {planWords.people}
      </h2>
      <ul className="mt-3 space-y-1">
        {lines
          .filter(([, names]) => names.length > 0)
          .map(([line, names]) => (
            <li key={line(" ")}>{line(namesList(names))}</li>
          ))}
      </ul>
    </section>
  );
}
