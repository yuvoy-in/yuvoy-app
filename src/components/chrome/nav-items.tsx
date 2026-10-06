"use client";

import Link from "@/components/ui/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type ComponentType } from "react";
import { cn } from "@/lib/cn";
import { NAV, type NavIcon } from "@/lib/site/nav";
import { useUnreadTrips } from "@/lib/auth/use-traveller";
import { useHasMounted } from "@/lib/react/use-has-mounted";
import {
  CompassIcon,
  SearchIcon,
  TicketIcon,
  UserIcon,
} from "@/components/ui/icons";
import { useTabGlide } from "./tab-glide";

const ICONS: Record<NavIcon, ComponentType<{ className?: string }>> = {
  feed: CompassIcon,
  search: SearchIcon,
  trips: TicketIcon,
  account: UserIcon,
};

/**
 * The floating tab bar (phone) and the rail (desktop) render the same
 * registry in two orientations. One component, because two copies of a nav
 * drift the first time a destination is added.
 *
 * In the bar the active destination opens into a paper pill carrying its
 * name; the other three are discs holding only their glyph, named for a
 * screen reader. That is the reference pattern (the "Chats" pill) and it
 * keeps four targets inside a phone-width pill without becoming a toolbar.
 *
 * ## The bar moves as one object (T04 B, approved 4 Oct 2026)
 *
 * The pill answers the PRESS, not the route: the tapped destination lights at
 * once while the route is still on its way, and the paper glides to it. Two
 * truths are kept apart for that: `aria-current` says where the traveller IS
 * (the route), and `data-lit` says what the bar is showing (the press). A
 * screen reader is never told it has arrived somewhere it has not.
 *
 * The glide itself is `useTabGlide` (tab-glide.ts). Before it runs, which
 * includes the server's HTML and any browser without script, the bar is drawn
 * exactly as it always was.
 */
