import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import {
  DURATION,
  EASE,
  prefersReducedMotion,
  stopAnimations,
} from "@/lib/motion";

/**
 * The tab bar's glide (T04 B, approved 4 Oct 2026): the paper under the
 * destination that is showing travels to the next one, the glyphs slide to
 * their new places, and the bar's own ground follows its new width, as one
 * object, in 250ms on `--ease-move`.
 *
 * ## How, and why this way
 *
 * The open destination is wider than the others (it carries its name), so a
 * change re-lays the row. That happens in one frame, as it always did; what
 * this adds is FLIP: read where everything was, let React lay it out anew,
 * then play the difference back as a transform. Layout happens once per
 * change and every frame after it is composited.
 *
 * The paper itself is the lit layer in `NavList` (the row again, paper with
 * forest ink) clipped to the open destination; the glide animates that clip.
 * Nothing that is clipped carries a backdrop filter: the bar's frosted ground
 * on a reel is a separate element moved by a transform. Clipping a filtered
 * element is what drew a shaded block instead of a pill in Safari during the
 * study, so the two never share an element here.
 *
 * Interruptible: a press mid-glide reads where the paper and the glyphs ARE
 * (animated values included) and starts the next glide from there.
 *
 * Reduced motion: everything lands in one frame (the label fades, in CSS).
 */

type Box = { left: number; top: number; width: number; height: number };

interface Snapshot {
  /** Each destination's box on screen, by href. */
  items: Map<string, Box>;
  /** The paper's box on screen. */
  lit: Box | null;
  /** The bar's ground on screen. */
  ground: Box | null;
}

