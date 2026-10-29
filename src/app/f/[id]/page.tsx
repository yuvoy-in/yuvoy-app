import { cache } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createApiClient, serverScenarioHeaders } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { readSessionCookie } from "@/lib/auth/session-cookie";
import { visitorAddressHeaders } from "@/lib/auth/upstream";
import { SITE_URL, pageMetadata } from "@/lib/site/metadata";
import { unpublishedRobotsMeta } from "@/lib/site/indexing";
import { breadcrumbJsonLd } from "@/lib/site/structured-data";
import { civilInZone } from "@/lib/format/date";
import { JsonLd } from "@/components/site/json-ld";
import { Screen } from "@/components/chrome/screen";
import {
  FoundItemPage,
  FoundItemUnavailable,
} from "@/components/found/found-item-page";
import type { components } from "@/lib/api/schema.gen";

type FoundItemDetail = components["schemas"]["FoundItemDetail"];

/**
 * A found card, by its own link: `/f/{id}` (yuvoy-app#179, R2-T4).
 *
 * The app's Share sends `https://app.yuvoy.in/f/{id}` (yuvoy-mobile#347), so
 * this is where a shared card lands, and it must open for somebody who has
 * never signed in. That is why it is NOT behind `gatedRoute`, like `/r/[id]`:
 * a link passed on in a message is read by whoever it was passed to.
 *
 * ## Signed in when there is a session, and never only then
 *
 * `GET /events/{id}` applies the feed's audience rule, so a staff session
 * sees a card a stranger cannot while `explore` is being tried. The token
 * goes when the cookie is there; without one the card is asked for with no
 * credential at all. A token the API refuses (an expired session) is not a
 * reason to show nothing: the card is asked for again as a stranger would.
 *
 * ## What each answer becomes
 *
 *   - 200 under the id asked for: the page.
 *   - 200 under another id: the card was merged into that one, and the
 *     address moves to it, so a shared link to the old id still lands.
 *   - 404: the existing not-found page. Held, hidden, malformed and not
 *     visible to this caller all answer the same, and the page must not tell
 *     them apart: it never says the card never existed (DECISIONS-LOG
 *     2026-10-18 20:05 Q11).
 *   - anything else (a 503, a 429, no answer in time): an error with Try
 *     again. Not a 404, which would tell a crawler the page is gone when the
 *     API had a bad minute.
 *
 * Rendered per request (`MUST_BE_DYNAMIC` in scripts/check-prerender.mjs):
 * the card's status and trust line change between deploys, and the session
 * decides what the API answers. No loading boundary above it, because it can
 * answer 404 (`src/app/loading.test.ts`).
 */
export const dynamic = "force-dynamic";

/**
 * How long the server waits for the card. The whole page is this one read,
 * so it waits longer than the feed's first page does (three seconds, where a
 * miss only costs LCP); past this it shows Try again rather than a blank tab.
 */
const ITEM_TIMEOUT_MS = 8_000;

type Read =
  | { kind: "ok"; item: FoundItemDetail; signedIn: boolean }
  | { kind: "gone" }
  | { kind: "error" };

/** The session token, or null outside a request and without a cookie. */
async function sessionToken(): Promise<string | null> {
  try {
    return await readSessionCookie();
  } catch {
    return null;
  }
}

/** The page request's headers, for the visitor's address; none outside one. */
async function visitorHeaders(): Promise<Headers | undefined> {
  try {
    return await headers();
  } catch {
    return undefined;
  }
}

