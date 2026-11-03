"use client";

import { Button } from "@/components/ui/button";
import { useHasMounted } from "@/lib/react/use-has-mounted";
import { useRelease } from "@/lib/site/use-release";
import { useTrigo } from "./trigo-provider";
import { ASK_ABOUT } from "./ui-words";

/**
 * "Ask Trigo about this" on a listing (`exp:{slug}`) or a found item
 * (`item:{uuid}`). Opens the sheet with `?trigo=about:{cardId}`, and the
 * turns of that opening carry the card as `aboutCardId` (R5-T5).
 *
 * Hidden while the release is closed and before hydration. Outside a
 * `TrigoProvider` it draws nothing and reads nothing, so the card's own tests
 * and any page without the provider are unchanged.
 */
export function AskAboutButton({
  cardId,
  entry,
  className,
}: {
  cardId: string;
  entry: "listing" | "found_card";
  className?: string;
}) {
  const trigo = useTrigo();
  if (!trigo) return null;
  return (
    <Shown
      className={className}
      onOpen={() => trigo.open({ entry, aboutCardId: cardId })}
    />
  );
}

function Shown({
  className,
  onOpen,
}: {
  className?: string;
  onOpen: () => void;
}) {
  const release = useRelease("trigo");
  const mounted = useHasMounted();
  if (!mounted || !release.open) return null;
  return (
    <Button variant="outline" size="sm" className={className} onClick={onOpen}>
      {ASK_ABOUT}
    </Button>
  );
}
