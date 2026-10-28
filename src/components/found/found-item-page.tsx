"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/states";
import {
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  MapPinIcon,
  TicketIcon,
} from "@/components/ui/icons";
import { DepartmentArt } from "@/components/found/department-art";
import { TrustLine } from "@/components/found/trust-line";
import { SeeDetails } from "@/components/found/see-details";
import { ReportSheet } from "@/components/found/report-sheet";
import { foundWords } from "@/lib/found/found-words";
import { hostOf } from "@/lib/found/link-out";
import { recordFound } from "@/lib/found/found-outcomes";
import { useVocabulary } from "@/lib/search/use-search-reels";
import type { components } from "@/lib/api/schema.gen";

export type FoundItemDetail = components["schemas"]["FoundItemDetail"];

/**
 * The card page's own words (R2-T4; mobile's `FOUND_PAGE_WORDS` in
 * `found-page.tsx` is the same table). The card's words, the when and where
 * lines and the status tags, are `found-words.ts`'s and are not repeated here.
 */
export const FOUND_PAGE_WORDS = Object.freeze({
  ended: "This has ended.",
  when: "When",
  where: "Where",
  price: "Price",
  noEndTime: "End time not listed",
  soldBy: "Tickets are sold by the organiser, not Yuvoy.",
  whoRunsIt: "Who runs it",
  alsoListed: (hosts: readonly string[]) =>
    `Also listed on ${hosts.join(", ")}`,
  report: "Report a problem",
});

/**
 * Whether the card should say its end time is not listed: a dated card on
 * one day, whose page states no end time. A card over several days ends on
 * its `endsOn`, and an undated one already says to check its page.
 */
export function endTimeMissing(
  item: Pick<FoundItemDetail, "when"> & {
    stated?: Pick<FoundItemDetail["stated"], "endTime"> | null;
  },
): boolean {
  if (!item.when.startsOn || item.when.endsOn) return false;
  return !item.stated?.endTime;
}

/**
 * The other pages the card is listed on, by host (DECISIONS-LOG 2026-10-18
 * 20:05 Q8): each source once, in the API's order, leaving out the page See
 * details opens and the one the trust line already names. A source whose
 * address has no host to show is named by its own name.
 */
export function alsoListedOn(
  item: Pick<FoundItemDetail, "sources" | "seeDetailsUrl" | "check">,
): string[] {
  const skip = new Set(
    [
      hostOf(item.seeDetailsUrl) ?? "",
      item.check.sourceName?.trim().toLowerCase() ?? "",
    ].filter(Boolean),
  );
  const hosts: string[] = [];
  for (const source of item.sources) {
    const host = hostOf(source.url) || source.name.trim().toLowerCase();
    if (!host || skip.has(host) || hosts.includes(host)) continue;
    hosts.push(host);
  }
  return hosts;
}

/**
 * A found card's page, `/f/{id}` (yuvoy-app#179). Where a shared card link
 * lands, so it opens signed out and says everything the card says, and more.
 *
 * What it shows, all of it from the API and none of it derived: the
 * department's picture and name, a status other than scheduled, the title,
 * the trust line with the API's sentence about the check under it, when (and
 * that the end time is not listed), where, the price (and who sells the
 * tickets, when somebody does), the summary once a person has checked it,
 * who runs it, the other pages it is listed on, Report a problem, and See
 * details.
 *
 * ## The check sentence is the API's, verbatim
 *
 * `check.sentence`, and nothing when it is absent (R2-T4 note, 6.4). The
 * issue drafted two sentences for the web to compose; the API now writes one
 * for every tier, lapsed included, so composing them here would be a second
 * author for the same claim, and the one that drifts.
 *
 * ## What it leaves out
 *
 * No Ask Trigo button: not on the web in R2. No Share yet: `ShareLink`
 * counts `shared` as an experience, and an event counted under the wrong
 * subject is worse than one not counted.
 *
 * Its arrival counts as `opened` on `found_detail`, once a mount for each
 * card shown, after consent like every outcome.
 */