async function getEvent(
  id: string,
  token: string | null,
  visitor: Headers | undefined,
  scenario: string | undefined,
): Promise<Read | { kind: "refused" }> {
  try {
    const api = createApiClient();
    const { data, error } = await api.GET("/events/{id}", {
      params: { path: { id } },
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        /*
          The visitor's own address, for the API's per-address read limit.
          Without it every signed-out reader of a shared link would share
          this server's budget.
        */
        ...visitorAddressHeaders(visitor),
        ...serverScenarioHeaders(scenario),
      },
      signal: AbortSignal.timeout(ITEM_TIMEOUT_MS),
    });
    if (error) throw error;
    if (!data) return { kind: "error" };
    return { kind: "ok", item: data, signedIn: token !== null };
  } catch (cause) {
    if (cause instanceof YuvoyError) {
      if (cause.status === 404) return { kind: "gone" };
      if (cause.status === 401) return { kind: "refused" };
    }
    // Logged: the page is a 200 with Try again, so the log is where the
    // cause can be seen.
    console.error(`[found] GET /events/${id} failed.`, cause);
    return { kind: "error" };
  }
}

// Read once per render though the metadata and the page both ask: a read
// with a deadline is not memoised by Next, so React's `cache` shares it.
const readItem = cache(
  async (id: string, scenario: string | undefined): Promise<Read> => {
    const [token, visitor] = await Promise.all([
      sessionToken(),
      visitorHeaders(),
    ]);
    const read = await getEvent(id, token, visitor, scenario);
    if (read.kind !== "refused") return read;
    // A session the API refused: the card as a stranger would see it.
    const again = await getEvent(id, null, visitor, scenario);
    return again.kind === "refused" ? { kind: "error" } : again;
  },
);

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { id } = await params;
  const read = await readItem(id, scenarioOf(await searchParams));

  // Neither the not-found page nor Try again is anything to index.
  if (read.kind === "gone") {
    return { title: "Not found", robots: unpublishedRobotsMeta };
  }
  if (read.kind === "error") {
    return { title: "Something went wrong", robots: unpublishedRobotsMeta };
  }
  const { item } = read;

  /*
    "{title}, {place} | Yuvoy", as R2-T4 writes it, so the layout's
    "%s · Yuvoy" template is not added on top. No price and no trust claim in
    the description: a share card travels further than the page and carries
    none of the words beside them. The summary is ours and only exists once a
    person has checked the card.
  */
  const title = `${item.title}, ${item.place.name} | Yuvoy`;
  return {
    ...pageMetadata({
      title,
      description: item.summary ?? `${item.title}, in ${item.place.name}.`,
      path: `/f/${item.id}`,
      absoluteTitle: true,
    }),
    /*
      Indexed only when the API says so: a checked, live card in a place open
      to everybody. Anything else is a public page whose content is not ready
      for a search engine, which is exactly `unpublishedRobotsMeta`'s case.
      An indexable card takes the site's own policy, which is still noindex
      until launch.
    */
    ...(item.indexable ? {} : { robots: unpublishedRobotsMeta }),
  };
}

export default async function FoundCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const scenario = scenarioOf(await searchParams);
  const read = await readItem(id, scenario);

  if (read.kind === "gone") notFound();
  if (read.kind === "error") {
    return (
      <Screen>
        <FoundItemUnavailable />
      </Screen>
    );
  }

  const { item, signedIn } = read;
  // Merged into another card: its link is the one that lasts.
  if (item.id !== id) redirect(survivorPath(item.id, scenario));

  const event = item.indexable ? foundEventJsonLd(item) : null;
  return (
    <Screen>
      {/* Both only on a card a person checked: a noindex card says nothing to a crawler. */}
      {event ? (
        <>
          <JsonLd
            node={breadcrumbJsonLd([
              { name: "Yuvoy", path: "/" },
              { name: item.title, path: `/f/${item.id}` },
            ])}
          />
          <JsonLd node={event} />
        </>
      ) : null}
      <FoundItemPage item={item} signedIn={signedIn} />
    </Screen>
  );
}

/**
 * The surviving card's address. A mocked build keeps its `?__scenario=`, so
 * the merged case can be followed to the end in a test.
 */
