"use client";

import type { MouseEvent } from "react";
import { isPlanLinkPath } from "@/lib/booking/scrub";

/**
 * "Skip to content", the first focusable element on every page.
 *
 * An anchor to `#main`, so it works with no script at all, as it always has.
 *
 * ## Except that on the plan link page an anchor would lose the plan
 *
 * `/p/#<token>` keeps the plan's token in the fragment (yuvoy-mobile#373),
 * and following `#main` replaces the fragment: the token is gone from the
 * address, a reload or a share of the page then opens "this link is not
 * working", and the plan is lost to that phone. So there, and only there,
 * the click moves focus to `main` by script and leaves the address alone.
 * With no script that page shows only its noscript line, so the anchor has
 * nothing to break.
 *
 * Every other page keeps the plain anchor, exactly as before.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      onClick={focusMainOnPlanLink}
      className="bg-paper text-forest sr-only text-xs font-bold focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-3"
    >
      Skip to content
    </a>
  );
}

export function focusMainOnPlanLink(
  event: MouseEvent<HTMLAnchorElement>,
): void {
  if (!isPlanLinkPath(window.location.pathname)) return;
  event.preventDefault();
  const main = document.getElementById("main");
  if (!main) return;
  /*
    `main` is not focusable by itself. Made so for this one move and put back
    as it was when focus leaves, so a later Tab starts from here rather than
    from the top, and `main` never sits in the tab order.
  */
  if (!main.hasAttribute("tabindex")) {
    main.setAttribute("tabindex", "-1");
    main.addEventListener("blur", () => main.removeAttribute("tabindex"), {
      once: true,
    });
  }
  main.focus();
}
