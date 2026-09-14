"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { ButtonLink } from "@/components/ui/button";
import { nextParamFor } from "@/lib/site/next-path";
import { cn } from "@/lib/cn";

/**
 * A way in, top right, for anybody who is not signed in (yuvoy-app#56).
 *
 * Asked for by the owner on 14 September, and it is the answer to the one
 * thing a cookie cannot fix: WhatsApp and Instagram each open links in their
 * own browser with their own cookie jar, so a traveller who is signed in in
 * Safari opens a shared reel from a message and is a stranger again. There is
 * no way to share a session across those, and no attempt is made
 * (yuvoy-app#57). What there can be is a visible way back in on every screen.
 *
 * ## Three states, and the third is why it is not a one-liner
 *
 *   - **Signed out:** the button.
 *   - **Signed in:** nothing.
 *   - **Still reading:** nothing, but the space is held.
 *
 * The third state exists because `signedIn` is `undefined` until `/api/session`
 * answers, and `undefined` is falsy. Rendering the button through it would
 * flash Login at somebody who is signed in, on every page load, and then take
 * it away. The issue names that: "no page flashes it while loading."
 *
 * ## Where it does not appear
 *
 * Not on `/account`, which IS the sign-in form. A button that says Login on
 * the page you log in on is furniture, and the issue says so.
 */

function LoginButtonInner({ className }: { className?: string }) {
  const { signedIn } = useTravellerSession();
  const pathname = usePathname();
  const search = useSearchParams();

  // The screen it would send you to. See above.
  if (pathname === "/account") return null;

  // Still reading. See HeldSpace.
  if (signedIn === undefined) return <HeldSpace className={className} />;

  if (signedIn) return null;

  const next = nextParamFor(pathname, search.size ? `?${search}` : "");

  return (
    <ButtonLink
      href={`/account?next=${encodeURIComponent(next)}`}
      variant="outlineOnDark"
      size="md"
      className={className}
    >
      Login
    </ButtonLink>
  );
}

/** The held space, and the Suspense fallback. One shape, defined once. */
function HeldSpace({ className }: { className?: string }) {
  /*
    Not a skeleton. A shimmer would draw the eye to a control that may be
    about to not exist, on every page load, which is worse than the half
    second of nothing it replaces.
  */
  return (
    <span
      aria-hidden="true"
      className={cn("block h-11 w-[5.5rem]", className)}
    />
  );
}

/**
 * The boundary `useSearchParams` needs, put here rather than at each call site.
 *
 * Next bails a statically prerendered page to client rendering when a client
 * component reads the search params outside a Suspense boundary, and `next
 * build` refuses outright: "useSearchParams() should be wrapped in a suspense
 * boundary at page /account". Three call sites would otherwise each have to
 * remember, and the fourth would not.
 *
 * The fallback is the same held space the loading branch draws, so the
 * boundary is invisible: `/`, `/account`, `/trips` and the rest stay static
 * and nothing moves when it resolves.
 */
export function LoginButton({ className }: { className?: string }) {
  return (
    <Suspense fallback={<HeldSpace className={className} />}>
      <LoginButtonInner className={className} />
    </Suspense>
  );
}
