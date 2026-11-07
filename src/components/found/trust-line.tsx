import { cn } from "@/lib/cn";
import type { FoundItem } from "@/lib/found/found-words";

/**
 * A found card's trust line (yuvoy-app#179): the API's `check.label`, word
 * for word, with a small mark beside it.
 *
 * The words are the claim. The contract says so ("the trust line, verbatim;
 * never replaced by an icon"), and the label already carries everything a
 * reader needs: who checked it and when, that it is being checked again, or
 * that Trigo found it and nobody has checked it yet. So nothing here composes,
 * shortens or rewords it, and nothing chooses a different sentence from the
 * tier: a web that wrote its own line could say "checked" about a card the
 * API says is lapsed.
 *
 * The mark is decoration, `aria-hidden`, and only ever beside the words: a
 * shield for a person's check that still counts, a magnifier for Trigo's find,
 * a clock for a check that has lapsed or is being done again, as the phone
 * draws it (`trustLook`). It is chosen from the API's own fields and says
 * nothing the words do not.
 */

type Look = "checked" | "found" | "lapsed";

function lookOf(check: FoundItem["check"]): Look {
  if (check.lapsed || check.rechecking) return "lapsed";
  return check.tier === "found" ? "found" : "checked";
}

const INK: Record<Look, string> = {
  checked: "text-forest",
  found: "text-terra-deep",
  lapsed: "text-forest/75",
};

function Mark({ look }: { look: Look }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-look={look}
      className="mt-px size-4 shrink-0"
    >
      {look === "checked" ? (
        <>
          <path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6z" />
          <path d="m9 12 2 2 4-4" />
        </>
      ) : look === "found" ? (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      )}
    </svg>
  );
}

export function TrustLine({
  check,
  className,
}: {
  check: FoundItem["check"];
  className?: string;
}) {
  const look = lookOf(check);
  return (
    <p
      className={cn(
        "text-label flex items-start gap-2 font-medium",
        INK[look],
        className,
      )}
    >
      <Mark look={look} />
      <span>{check.label}</span>
    </p>
  );
}
