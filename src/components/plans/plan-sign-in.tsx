import { planWords } from "@/lib/plans/words";
import { ButtonLink } from "@/components/ui/button";

/**
 * The signed-in plan page for somebody with no session (yuvoy-app#193).
 *
 * Nothing about the plan, not even its title: nothing was asked of the API,
 * and a plan is only for the people on it. Sign in comes straight back here
 * (`next`), where the plan opens. The id is a checked plan id by the time
 * this is drawn, so it goes into the link as it is, as an invited trip's does.
 */
export function PlanSignIn({ id }: { id: string }) {
  return (
    <>
      <h1 className="font-display tracking-display leading-display text-3xl text-balance">
        {planWords.signInTitle}
      </h1>
      <p className="text-forest/70 text-body mt-3 text-pretty">
        {planWords.signInBody}
      </p>
      <ButtonLink
        href={`/account?next=/plans/${encodeURIComponent(id)}`}
        size="lg"
        className="mt-6"
      >
        {planWords.signIn}
      </ButtonLink>
    </>
  );
}