function survivorPath(id: string, scenario: string | undefined): string {
  const path = `/f/${encodeURIComponent(id)}`;
  if (process.env.NEXT_PUBLIC_API_MOCKING !== "enabled" || !scenario) {
    return path;
  }
  return `${path}?__scenario=${encodeURIComponent(scenario)}`;
}

/**
 * The card as a schema.org Event, for an indexable card only.
 *
 * Structured data is a claim even though nobody sees it (see
 * `lib/site/structured-data.ts`), so this says only what the API said: the
 * name, when, where, the status and who runs it. No `offers` and no price:
 * Yuvoy does not sell these tickets, and that file's rule stands.
 *
 * The times are the API's place-local fields, not instants (DECISIONS-LOG
 * 2026-10-18 20:05 Q7): `startDate` from `startsOn` and `startTime` with the
 * place's offset written on, `endDate` from `endsOn` alone, and an undated
 * card gets no Event at all, since an Event without a date is not one.
 */
function foundEventJsonLd(
  item: FoundItemDetail,
): Record<string, unknown> | null {
  const startDate = startDateOf(item);
  if (!startDate) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: item.title,
    startDate,
    ...(item.when.endsOn ? { endDate: item.when.endsOn } : {}),
    eventStatus: `https://schema.org/${EVENT_STATUS[item.status]}`,
    location: {
      "@type": "Place",
      name: item.where.placeText ?? item.where.town,
      address: {
        "@type": "PostalAddress",
        addressLocality: item.where.town,
        addressRegion: item.place.regionName,
      },
    },
    ...(item.organiser
      ? { organizer: { "@type": "Organization", name: item.organiser } }
      : {}),
    ...(item.summary ? { description: item.summary } : {}),
    url: `${SITE_URL}/f/${item.id}`,
    inLanguage: "en",
  };
}

/**
 * schema.org's names for the API's statuses. `moved` is a changed date or
 * place, which schema.org calls rescheduled; `sold_out` and `ended` are still
 * events that were scheduled, and schema.org has no status for either.
 */
const EVENT_STATUS: Record<FoundItemDetail["status"], string> = {
  scheduled: "EventScheduled",
  cancelled: "EventCancelled",
  postponed: "EventPostponed",
  moved: "EventRescheduled",
  sold_out: "EventScheduled",
  ended: "EventScheduled",
};

/** `2026-11-01T18:30:00+05:30`, or the bare date when no time is given. */
function startDateOf(item: FoundItemDetail): string | null {
  const { startsOn, startTime } = item.when;
  if (!startsOn || !/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) return null;
  if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) return startsOn;
  const offset = zoneOffset(startsOn, startTime, item.place.timezone);
  return offset ? `${startsOn}T${startTime}:00${offset}` : startsOn;
}

/**
 * The place's offset from UTC at that local date and time, as `+05:30`.
 *
 * Read from the zone rather than written down: every place open today is in
 * India, whose offset never changes, but the zone is the API's to send and a
 * constant here would be right only until it is not. The wall time is read
 * as if it were UTC, that instant is looked at in the zone, and the
 * difference is the offset. Null for a zone this runtime does not know, and
 * the date then goes without a time rather than with a wrong one.
 */
function zoneOffset(
  date: string,
  time: string,
  timeZone: string,
): string | null {
  const asUtc = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(asUtc)) return null;
  const there = civilInZone(new Date(asUtc).toISOString(), timeZone);
  if (!there) return null;
  const thereAsUtc = Date.UTC(
    there.year,
    there.month - 1,
    there.day,
    there.hour,
    there.minute,
  );
  const minutes = Math.round((thereAsUtc - asUtc) / 60_000);
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

/**
 * The page's own `?__scenario=`, honoured in a mocked build only. Read the
 * same way by the metadata and the page, so the two ask `readItem` the same
 * thing.
 */
function scenarioOf(
  query: Record<string, string | string[] | undefined>,
): string | undefined {
  const raw = query.__scenario;
  return typeof raw === "string" ? raw : undefined;
}
