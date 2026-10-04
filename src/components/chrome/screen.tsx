import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Wordmark } from "@/components/ui/wordmark";
import { BackButton } from "./back-button";
import { TrailBackButton } from "./trail-back-button";
import { LoginButton } from "@/components/auth/login-button";
import { ViewTransition } from "@/lib/motion/view-transition";
import { SHEET_MOTION, STAGE_MOTION } from "@/lib/motion/route-motion";

/**
 * The screen chassis — v2.7's stage and sheet.
 *
 * Every screen except the feed is the same object: a forest STAGE, and a
 * paper SHEET rising out of it with the sheet's rounded top. On a phone the
 * stage is the strip above the sheet — a masthead on a tab root, a back
 * control and a small label on a focused screen, or the hero photograph the
 * sheet rises over. On a desktop the stage is the whole canvas and the sheet
 * is a panel floating on it, rounded on every corner, its width set by
 * `width`.
 *
 * `back` is what makes a screen FOCUSED. Its presence draws the back control
 * and drops the tab bar's clearance, because a focused route hides the bar
 * (`isFocusedRoute` in the registry is the other half of that decision, and
 * `nav.test.ts` pins the two lists to each other).
 *
 * The reading surface is paper, so every floor the system measures on the
 * canvas applies inside the sheet — with the v2.9 headroom, since a white
 * canvas raised each of them by 1.1467.
 *
 * ## How it changes (the motion system, approved 4 Oct 2026)
 *
 * The stage strip and the sheet are each a view transition, because they
 * answer a screen change differently: into a focused screen the stage stays
 * and the sheet rises (T01 C), Back drops it again, and between tab roots the
 * sheet alone fades through (T01 A). Which change it was is decided by the
 * link (`lib/motion/route-motion.ts`); what each part does is in the maps
 * imported above and the stylesheet's "motion: screen changes".
 */
export interface BackTarget {
  href: string;
  /** Where it leads, for the control's name. */
  label: string;
  /**
   * Return to the screen the traveller came from when it is one of ours, and
   * use `href` only when it is not (`TrailBackButton`). For a screen reached
   * from many places, like a listing; a step inside one place keeps its
   * fixed parent.
   */
  followTrail?: boolean;
}

function Back({
  target,
  over,
}: {
  target: BackTarget;
  over?: "stage" | "media";
}) {
  const { followTrail, ...link } = target;
  return followTrail ? (
    <TrailBackButton {...link} over={over} />
  ) : (
    <BackButton {...link} over={over} />
  );
}