export function NavList({ orientation }: { orientation: "bar" | "rail" }) {
  const pathname = usePathname() ?? "";
  const bar = orientation === "bar";
  const unreadTrips = useUnreadTrips();
  /*
    THE DOT IS DRAWN ONLY ONCE HYDRATED (yuvoy-api#207).

    The server knows nothing about who is signed in, so it draws no dot. This
    list sits in the shell on every page and hydrates beside boundaries that
    may already have filled the query cache (every feed card reads the
    session), so a first client render that trusted the cache could draw a
    dot the server did not: React #418, the defect `useHasMounted` exists for.
    Until hydrated, this draws exactly what the server drew.
  */
  const mounted = useHasMounted();

  /*
    The press, held until the route answers. Kept with the path it was made
    on, and let go the moment the route moves anywhere (where it was going,
    or somewhere else), during the render that sees it move, so no effect has
    to clear it. A press on the destination already showing is not a press at
    all.

    It used to lapse by comparison alone (`press.on === pathname`), which
    comes true again when history brings that path back: Search, Trips,
    Account, then Back to Trips lit Account, a press two screens old.
  */
  const [press, setPress] = useState<{ href: string; on: string } | null>(null);
  if (press && press.on !== pathname) setPress(null);
  const [down, setDown] = useState<string | null>(null);
  const current = NAV.find((item) => item.match(pathname))?.href ?? null;
  const lit =
    bar && press && press.on === pathname && press.href !== current
      ? press.href
      : current;

  const glide = useRef<HTMLDivElement | null>(null);
  const { capture } = useTabGlide(glide, bar ? lit : null);

  const list = (
    <ul
      data-tab-base={bar ? "" : undefined}
      className={cn("flex", bar ? "items-center gap-1" : "flex-col gap-1")}
    >
      {NAV.map((item) => {
        const active = item.match(pathname);
        const shown = bar ? item.href === lit : active;
        const Icon = ICONS[item.icon];
        const dot = mounted && item.signal === "unreadTrips" && unreadTrips;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              data-key={bar ? item.href : undefined}
              data-lit={bar && shown ? "" : undefined}
              data-pressed={bar && down === item.href ? "" : undefined}
              onPointerDown={bar ? () => setDown(item.href) : undefined}
              onPointerUp={bar ? () => setDown(null) : undefined}
              onPointerCancel={bar ? () => setDown(null) : undefined}
              onPointerLeave={bar ? () => setDown(null) : undefined}
              onClick={
                bar
                  ? () => {
                      if (item.href === lit) return;
                      // Where everything is NOW, before React moves it.
                      capture();
                      setPress({ href: item.href, on: pathname });
                    }
                  : undefined
              }
              className={cn(
                /*
                  `h-11` in both, which is the system's `md` rung (36 / 44 / 52).

                  It went to `h-9` on 15 September because the owner said the
                  foot looked large on a real screen, and they reversed that the
                  same day: "they are not really looked large, its my mistake".
                  So this is back where it was, and the note is here so the next
                  person does not shrink it again on the strength of a comment
                  that no longer describes anything.
                */
                "ease-interaction flex h-11 items-center rounded-full transition-[background-color,color] duration-200",
                bar
                  ? cn(
                      "tab-link",
                      shown
                        ? "bg-paper text-forest gap-2 pr-4 pl-3.5"
                        : "text-paper/70 hover:text-paper w-11 justify-center",
                    )
                  : active
                    ? "bg-paper text-forest gap-3 px-4"
                    : "text-paper/70 hover:bg-paper/8 hover:text-paper gap-3 px-4",
              )}
            >
              {/*
                The glyph, and the dot on its shoulder when a destination has
                something new. `terra` because the dot is a mark, never text,
                and a mark needs 3:1 against what it sits on: 3.53:1 on the
                forest pill, 3.72:1 on the paper one that marks the active
                destination, and more on the media ground.
              */}
              <span className="tab-glyph relative inline-flex">
                <Icon className="size-5" />
                {dot ? (
                  <span
                    aria-hidden="true"
                    data-dot="unread"
                    className="bg-terra absolute -top-0.5 -right-1 size-2 rounded-full"
                  />
                ) : null}
              </span>
              <span
                data-motion={bar && shown ? "" : undefined}
                className={cn(
                  "text-xs font-bold",
                  bar && "tab-label",
                  bar && !shown && "sr-only",
                )}
              >
                {item.label}
              </span>
              {/*
                The dot's words. A dot is invisible to a screen reader, and a
                destination that looks different to one reader and identical to
                another is a signal only some travellers get. So the link's name
                becomes "Trips, new messages" whenever the dot is drawn, and is
                plain "Trips" otherwise.
              */}
              {dot ? <span className="sr-only">, new messages</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  if (!bar) return list;

  return (
    <div ref={glide} data-tab-glide="off" className="relative">
      {list}
      {/*
        The lit layer: the same row again, paper on forest-ink, clipped to the
        pill under the destination that is showing. Moving the clip is the
        glide; the glyphs under it turn as it passes. A drawing, not a second
        navigation: hidden from assistive technology, out of the tab order,
        and its names are drawn by CSS (`data-label`) so no text is
        duplicated for anyone to find twice.
      */}
      <ul
        aria-hidden="true"
        inert
        data-tab-lit=""
        className="tab-lit pointer-events-none absolute inset-0 flex items-center gap-1"
      >
        {NAV.map((item) => {
          const shown = item.href === lit;
          const Icon = ICONS[item.icon];
          const dot = mounted && item.signal === "unreadTrips" && unreadTrips;
          return (
            <li key={item.href}>
              <span
                data-key={item.href}
                data-label={item.label}
                data-lit={shown ? "" : undefined}
                data-motion={shown ? "" : undefined}
                data-pressed={down === item.href ? "" : undefined}
                className={cn(
                  "tab-lit-item flex h-11 items-center rounded-full text-xs font-bold",
                  shown ? "gap-2 pr-4 pl-3.5" : "w-11 justify-center",
                )}
              >
                <span className="tab-glyph relative inline-flex">
                  <Icon className="size-5" />
                  {dot ? (
                    <span className="bg-terra absolute -top-0.5 -right-1 size-2 rounded-full" />
                  ) : null}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
