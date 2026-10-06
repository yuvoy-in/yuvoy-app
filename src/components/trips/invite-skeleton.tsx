import { cn } from "@/lib/cn";
import { Screen } from "@/components/chrome/screen";
import { Panel } from "@/components/ui/panel";
import { LoadingState, Skeleton } from "@/components/states";

/** The invitation's caption, in every state the screen can be seen in. */
export const INVITE_STAGE_LABEL = "You are invited";

/**
 * The invitation while it is read, in ONE shape for every moment it can be
 * seen: the route's boundary while the page is fetched, and the screen
 * waiting for the trip and the session.
 *
 * It was three. A link opened from a group chat drew the generic sheet (a
 * bar, a title, three cards), then a smaller skeleton of another shape, then
 * the page, whose caption arrived last of all (stability audit, 6 Oct 2026).
 * Now the first frame is the page's own: its caption, its eyebrow, title and
 * host lines as the line boxes they will be, its panel and its button.
 */
export function InviteSkeleton() {
  return (
    <Screen stageLabel={INVITE_STAGE_LABEL}>
      <LoadingState label="Loading this invitation">
        <Line className="text-label" bar="h-2.5 w-28" />
        <Line
          className="leading-display mt-2 text-3xl text-balance"
          bar="h-7 w-3/4"
        />
        <Line className="mt-2 text-sm" bar="h-3 w-32" />
        <Panel className="mt-6">
          <Line className="text-sm" bar="h-3 w-40" />
          <Skeleton className="mt-3 h-7 w-24" />
        </Panel>
        <Skeleton className="mt-8 h-13 w-full" />
      </LoadingState>
    </Screen>
  );
}

/** One line of the screen's text, still to come: its line box, and a bar in it. */
function Line({ className, bar }: { className: string; bar: string }) {
  return (
    <div className={cn("flex h-[1lh] items-center", className)}>
      <Skeleton className={cn("max-w-full", bar)} />
    </div>
  );
}
