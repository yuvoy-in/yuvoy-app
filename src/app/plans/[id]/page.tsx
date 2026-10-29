import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readPlanForPage } from "@/lib/plans/read-plan";
import { privateRobotsMeta } from "@/lib/site/indexing";
import { Screen } from "@/components/chrome/screen";
import { MemberPlan } from "@/components/plans/member-plan";
import { PlanLoadFailed } from "@/components/plans/plan-load-failed";
import { PlanSignIn } from "@/components/plans/plan-sign-in";

/**
 * A plan, for a signed-in person on it (yuvoy-app#193).
 *
 * ## Read on the server, with the session
 *
 * Unlike an invited trip, which is a shell until the browser asks, the plan
 * is read here: the session cookie is HttpOnly and this server holds it, so
 * the page arrives with the plan in it and the reply form already drawn. A
 * form drawn before its script arrives is the case `useChangedBeforeHydration`
 * exists for, and the form calls it.
 *
 * Signed out, nothing is asked of the API (it could only say 401): the page
 * says sign in and comes back here. An id that is not a plan id, the API's
 * 404, and plans closed to this reader (which the API also answers 404) all
 * show the app's own not-found page, with its own words.
 *
 * ## Never streamed, never indexed
 *
 * No `loading.tsx` above this page: a boundary streams a 200 before the page
 * runs, and `notFound()` could no longer make it a 404 (`loading.test.ts`).
 * `privateRobotsMeta` and `/plans/` in `PRIVATE_ROUTES` keep it out of every
 * search index and the sitemap: a plan is for the people on it.
 *
 * The title is the same word for every plan. The plan's own title would put
 * what friends are doing and where into a tab, a history list and a shared
 * screen; the page's heading carries it for the person reading.
 */
export const metadata: Metadata = {
  title: "A plan",
  robots: privateRobotsMeta,
};

export const dynamic = "force-dynamic";

const BACK = { href: "/", label: "the feed" };

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  // The page's own `?__scenario=`, honoured in a mocked build only.
  const scenario =
    typeof query.__scenario === "string" ? query.__scenario : undefined;

  const read = await readPlanForPage(id, scenario);

  switch (read.kind) {
    case "not-found":
      return notFound();
    case "signed-out":
      return (
        <Screen back={BACK}>
          <PlanSignIn id={id} />
        </Screen>
      );
    case "paused":
      return (
        <Screen back={BACK}>
          <PlanLoadFailed paused requestId={read.requestId} />
        </Screen>
      );
    case "failed":
      return (
        <Screen back={BACK}>
          <PlanLoadFailed
            paused={false}
            status={read.status}
            requestId={read.requestId}
          />
        </Screen>
      );
    case "plan":
      return (
        <Screen back={BACK} stageLabel="A plan">
          <MemberPlan plan={read.plan} />
        </Screen>
      );
  }
}
