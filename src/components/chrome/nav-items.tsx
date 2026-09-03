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
 * In the bar the active destination opens into a cream pill carrying its
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
                "ease-interaction flex h-11 items-center rounded-full transition-[background-color,color] duration-200",
                bar
                  ? active
                    ? "bg-cream text-forest gap-2 pr-4 pl-3.5"
                    : "text-cream/70 hover:text-cream w-11 justify-center"
                  : active
                    ? "bg-cream text-forest gap-3 px-4"
                    : "text-cream/70 hover:bg-cream/8 hover:text-cream gap-3 px-4",
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
