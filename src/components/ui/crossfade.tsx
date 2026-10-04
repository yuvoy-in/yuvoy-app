"use client";

import { useRef, type ReactNode } from "react";
import { useListMotion } from "@/lib/motion/use-list-motion";

/**
 * One state replacing another in place: a placeholder by the content it
 * stood for, a list by its empty state (the motion system §8, approved
 * 4 Oct 2026). What leaves fades where it was (100ms) while what arrives
 * fades in (150ms); under reduced motion both are a 120ms fade.
 *
 * `view` names the state showing, and the child for it carries the same
 * name as its `key` and `data-motion-key`, so a change of state is a new
 * element rather than the old one rewritten:
 *
 *     <Crossfade view={view}>
 *       {view === "loading" ? (
 *         <div key="loading" data-motion-key="loading">…</div>
 *       ) : (
 *         <div key="list" data-motion-key="list">…</div>
 *       )}
 *     </Crossfade>
 *
 * The first state is simply there.
 */
export function Crossfade({
  view,
  children,
  className,
}: {
  view: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useListMotion(ref, view, { arrive: "fade" });
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
