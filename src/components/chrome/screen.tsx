import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Wordmark } from "@/components/ui/wordmark";
import { BackButton } from "./back-button";
import { LoginButton } from "@/components/auth/login-button";

/**
 * The screen chassis — v2.7's stage and sheet.
 *
 * Every screen except the feed is the same object: a forest STAGE, and a
 * cream SHEET rising out of it with the sheet's rounded top. On a phone the
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
 * The reading surface is cream, so everything the marketing site measured on
 * cream still holds inside the sheet, unchanged.
 */
export interface BackTarget {
  href: string;
  /** Where it leads, for the control's name. */
  label: string;
}

export function Screen({
  children,
  back,
  stageLabel,
  hero,
  heroActions,
  width = "md",
  className,
}: {
  children: ReactNode;
  /** Present on a focused screen: where the back control leads. */
  back?: BackTarget;
  /** A small tracked caption centred in the stage header: "Checkout". */
  stageLabel?: string;
  /** Full-bleed media at the top of the stage; the sheet rises over it. */
  hero?: ReactNode;
  /** Controls that float over the hero's top-right corner. */
  heroActions?: ReactNode;
  /** The sheet's measure: forms and lists, or a page with a photograph. */
  width?: "md" | "lg";
  className?: string;
}) {
  const focused = Boolean(back);
  const measure = width === "lg" ? "max-w-3xl" : "max-w-xl";

  return (
    <div
      className={cn("stage flex flex-1 flex-col lg:px-8 lg:py-8", className)}
    >
      <div
        className={cn(
          "flex flex-1 flex-col lg:mx-auto lg:w-full lg:flex-none",
          width === "lg" ? "lg:max-w-3xl" : "lg:max-w-xl",
        )}
      >
        {hero ? (
          <div className="lg:rounded-t-sheet relative lg:overflow-hidden">
            {hero}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4">
              <div className="pointer-events-auto">
                {back ? <BackButton {...back} over="media" /> : null}
              </div>
              <div className="pointer-events-auto flex gap-2">
                {heroActions}
              </div>
            </div>
          </div>
        ) : (
          <header
            className={cn(
              "relative flex h-16 items-center justify-between px-4",
              // The rail carries the mark on a desktop; a tab root has
              // nothing else to put here, so the strip goes.
              !focused && "lg:hidden",
            )}
          >
            {back ? (
              <BackButton {...back} />
            ) : (
              <Wordmark tone="cream" className="h-7" priority />
            )}
            {stageLabel ? (
              <p className="label text-cream/70 absolute left-1/2 -translate-x-1/2">
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
        )}

        <div
          className={cn(
            "sheet rounded-t-sheet lg:rounded-sheet flex flex-1 flex-col",
            hero && "relative -mt-8 lg:mt-0 lg:rounded-t-none",
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
      </div>
    </div>
  );
}
