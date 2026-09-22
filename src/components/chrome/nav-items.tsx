"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
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

  return (
    <ul className={cn("flex", bar ? "items-center gap-1" : "flex-col gap-1")}>
      {NAV.map((item) => {
        const active = item.match(pathname);
        const Icon = ICONS[item.icon];
        const dot = mounted && item.signal === "unreadTrips" && unreadTrips;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
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
                  ? active
                    ? "bg-paper text-forest gap-2 pr-4 pl-3.5"
                    : "text-paper/70 hover:text-paper w-11 justify-center"
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
              <span className="relative inline-flex">
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
                className={cn(
                  "label font-bold",
                  bar && "text-[11px]",
                  bar && !active && "sr-only",
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
}
