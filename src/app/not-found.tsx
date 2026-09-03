import { Screen } from "@/components/chrome/screen";
import { EmptyState } from "@/components/states";
import { ButtonLink } from "@/components/ui/button";

/**
 * A sheet like every other screen, so the floating bar has cream under it —
 * a forest pill on the bare forest stage is a bar nobody can see.
 */
export default function NotFound() {
  return (
    <Screen>
      <EmptyState
        title="We do not have this one"
        body="It may have been taken off sale, or the link may be wrong."
        action={<ButtonLink href="/">Back to the feed</ButtonLink>}
      />
    </Screen>
  );
}