export function FoundItemPage({
  item,
  signedIn,
}: {
  item: FoundItemDetail;
  signedIn: boolean;
}) {
  const titleId = useId();
  const [reporting, setReporting] = useState(false);
  const vocabulary = useVocabulary();

  // Opened, once a mount for each card, and once under React's double run.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (opened.current === item.id) return;
    opened.current = item.id;
    recordFound("opened", item.id, "found_detail");
  }, [item.id]);

  /*
    The department's name from the vocabulary answer, never a list of our own
    (R2-T4 note, 6.9). While it loads, or when it failed, the picture stands
    alone.
  */
  const department = item.department
    ? (vocabulary.data?.categories.find((c) => c.key === item.department)
        ?.label ?? null)
    : null;
  const ended = item.status === "ended";
  // The ended banner says it in a sentence; a tag beside it would say it twice.
  const tag = ended ? null : foundWords.statusTag(item.status);
  const others = alsoListedOn(item);

  return (
    <article aria-labelledby={titleId} className="flex flex-col">
      {ended ? (
        <p
          role="status"
          className="rounded-card bg-paper-deep text-forest/75 mb-4 flex items-center gap-2 px-4 py-3 text-sm"
          data-testid="found-ended"
        >
          <ClockIcon className="size-4.5" />
          {FOUND_PAGE_WORDS.ended}
        </p>
      ) : null}

      <div
        aria-hidden="true"
        className="rounded-card relative h-40 overflow-hidden"
      >
        <DepartmentArt department={item.department} />
      </div>

      {department || tag ? (
        <div className="mt-5 flex items-center justify-between gap-3">
          {department ? (
            <p className="label text-forest/75" data-testid="found-department">
              {department}
            </p>
          ) : (
            <span />
          )}
          {tag ? (
            <span
              className="border-forest/25 rounded-full border px-2.5 py-0.5 text-xs font-bold"
              data-testid="found-status"
            >
              {tag}
            </span>
          ) : null}
        </div>
      ) : null}

      <h1
        id={titleId}
        className="font-display tracking-display leading-display mt-2 text-3xl text-balance"
      >
        {item.title}
      </h1>

      <div className="mt-4">
        <TrustLine check={item.check} />
        {item.check.sentence ? (
          <p
            className="text-forest/75 mt-1.5 text-sm text-pretty"
            data-testid="found-sentence"
          >
            {item.check.sentence}
          </p>
        ) : null}
      </div>

      <dl className="border-paper-line divide-paper-line mt-6 flex flex-col divide-y border-y">
        <Fact
          icon={<CalendarIcon />}
          label={FOUND_PAGE_WORDS.when}
          value={foundWords.whenLine(item, item.place.timezone)}
          sub={endTimeMissing(item) ? FOUND_PAGE_WORDS.noEndTime : null}
          testId="found-when"
        />
        <Fact
          icon={<MapPinIcon />}
          label={FOUND_PAGE_WORDS.where}
          value={foundWords.whereLine(item)}
          testId="found-where"
        />
        <Fact
          icon={<TicketIcon />}
          label={FOUND_PAGE_WORDS.price}
          value={item.price.text}
          sub={item.price.kind === "paid" ? FOUND_PAGE_WORDS.soldBy : null}
          testId="found-price"
        />
      </dl>

      {item.summary ? (
        <p className="text-body mt-6 text-pretty" data-testid="found-summary">
          {item.summary}
        </p>
      ) : null}

      {item.organiser ? (
        <section className="mt-6">
          <h2 className="font-bold">{FOUND_PAGE_WORDS.whoRunsIt}</h2>
          <p className="mt-1" data-testid="found-organiser">
            {item.organiser}
          </p>
        </section>
      ) : null}

      {others.length > 0 ? (
        <p
          className="text-forest/70 mt-6 text-sm text-pretty"
          data-testid="found-also"
        >
          {FOUND_PAGE_WORDS.alsoListed(others)}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setReporting(true)}
        className="border-paper-line hover:bg-forest/5 ease-interaction tap-target mt-6 flex items-center gap-3 border-y py-3 text-left transition-colors duration-200"
      >
        <span className="flex-1">{FOUND_PAGE_WORDS.report}</span>
        <ChevronRightIcon className="text-forest/40 size-4.5" />
      </button>

      <div className="mt-6">
        <SeeDetails item={item} surface="found_detail" />
      </div>

      {/*
        The card leaves this device's lists when the report says so, and the
        sheet does that itself. The page stays where it is: a person who
        followed a link here may still want to read what they reported, and
        the receipt is what tells them what happens next.
      */}
      <ReportSheet
        itemId={item.id}
        open={reporting}
        onOpenChange={setReporting}
        signedIn={signedIn}
        onHidden={() => {}}
      />
    </article>
  );
}

/** One row of when, where and the price. */
function Fact({
  icon,
  label,
  value,
  sub,
  testId,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
  sub?: string | null;
  testId: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3.5" data-testid={testId}>
      <span className="text-forest/70 mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="label text-forest/70">{label}</dt>
        <dd className="mt-0.5">{value}</dd>
        {sub ? <dd className="text-forest/70 mt-0.5 text-sm">{sub}</dd> : null}
      </div>
    </div>
  );
}

/**
 * The card could not be read: a 503, a 429 or no answer in time. Not the
 * not-found page, which would say the card is gone when it is only out of
 * reach for a moment. Try again renders the page again on the server.
 */
export function FoundItemUnavailable() {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  return (
    <ErrorState
      error={null}
      retrying={retrying}
      onRetry={() => startRetry(() => router.refresh())}
    />
  );
}
