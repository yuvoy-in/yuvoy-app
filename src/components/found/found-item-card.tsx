"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import Link from "@/components/ui/link";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/icon-button";
import { CalendarIcon, MapPinIcon } from "@/components/ui/icons";
import { shareUrl } from "@/lib/share";
import { recordFound } from "@/lib/found/found-outcomes";
import { foundWords, type FoundItem } from "@/lib/found/found-words";
import { DepartmentArt } from "./department-art";
import { TrustLine } from "./trust-line";
import { SeeDetails } from "./see-details";

/**
 * One found card in the feed (yuvoy-app#179, R2-T4; the phone's `FoundCard`,
 * yuvoy-mobile#347).
 *
 * ## Every claim is the API's
 *
 * The title, the price words (`price.text`), the trust line (`check.label`),
 * the department's name (the vocabulary's) and the status are each shown as
 * the API sent them. What the web writes is the copy table's: the when line
 * drawn from the card's own dates, the where line, the status words, and the
 * lines for what a card does not say. Nothing here infers a claim: no "free"
 * from a missing price, no "checked" from a tier, no time from an undated
 * card.
 *
 * ## What is on it, top to bottom
 *
 * The department's art and name, and the status when it is not `scheduled`;
 * the title, which is the link to the card's own page `/f/{id}`; when, where
 * and the price; the trust line under a hairline; and See details, which
 * leaves Yuvoy and so asks first (`SeeDetails`, its own part). More holds
 * Share and Report a problem.
 *
 * ## Report a problem is the feed's
 *
 * The card asks for it (`onReport`) and the feed holds the sheet. A report
 * hides the card, and a sheet drawn inside the card would be unmounted with
 * it, receipt and all, the moment the card left the list. Before asking, the
 * card puts focus on its More button, which is where the sheet returns it when
 * the card is still there; when it is not, the feed moves focus on.
 */
export function FoundItemCard({
  item,
  position,
  timezone,
  departmentName,
  onReport,
  observe,
  setSize,
}: {
  item: FoundItem;
  /** Its place in the list, from 0. */
  position: number;
  /** The place's zone, which the card's dates are already in. */
  timezone: string;
  /** The vocabulary's name for its department, or null: then the art alone. */
  departmentName: string | null;
  /** Report a problem was chosen. */
  onReport: (itemId: string) => void;
  /** The feed's `shown` observer (`useFoundShown`). */
  observe?: Ref<HTMLElement>;
  /** How many cards the feed holds, or -1 while more may come. */
  setSize?: number;
}) {
  const titleId = useId();
  const status = foundWords.statusTag(item.status);

  return (
    <article
      ref={observe}
      aria-labelledby={titleId}
      aria-posinset={position + 1}
      aria-setsize={setSize ?? -1}
      // Focusable by script, so the feed can move focus to a card; not a tab stop.
      tabIndex={-1}
      data-found-id={item.id}
      data-found-position={position}
      className="rounded-card border-paper-line bg-paper focus-visible:outline-forest border p-4 focus-visible:outline-2"
    >
      <div className="flex items-start gap-3">
        <DepartmentArt department={item.department} />
        <div className="min-w-0 flex-1">
          {departmentName || status ? (
            <div className="mb-0.5 flex min-h-[22px] items-center justify-between gap-2">
              <p className="text-label text-forest/70 truncate font-medium">
                {departmentName ?? ""}
              </p>
              {status ? (
                <StatusTag soldOut={item.status === "sold_out"}>
                  {status}
                </StatusTag>
              ) : null}
            </div>
          ) : null}
          <h2
            id={titleId}
            className="text-forest text-[17px]/[22px] font-bold text-balance"
          >
            <Link
              href={`/f/${item.id}`}
              className="hover:underline focus-visible:underline"
            >
              {item.title}
            </Link>
          </h2>
        </div>
        <MoreMenu item={item} position={position} titleId={titleId} onReport={onReport} />
      </div>

      <ul className="text-forest/90 mt-3 space-y-1.5 text-sm tabular-nums">
        <Line icon={<CalendarIcon className="size-4" />}>
          {foundWords.whenLine(item, timezone)}
        </Line>
        <Line icon={<MapPinIcon className="size-4" />}>
          {foundWords.whereLine(item)}
        </Line>
        <Line icon={<RupeeMark />}>{item.price.text}</Line>
      </ul>

      <TrustLine
        check={item.check}
        className="border-paper-line mt-3 border-t pt-3"
      />

      <div className="mt-3 empty:hidden">
        <SeeDetails item={item} surface="found_feed" position={position} />
      </div>
    </article>
  );
}

