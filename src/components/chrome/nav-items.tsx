"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { cn } from "@/lib/cn";
import { NAV, type NavIcon } from "@/lib/site/nav";
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

  return (
    <ul className={cn("flex", bar ? "items-center gap-1" : "flex-col gap-1")}>
      {NAV.map((item) => {
        const active = item.match(pathname);
        const Icon = ICONS[item.icon];
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
              <Icon className="size-5" />
              <span
                className={cn(
                  "label font-bold",
                  bar && "text-[11px]",
                  bar && !active && "sr-only",
                )}
              >
                {item.label}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
