"use client";

import { Button } from "@/components/ui/button";
import { useHasMounted } from "@/lib/react/use-has-mounted";
import { useRelease } from "@/lib/site/use-release";
import { TRIGO_TITLE } from "@/lib/trigo/words";
import { useTrigo } from "./trigo-provider";

type Variant = "outlineOnDark" | "outline" | "paper";

/**
 * "Ask Trigo" in the masthead, beside the sign-in button (R5-T5).
 *
 * Only while `releases.trigo` is open to this traveller, and only once
 * hydrated: the release is read from a cache that can be filled before this
 * boundary hydrates, and drawing it then would not match what the server drew
 * (the same React #418 the Login button guards against).
 *
 * Outside a `TrigoProvider` it draws nothing and reads nothing, so a test or
 * a page without the provider never asks for the release.
 *
 * Signed out it still shows: the sheet says why an account is needed and
 * offers the way in, which is the issue's signed-out state.
 */
export function AskTrigoButton({
  className,
  destinationKey,
  variant = "outlineOnDark",
}: {
  className?: string;
  destinationKey?: string;
  variant?: Variant;
}) {
  const trigo = useTrigo();
  if (!trigo) return null;
  return (
    <Shown
      className={className}
      variant={variant}
      onOpen={() => trigo.open({ entry: "masthead", destinationKey })}
    />
  );
}

function Shown({
  className,
  variant,
  onOpen,
}: {
  className?: string;
  variant: Variant;
  onOpen: () => void;
}) {
  const release = useRelease("trigo");
  const mounted = useHasMounted();
  if (!mounted || !release.open) return null;
  return (
    <Button variant={variant} size="md" className={className} onClick={onOpen}>
      {TRIGO_TITLE}
    </Button>
  );
}
