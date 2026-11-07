import { useLayoutEffect, useRef } from "react";
import {
  DURATION,
  EASE,
  arriveFrom,
  prefersReducedMotion,
  scrollPageBy,
} from "@/lib/motion";

/**
 * The checkout's two arrivals: a refusal the page makes room for, and the
 * form fading in with its foot rising. Moved out of the form as they were,
 * in the same order.
 */
export function useCheckoutMotion(refusal: string | null, arrive: boolean) {
  const refusalRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const panel = refusalRef.current;
    if (!refusal || !panel) return;
    const bar =
      barRef.current?.getBoundingClientRect().top ?? window.innerHeight;
    const need = panel.getBoundingClientRect().bottom + 16 - bar;
    if (need > 0) scrollPageBy(need);
    panel.focus({ preventScroll: true });
  }, [refusal]);

  /*
    THE REST OF CHECKOUT ARRIVES (T09 A): the form fades in under the times
    and its foot rises from the bottom edge (250ms). Read once, at mount.
  */
  const fieldsRef = useRef<HTMLDivElement | null>(null);
  const arrives = useRef(arrive);
  useLayoutEffect(() => {
    const fields = fieldsRef.current;
    const bar = barRef.current;
    if (!arrives.current || !fields || !bar) return;
    if (typeof fields.animate !== "function") return;
    if (prefersReducedMotion()) {
      for (const el of [fields, bar])
        el.animate(arriveFrom({ opacity: 0 }), {
          duration: DURATION.reducedFade,
          easing: "linear",
        });
      return;
    }
    fields.animate(arriveFrom({ opacity: 0 }), {
      duration: DURATION.quick,
      easing: EASE.interaction,
    });
    bar.animate(arriveFrom({ transform: "translateY(100%)" }), {
      duration: DURATION.sheet,
      easing: EASE.interaction,
    });
  }, []);

  return { refusalRef, barRef, fieldsRef };
}
