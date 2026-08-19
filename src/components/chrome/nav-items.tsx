"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV } from "@/lib/site/nav";

/**
 * The tab bar (mobile) and the rail (desktop) render the same registry in two
 * orientations. One component, because two copies of a nav drift the first
 * time a destination is added.
 */
export function NavList({ orientation }: { orientation: "bar" | "rail" }) {
  const pathname = usePathname();
  const bar = orientation === "bar";

  return (
    <ul
      className={cn(
        "flex",
        bar ? "items-stretch justify-around" : "flex-col gap-1",
      )}
    >
      {NAV.map((item) => {
        const active = item.match(pathname);
        return (
          <li key={item.href} className={bar ? "flex-1" : undefined}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "label flex items-center transition-colors",
                bar
                  ? "min-h-11 justify-center px-2 py-3"
                  : "min-h-11 gap-3 px-4 py-2.5",
                // On forest chrome: cream/70 is the comfortable secondary
                // floor (6.45:1); full cream marks the active one.
                active
                  ? "text-cream font-bold"
                  : "text-cream/70 hover:text-cream",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