const box = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** The paper's box on screen, read back from the clip it is drawn with. */
function clipBox(layer: HTMLElement): Box | null {
  const value = getComputedStyle(layer).clipPath;
  const m =
    /inset\(\s*([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px/.exec(
      value ?? "",
    );
  if (!m) return null;
  const [top, right, bottom, left] = m.slice(1, 5).map(Number);
  const c = box(layer);
  return {
    left: c.left + left,
    top: c.top + top,
    width: c.width - left - right,
    height: c.height - top - bottom,
  };
}

/** A box on screen as an inset of `layer`, rounded into a pill. */
function insetWithin(layer: Box, b: Box): string {
  const top = b.top - layer.top;
  const left = b.left - layer.left;
  const right = layer.left + layer.width - (b.left + b.width);
  const bottom = layer.top + layer.height - (b.top + b.height);
  return `inset(${top}px ${right}px ${bottom}px ${left}px round 9999px)`;
}

export function useTabGlide(
  ref: RefObject<HTMLDivElement | null>,
  lit: string | null,
): { capture: () => void } {
  /* A reading taken on a press; good only for the change that press makes. */
  const captured = useRef<{ snap: Snapshot; at: number } | null>(null);
  const settled = useRef<{ lit: string; snap: Snapshot } | null>(null);
  const running = useRef<Animation | null>(null);

  const parts = useCallback(() => {
    const wrap = ref.current;
    if (!wrap) return null;
    const base = wrap.querySelector<HTMLElement>("[data-tab-base]");
    const layer = wrap.querySelector<HTMLElement>("[data-tab-lit]");
    if (!base || !layer) return null;
    const ground =
      wrap
        .closest("[data-tabbar-pill]")
        ?.querySelector<HTMLElement>("[data-tabbar-ground]") ?? null;
    const links = Array.from(base.querySelectorAll<HTMLElement>("[data-key]"));
    const twins = new Map(
      Array.from(layer.querySelectorAll<HTMLElement>("[data-key]")).map(
        (el) => [el.dataset.key ?? "", el] as const,
      ),
    );
    return { wrap, base, layer, ground, links, twins };
  }, [ref]);

  /* Where everything is on screen right now, mid-glide or at rest. */
  const read = useCallback(
    (
      p: NonNullable<ReturnType<typeof parts>>,
      key: string | null,
    ): Snapshot => {
      const items = new Map(
        p.links.map((el) => [el.dataset.key ?? "", box(el)]),
      );
      const lit =
        (p.layer.style.clipPath ? clipBox(p.layer) : null) ??
        (key ? (items.get(key) ?? null) : null);
      return { items, lit, ground: p.ground ? box(p.ground) : null };
    },
    [],
  );

  /** Called on a press, before React re-lays the row. */
  const capture = useCallback(() => {
    const p = parts();
    if (p && settled.current)
      captured.current = {
        snap: read(p, settled.current.lit),
        at: performance.now(),
      };
  }, [parts, read]);

  /* Lay the paper on `key` with no motion: first paint, a resize, a font. */
  const place = useCallback(
    (key: string): boolean => {
      const p = parts();
      if (!p) return false;
      const link = p.links.find((el) => el.dataset.key === key);
      const layer = box(p.layer);
      if (!link || !layer.width) return false; // hidden (the rail is showing)
      p.layer.style.clipPath = insetWithin(layer, box(link));
      p.wrap.dataset.tabGlide = "on";
      settled.current = { lit: key, snap: read(p, key) };
      return true;
    },
    [parts, read],
  );

  useLayoutEffect(() => {
    if (lit === null) return;
    const p = parts();
    if (!p) return;
    const fresh =
      captured.current && performance.now() - captured.current.at < 1000
        ? captured.current.snap
        : null;
    const before = fresh ?? settled.current?.snap ?? null;
    const was = settled.current?.lit ?? null;
    captured.current = null;

    for (const el of [p.layer, p.ground, ...p.links, ...p.twins.values()]) {
      if (el) stopAnimations(el);
    }
    running.current = null;
    if (!place(lit)) return;

    const glide =
      was !== null && was !== lit && before && !prefersReducedMotion();
    if (!glide) return;

    p.wrap.dataset.moved = "";
    const timing: KeyframeAnimationOptions = {
      duration: DURATION.sheet,
      easing: EASE.move,
      fill: "backwards",
    };

    const layer = box(p.layer);
    const target = p.layer.style.clipPath;
    if (before.lit) {
      running.current = p.layer.animate(
        [{ clipPath: insetWithin(layer, before.lit) }, { clipPath: target }],
        timing,
      );
      /* A row that changed under the glide (a font arriving) is re-laid once it lands. */
      running.current.finished.then(
        () => {
          if (settled.current?.lit === lit) place(lit);
        },
        () => {},
      );
    }

    for (const link of p.links) {
      const key = link.dataset.key ?? "";
      const from = before.items.get(key);
      if (!from) continue;
      const dx = from.left - box(link).left;
      if (Math.abs(dx) < 0.5) continue;
      const frames = [
        { transform: `translateX(${dx}px)` },
        { transform: "none" },
      ];
      link.animate(frames, timing);
      p.twins.get(key)?.animate(frames, timing);
    }

    if (p.ground && before.ground) {
      const now = box(p.ground);
      if (now.width > 0) {
        const dx = before.ground.left - now.left;
        const sx = before.ground.width / now.width;
        if (Math.abs(dx) > 0.5 || Math.abs(sx - 1) > 0.002) {
          p.ground.animate(
            [
              { transform: `translateX(${dx}px) scaleX(${sx})` },
              { transform: "none" },
            ],
            timing,
          );
        }
      }
    }
  }, [lit, parts, place]);

  /*
    Anything that changes the row's size without changing what is open (the
    text face arriving after first paint, the window turning, the bar coming
    back from behind the rail at a narrower width) re-lays the paper, still.
  */
  useEffect(() => {
    const p = parts();
    if (!p || lit === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const playing = running.current?.playState === "running";
      if (!playing && settled.current) place(settled.current.lit);
      else if (!settled.current) place(lit);
    });
    observer.observe(p.base);
    return () => observer.disconnect();
  }, [lit, parts, place]);

  return { capture };
}
