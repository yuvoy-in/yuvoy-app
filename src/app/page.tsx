import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { pageMetadata } from "@/lib/site/metadata";
import { Feed } from "@/components/feed/feed";
import { FoundFeed } from "@/components/found/found-feed";
import { PlaceButton, RememberPlace } from "@/components/place/place-button";
import { gatedRoute } from "@/components/auth/gated-route";
import { firstReelsPage } from "@/lib/feed/first-page";
import { firstFoundPage } from "@/lib/found/first-page";
import { readSessionCookie } from "@/lib/auth/session-cookie";
import { preconnectApi } from "@/lib/site/preconnect";
import { feedHeading, type PlaceList } from "@/lib/site/places";
import { myPlaces } from "@/lib/site/my-places";
import { nearYou } from "@/lib/site/near-you";
import {
  PLACE_COOKIE,
  categoryParam,
  choiceFrom,
  goneAfterAnswer,
  hasDiscoverPlace,
  type PlaceChoice,
} from "@/lib/site/place-choice";

/**
 * T2 — the reels feed. The app's front door.
 *
 * Built on `GET /reels` — **every published reel**, not one per listing.
 * `/experiences` returns a single `heroMedia` per row, which capped the feed at
 * the number of listings rather than the amount of footage: two reels visible
 * against three published, with the third invisible since the day it went up
 * (yuvoy-app#18). `/experiences` is untouched and still right for a search or
 * a category listing; it simply is not the feed.
 *
 * The FIRST page is fetched on the SERVER and handed to the client as initial
 * data, so the first cards are in the HTML. It carries no cursor, which is
 * what makes it page one rather than an arbitrary page — everything after it
 * is fetched in the browser as the traveller scrolls (yuvoy-api#114).
 *
 * That is a performance decision with a measured reason. When the whole feed
 * was client-rendered, FCP was 0.8s and LCP was 5.1s on a throttled mid-range
 * profile — because the LCP element is a feed card's headline, and nothing
 * existed until the bundle downloaded, hydrated, started the mock worker and
 * resolved a query. The shell painting fast is worthless when the shell is
 * empty.
 *
 * Everything past the first page stays client-side: it is scroll-driven and
 * there is nothing for a crawler in it. That is also why the page is twelve
 * reels rather than sixty — this response is on the LCP path, and the 48 cards
 * a traveller has not scrolled to are ~48 KB of JSON in the HTML that buys
 * nothing. See `REELS_PAGE_SIZE`.
 */