export function Screen({
  children,
  back,
  stageLabel,
  hero,
  heroActions,
  width = "md",
}: {
  children: ReactNode;
  /** Present on a focused screen: where the back control leads. */
  back?: BackTarget;
  /** A small tracked caption centred in the stage header: "Checkout". */
  stageLabel?: string;
  /**
   * Full-bleed media at the top of the stage; the sheet rises over it. On a
   * phone the media stays put and the sheet scrolls up over it.
   */
  hero?: ReactNode;
  /** Controls that float over the hero's top-right corner. */
  heroActions?: ReactNode;
  /** The sheet's measure: forms and lists, or a page with a photograph. */
  width?: "md" | "lg";
}) {
  const focused = Boolean(back);
  const measure = width === "lg" ? "max-w-3xl" : "max-w-xl";

  /*
    NO WRAPPING ELEMENT. The stage strip and the sheet are the screen's top
    level, side by side in the shell's `main`, because each is a view
    transition and React only animates a <ViewTransition> into or out of a
    screen when no DOM element stands above it in what is added or removed
    (react.dev, "Only top-level ViewTransition animates on exit/enter"). A
    wrapping <div> here was the whole reason no screen change between two
    sheets moved at all.

    So what the two wrappers did is said on the parts instead, to the pixel:
    on a phone `main` is already the stage's column; from `lg` up each part is
    the centred column itself (the measure, 32px from the edges and above the
    first part, 32px under the last), and the sheet ends where its content
    does rather than stretching to the window, as the column did.
  */
  const column = cn(
    "lg:mx-auto lg:w-[calc(100%-4rem)]",
    width === "lg" ? "lg:max-w-3xl" : "lg:max-w-xl",
  );
  /*
    How far the sheet rises over the hero: the depth of its rounded top, and
    nothing from `lg` up, where the sheet sits below a panel's picture. One
    number for both sides of the seam, so the hero can keep whatever it draws
    at its foot (a gallery's dots, a clip's sound) clear of the sheet rather
    than under it. Set on the hero and on the sheet, the two that read it.
  */
  const overlap = "[--hero-overlap:2rem] lg:[--hero-overlap:0px]";

  return (
    <>
      {hero ? (
        <ViewTransition {...STAGE_MOTION}>
          {/*
            The controls float above everything, the picture and the sheet
            alike. A zero-height sticky row, so it takes no room and pushes
            nothing down, with the discs hanging from it; on a phone it stays
            at the top while the sheet slides up over the picture, so Back is
            never under the page it leads out of. The discs carry their own
            ground (`over="media"`), so they read on paper too. From `lg` up
            nothing slides, so the row scrolls away with the picture, as it
            always did; it is also the column's first part there, so it
            carries the 32px above the panel.
          */}
          <div
            className={cn(
              "pointer-events-none sticky top-0 z-20 h-0 lg:relative lg:mt-8",
              column,
            )}
          >
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
              <div className="pointer-events-auto">
                {back ? <Back target={back} over="media" /> : null}
              </div>
              <div className="pointer-events-auto flex gap-2">
                {heroActions}
              </div>
            </div>
          </div>
          {/*
            THE FAR SIDE (the redesign, traveller A, 3 Oct 2026). On a phone
            the picture stays where it is and the sheet scrolls up over it,
            the way the reel's far side was always described: the clip is
            still there behind the page about it. From `lg` up the sheet is a
            panel beside nothing, so the picture scrolls with it as before.
          */}
          <div
            className={cn(
              "lg:rounded-t-sheet relative max-lg:sticky max-lg:top-0 max-lg:z-0 lg:overflow-hidden",
              column,
              overlap,
            )}
          >
            {hero}
          </div>
        </ViewTransition>
      ) : (
        <ViewTransition {...STAGE_MOTION}>
          <header
            className={cn(
              "relative flex h-16 items-center justify-between px-4 lg:mt-8",
              column,
              // The rail carries the mark on a desktop; a tab root has
              // nothing else to put here, so the strip goes.
              !focused && "lg:hidden",
            )}
          >
            {back ? (
              <Back target={back} />
            ) : (
              <Wordmark tone="paper" className="h-7" priority />
            )}
            {stageLabel ? (
              <p className="label text-paper/70 absolute left-1/2 -translate-x-1/2">
                {stageLabel}
              </p>
            ) : null}
            {/*
              Login sits to the LEFT of any hero actions, and only on a screen
              that carries the logo: a focused screen has a back control there
              instead, and no mark to sit opposite (yuvoy-app#56 item 3).

              The empty 44px span that used to hold this slot open is gone.
              `LoginButton` holds its own space while the session is still
              being read, and an invisible span beside a real button would
              simply push Login 44px off the edge.
            */}
            <div className="flex items-center gap-2">
              {focused ? null : <LoginButton />}
              {heroActions}
            </div>
          </header>
        </ViewTransition>
      )}

      <ViewTransition {...SHEET_MOTION}>
        <div
          className={cn(
            "sheet rounded-t-sheet lg:rounded-sheet flex flex-1 flex-col lg:mb-8 lg:flex-none",
            column,
            // The first part of the column on a desktop when the strip above
            // it is hidden there (a tab root), so it carries the 32px.
            !hero && !focused && "lg:mt-8",
            // Above the sticky picture, so it slides over it.
            hero &&
              cn(
                "relative z-10 -mt-(--hero-overlap) lg:rounded-t-none",
                overlap,
              ),
          )}
        >
          <div
            className={cn(
              "container-page flex flex-1 flex-col pt-6",
              measure,
              focused ? "pb-8" : "tabbar-clearance",
            )}
          >
            {children}
          </div>
        </div>
      </ViewTransition>
    </>
  );
}
