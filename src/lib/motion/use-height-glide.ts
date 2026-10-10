import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { DURATION, EASE, prefersReducedMotion } from ".";

/**
 * A box whose contents change size, seen changing: it glides from the height
 * it was drawn at to the height its new contents need (200ms on `move`),
 * rather than jumping there.
 *
 * ## What it is for, and why it animates a height
 *
 * The reel's details panel fits its details, up to 70% of the frame (owner,
 * 10 Oct 2026), and it is pinned to the foot of the frame. Its departures
 * arrive after it opens, and when they need a different height from the
 * placeholder they replace (one or two departures, none, a failed read), the
 * panel's top edge and everything above them move. Unanimated, the whole top
 * of the panel jumps under the traveller's eyes.
 *
 * The motion system plays a difference as a transform, never as a size. This
 * difference cannot be: the edge that moves is the panel's own top, placed by
 * layout, and everything below the change has to stay exactly where it is.
 * Moving the panel drags the action at its foot along or uncovers the picture
 * under it, and moving its parts apart clips them inside its scrolling body.
 * Animating the height of the one region that changed moves exactly what
 * should move. It is one small box for 200ms, only on a change of contents,
 * so the layout it costs per frame is small and bounded.
 *
 * - Nothing on the first drawing: a box is simply there.
 * - Nothing while `enabled` is false (the panel is shut: nobody sees it).
 * - Nothing under reduced motion: the box takes its new height at once.
 * - A change mid-glide continues from the height the glide had reached.
 * - A change that is not the contents' (a font arriving, a phone turned) is
 *   remembered, never animated, so the next glide starts from the truth.
 *
 * `signature` changes whenever the contents do, and only then.
 */
export function useHeightGlide(
  ref: RefObject<HTMLElement | null>,
  signature: unknown,
  enabled: boolean,
): void {
  /** The height the box was last drawn at, once settled. */
  const drawn = useRef<number | null>(null);
  /** The contents the last reading was taken for; null before the first. */
  const seen = useRef<{ signature: unknown } | null>(null);
  const glide = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = seen.current === null;
    if (!first && Object.is(seen.current!.signature, signature)) return;
    seen.current = { signature };

    const running =
      glide.current?.playState === "running" ? glide.current : null;
    // Mid-glide the box is where the glide has it; otherwise where it settled.
    const from = running ? el.getBoundingClientRect().height : drawn.current;
    running?.cancel();
    glide.current = null;
    const to = el.getBoundingClientRect().height;
    drawn.current = to;

    if (
      first ||
      from === null ||
      !enabled ||
      Math.abs(to - from) < 1 ||
      prefersReducedMotion() ||
      typeof el.animate !== "function"
    )
      return;
    glide.current = el.animate(
      [
        { height: `${from}px`, overflow: "hidden" },
        { height: `${to}px`, overflow: "hidden" },
      ],
      { duration: DURATION.standard, easing: EASE.move },
    );
  }, [ref, signature, enabled]);

  // Between changes, the settled height is kept true.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (glide.current?.playState === "running") return;
      drawn.current = el.getBoundingClientRect().height;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}