/*
  Rendered per request, not statically generated.

  Two reasons, and the second is the one that decided it.

  The feed is the freshest surface in the product: it changes as operators put
  inventory on sale and as seats go. A page baked at build time and served for
  60 seconds is showing yesterday's catalogue to somebody standing on a jetty.

  And a build-time fetch is not reliable to begin with — Next generates static
  pages in worker processes that do not run `instrumentation.register()`, so
  the prefetch failed silently during `next build` and baked "Loading
  experiences" into the HTML. Discovering that in production, against a real
  API that happens to be reachable at build time, would have been worse: it
  would have worked until the one build where it did not.

  /e/[slug] stays static — that one IS the SEO asset and its content changes
  rarely.
*/
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  /*
    Just the name (owner's call, 6 Sep 2026). A tab shows roughly the first
    twenty characters, and the name-plus-tagline title spent all of them on a
    strapline the description below already carries — into the share card,
    where there is room for it, and out of the tab, where there is not. The
    tagline has since gone from the app altogether (yuvoy-app#36, 14 Sep).

    `absoluteTitle` is kept but is a no-op here, and that is worth writing down
    rather than leaving as a trap: Next applies a layout's `title.template` to
    CHILD segments only, and `app/page.tsx` shares a segment with
    `app/layout.tsx`, so the root page takes `title.default` and never the
    template. Verified by rendering it both ways — both give "Yuvoy". It stays
    because it costs nothing and states the intent for anyone moving this.
  */
  title: "Yuvoy",
  description:
    "Find something worth doing, and book a seat on it. Real departures, filmed by the operators who run them.",
  path: "/",
  absoluteTitle: true,
});

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const raw = query.__scenario;
  const scenario = typeof raw === "string" ? raw : undefined;

  /*
    Behind the invite gate when it is on (yuvoy-api#195). The first page is
    fetched INSIDE the content, so it is only asked for when the feed is going
    to be shown: a crawler and a signed-out visitor get the invite landing,
    and the API is not asked for reels nobody will see. With the switch off
    this is exactly the feed it always was.
  */
  return gatedRoute({
    purpose: "browse",
    searchParams,
    content: async () => {
      // The cards read their listings from the browser once they are on screen.
      preconnectApi();

      /*
        WHICH PLACE (yuvoy-app#179, R2-T4): `?place=` when the caller's list
        has it, else the cookie `yv_place`, else the bookable market
        (`choiceFrom`). Reading the cookie costs nothing here: `/` is
        rendered per request already.

        With nothing chosen, which is every visitor while `explore` is off,
        the answer is the reels whatever the list says, so the first page of
        reels is asked for BESIDE the list, as it always was: the places add
        no wait to today's feed. With a place in the address or the cookie,
        the list decides first, and the reels are only asked for if they are
        what is shown.
      */
      const { remembered, visitor, token } = await requestParts();
      const param = query.place;
      const choosing = typeof param === "string" || remembered !== null;

      const reelsAhead = choosing
        ? null
        : firstReelsPage({ screen: "feed", scenario });
      const places = await myPlaces(token, scenario);
      const list = places.list;
      let choice = choiceFrom(list, param, remembered);

      // A found place is only ever chosen from a list that answered.
      if (choice.shown.kind === "found" && list) {
        const { market, destination } = choice.shown;
        const category = categoryParam(query.category);
        const first = await firstFoundPage({
          destinationKey: destination.key,
          category,
          token,
          headers: visitor ?? new Headers(),
          scenario,
        });
        if (first.kind !== "gone") {
          return (
            <>
              <Remember choice={choice} list={list} />
              <FoundFeed
                /*
                  The place as the first page names it; when that page
                  failed, as the list does, which says the same things.
                */
                place={
                  first.kind === "ok"
                    ? first.page.place
                    : {
                        key: destination.key,
                        name: destination.name,
                        regionName: market.name,
                        kind: destination.kind,
                        timezone: market.timezone,
                      }
                }
                placeName={destination.name}
                firstPage={first.kind === "ok" ? first.page : null}
                category={category}
                signedIn={places.signedIn}
                trigger={
                  <PlaceButton
                    list={list}
                    current={{ key: destination.key, name: destination.name }}
                    signedIn={places.signedIn}
                    nearYou={nearYou(visitor, list)}
                  />
                }
              />
            </>
          );
        }
        // Answered 404: this caller may not see it now. The reels, said once.
        choice = goneAfterAnswer(list, choice, remembered);
      }

      const { page, fetchedAt } = await (reelsAhead ??
        firstReelsPage({ screen: "feed", scenario }));
      const market = choice.shown.market;
      return (
        <>
          <Remember choice={choice} list={list} />
          <Feed
            initialPage={page}
            initialFetchedAt={fetchedAt}
            heading={feedHeading(list)}
            trigger={
              /*
                Only when the list holds a place to find things in: with
                `explore` off it never does, and the masthead is today's.
              */
              market && list && hasDiscoverPlace(list) ? (
                <PlaceButton
                  list={list}
                  current={{ key: market.key, name: market.name }}
                  signedIn={places.signedIn}
                  nearYou={nearYou(visitor, list)}
                  tone="dark"
                />
              ) : undefined
            }
            gone={choice.gone}
          />
        </>
      );
    },
  });
}

/**
 * What `/` reads off the request for the place: the remembered key, the
 * headers (Near you, and the visitor's address for the API's limits) and the
 * session. Outside a request, as a unit test renders the page, there is no
 * cookie jar to read, and that is a visitor with nothing remembered.
 */
async function requestParts(): Promise<{
  remembered: string | null;
  visitor: Headers | undefined;
  token: string | null;
}> {
  try {
    const [jar, visitor, token] = await Promise.all([
      cookies(),
      headers(),
      readSessionCookie(),
    ]);
    return {
      remembered: jar.get(PLACE_COOKIE)?.value ?? null,
      visitor,
      token,
    };
  } catch {
    return { remembered: null, visitor: undefined, token: null };
  }
}

/**
 * The browser's half of the choice: keep the place a link opened, or forget
 * one that has gone. Nothing at all when there is nothing to do, so `/` with
 * no place chosen renders exactly the tree it always did.
 */
function Remember({
  choice,
  list,
}: {
  choice: PlaceChoice;
  list: PlaceList | null;
}) {
  if (!choice.cookie) return null;
  return (
    <RememberPlace
      write={choice.cookie === "write" ? choice.key : null}
      clear={choice.cookie === "clear"}
      list={list}
    />
  );
}
