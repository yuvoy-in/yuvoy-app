import { cn } from "@/lib/cn";

/**
 * The wordmark: tracked YUVOY caps with the terracotta dot.
 *
 * The marketing site renders the owner-delivered horizontal lockup as two
 * generated SVGs. That asset is not ported yet, so this is the typographic
 * fallback — the mark set in the text face at the wordmark tracking, which is
 * the same relationship the lockup has. It is deliberately NOT an invented
 * logo: when the lockup lands, this component is replaced, not restyled.
 */
export function Wordmark({
  tone = "cream",
  className,
}: {
  tone?: "cream" | "forest";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-sans leading-none font-bold",
        tone === "cream" ? "text-cream" : "text-forest",
        className,
      )}
      style={{ letterSpacing: "var(--tracking-wordmark)" }}
    >
      <span className="text-[0.95rem]">YUVOY</span>
      <span
        aria-hidden="true"
        className="bg-terra ml-1 inline-block size-1 shrink-0"
      />
      <span className="sr-only">Yuvoy</span>
    </span>
  );
}