function StatusTag({
  soldOut,
  children,
}: {
  soldOut: boolean;
  children: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-0.5 text-[11px]/4 font-bold",
        soldOut ? "bg-forest/8 text-forest" : "bg-terra-deep/10 text-terra-deep",
      )}
    >
      {children}
    </span>
  );
}

function Line({ icon, children }: { icon: ReactNode; children: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-forest/60 mt-0.5" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  );
}

/** The price line's mark. The words are `price.text`; this only sits beside them. */
function RupeeMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="size-4 shrink-0"
    >
      <path d="M7 4h11" />
      <path d="M7 9h11" />
      <path d="M7 4h3.5a5 5 0 0 1 0 10H7l8 7" />
    </svg>
  );
}

/* ----------------------------------------------------------------- More -- */

/**
 * More: Share and Report a problem, as a disclosure under the button.
 *
 * Not a modal sheet. Two plain choices do not need the page made inert behind
 * them, and Report a problem opens a sheet of its own, which a sheet already
 * open beneath it would fight for focus. So it is a button with
 * `aria-expanded` and the list it shows: Escape closes it and puts focus back
 * on More, and so does a tap or focus anywhere outside it.
 *
 * Share sends the card's own page on this origin (`/f/{id}`), never the
 * organiser's address: what is shared is the card with its trust line, which
 * opens signed out. `shared` is counted once the link has gone, by a share
 * sheet or onto the clipboard, as the reel's share disc counts it.
 */
function MoreMenu({
  item,
  position,
  titleId,
  onReport,
}: {
  item: FoundItem;
  position: number;
  titleId: string;
  onReport: (itemId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<"copied" | "unavailable" | null>(null);
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement | null>(null);

  // A tap anywhere outside closes it. Bound only while it is open.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // The share notice says its piece, then goes.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  const close = () => {
    setOpen(false);
    // The More button itself: `IconButton` takes no ref, so it is found here.
    wrapper.current
      ?.querySelector<HTMLButtonElement>("button[aria-expanded]")
      ?.focus();
  };

  async function share() {
    close();
    const result = await shareUrl({
      title: item.title,
      url: `${window.location.origin}/f/${item.id}`,
    });
    if (result === "shared" || result === "copied") {
      recordFound("shared", item.id, "found_feed", position);
    }
    setNotice(
      result === "copied"
        ? "copied"
        : result === "unavailable"
          ? "unavailable"
          : null,
    );
  }

  return (
    <div
      ref={wrapper}
      className="relative shrink-0"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close();
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (open && next && !wrapper.current?.contains(next)) setOpen(false);
      }}
    >
      <IconButton
        label={foundWords.more}
        variant="onPaper"
        size="sm"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // Which card's More: its title, read after the button's name.
        aria-describedby={titleId}
        onClick={() => setOpen((was) => !was)}
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
          className="size-5"
        >
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </IconButton>

      {open ? (
        <ul
          id={menuId}
          className="rounded-control border-paper-line bg-paper absolute top-full right-0 z-10 mt-2 w-52 border p-1.5 shadow-lg"
        >
          <li>
            <button
              type="button"
              className="rounded-tile text-forest hover:bg-paper-deep focus-visible:bg-paper-deep flex min-h-11 w-full items-center px-3 text-left text-sm font-medium"
              onClick={() => void share()}
            >
              {foundWords.share}
            </button>
          </li>
          <li>
            <button
              type="button"
              className="rounded-tile text-forest hover:bg-paper-deep focus-visible:bg-paper-deep flex min-h-11 w-full items-center px-3 text-left text-sm font-medium"
              onClick={() => {
                close();
                onReport(item.id);
              }}
            >
              {foundWords.reportProblem}
            </button>
          </li>
        </ul>
      ) : null}

      <span
        role="status"
        aria-live="polite"
        className={cn(
          "app-chrome absolute top-full right-0 mt-2 rounded-full px-3 py-1.5 text-[11px]/4 font-medium whitespace-nowrap",
          !notice && "sr-only",
        )}
      >
        {notice === "copied"
          ? foundWords.shareCopied
          : notice === "unavailable"
            ? foundWords.shareUnavailable
            : ""}
      </span>
    </div>
  );
}
