/**
 * Moved word for word from fixtures.ts, which re-exports what other files
 * import: the operator page profile and the listing page detail.
 */
import type { components } from "@/lib/api/schema.gen";

import {
  DEPTHS,
  EXPERIENCES,
  OPERATORS,
  REELS,
  TOKEN,
} from "./fixtures-listings";

type Experience = components["schemas"]["Experience"];

/**
 * A photograph of an operation, as a placeholder — yuvoy-operator#41.
 *
 * Landscape, because these are the boat, the shop and the crew rather than a
 * reel. Built from the same four tokens as `poster`, so `palette.test.ts`
 * holds here too, and a `data:` URI for the same reasons: no network, no
 * rights question, and `next/image` draws it without the optimiser.
 */
const photo = (variant: number): string => {
  const waterline = Math.round(360 * DEPTHS[variant % DEPTHS.length]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
<rect width="480" height="360" fill="${TOKEN.forest}"/>
<rect y="${waterline}" width="480" height="${360 - waterline}" fill="${TOKEN.abyss}"/>
<line x1="0" y1="${waterline}" x2="480" y2="${waterline}" stroke="${TOKEN.paper}" stroke-opacity="0.18"/>
<rect x="${220 + variant * 16}" y="150" width="9" height="9" fill="${TOKEN.terra}"/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

type OperatorStory = Pick<
  components["schemas"]["OperatorProfile"],
  "about" | "operatingSince" | "languages" | "findThemAt" | "photos"
>;

/**
 * What each fixture business has told travellers about itself —
 * yuvoy-operator#41, drawn on the operator page (yuvoy-app#30).
 *
 * Three shapes, because the page has three to get right:
 *
 *   - `op_blue` has filled in everything.
 *   - `op_reef` has only the two facts Yuvoy reviews, and none of its own
 *     words — exactly what the one live operator looked like on 11 Sep 2026.
 *   - `op_new` has written nothing, so every field is ABSENT. Never `""` or
 *     `[]`: "every one of those fields is absent when empty".
 */
const STORIES: Record<string, OperatorStory> = {
  op_blue: {
    about:
      "Two boats and a crew of five, working out of Havelock since 2014.\n\nWe keep the groups small on purpose. If you are nervous in the water, say so when you book and we will go at your pace.",
    operatingSince: 2014,
    languages: ["English", "Hindi", "Bengali"],
    findThemAt: "Beach No. 3, Havelock (Swaraj Dweep)",
    photos: [photo(0), photo(1), photo(2)],
  },
  op_reef: {
    operatingSince: 2019,
    findThemAt: "The dive shop beside the jetty, Havelock (Swaraj Dweep)",
  },
};

/** Where each fixture business runs, which the API derives from its listings. */
const LOCATIONS: Record<string, string[]> = {
  op_reef: ["Havelock (Swaraj Dweep)"],
  // Two, so the page's separator is exercised.
  op_blue: ["Havelock (Swaraj Dweep)", "Neil (Shaheed Dweep)"],
  op_new: ["Neil (Shaheed Dweep)"],
};

/**
 * The operator page's profile — yuvoy-app#30, for any fixture business.
 *
 * Most tests use `sample-boat-operator`, the only fixture business that is
 * actually a BUSINESS: three listings and two clips, which is what makes "what
 * they run" a list and the bookable-false case reachable — the case the issue
 * is most explicit about. The other two answer too, because every card links
 * to its operator now (yuvoy-api#152) and a card that led to a 404 would be a
 * broken journey in the mock world.
 *
 * Derived from `EXPERIENCES` and `REELS` rather than written out beside them,
 * so the counts on this page cannot disagree with the feed the traveller just
 * came from.
 *
 * `credentialsSummary` is deliberately absent: `OperatorProfile` does not
 * carry it, and this page shows a verified tick rather than a list of claims.
 *
 * Throws for a slug no fixture has: that is a mistake in a test, not a state.
 * The handler checks `OPERATORS` first and answers 404, the way the API does.
 */
export function operatorProfileFor(slug: string) {
  const operator = OPERATORS.find((o) => o.slug === slug);
  if (!operator) {
    throw new Error(`No fixture operator has the slug "${slug}".`);
  }
  const listings = EXPERIENCES.filter((e) => e.operator.id === operator.id);
  const clips = REELS.filter((r) => r.experience.operator.id === operator.id);
  return {
    id: operator.id,
    slug: operator.slug,
    name: operator.name,
    verified: operator.verified,
    bookable: true,
    locations: LOCATIONS[operator.id],
    ...STORIES[operator.id],
    listingCount: listings.length,
    reelCount: clips.length,
    listings: listings.map((experience, i) => ({
      experience,
      /*
        The second one is off. "`bookable: false` on a listing card means show
        it and say it cannot be booked, not hide it" — somebody followed a link
        looking for a specific thing they saw, and an emptier page with no
        explanation is worse than a card marked "Not available right now".
      */
      bookable: i !== 1,
    })),
    reels: {
      items: clips,
      complete: true,
    },
  };
}

const MEETING: components["schemas"]["MeetingPoint"] = {
  text: "Jetty 2, Havelock",
  landmark: "The blue kiosk. Be there 15 minutes before departure.",
  lat: 11.9756,
  lng: 92.9862,
};

export const EXPERIENCE_DETAIL: Record<string, Experience> = Object.fromEntries(
  EXPERIENCES.map((e): [string, Experience] => [
    e.slug,
    {
      ...e,
      summary:
        e.bookingMode === "request"
          ? "The operator confirms this one by hand. Ask, and you will have an answer before you pay."
          : "Seats we hold directly. Book now and the place is yours.",
      description:
        "A placeholder description for development. Real copy is written by the operator and reviewed before it publishes.",
      gallery: e.heroMedia ? [e.heroMedia] : [],
      meetingPoint: MEETING,
      /*
        Required since migration 0053 — one eligibility predicate governs every
        sale. True here for every fixture; the false case is reachable through
        `?__scenario=not-bookable`, because a listing that answers 200 and
        cannot be bought is the state the whole flag exists to make visible.
      */
      bookable: true,
      /*
        Required by the contract since the 10 Oct 2026 pin (yuvoy-api#248).
        The phrase the live API answers while only the counter takes money,
        so every screen built on the mocks reads what production reads.
      */
      paymentLabel: "Pay at the counter on the day",
      included: ["Instructor", "All equipment", "Boat transfer"],
      requirements: ["Be able to swim", "No prior experience needed"],
      policyTier: "weather",
      cancellationPolicy:
        "Full refund if the sea calls it off, or move to another day at no cost.",
      /*
        THE LISTING'S OWN QUESTIONS - yuvoy-app#46.

        On the dive, which is where an operator really would ask them, and one
        of each `answerType` so all three controls are exercised by anything
        that opens this listing. The required one is a `yes_no`, which is the
        issue's own "how to tell it works": checking out without answering it
        must be refused, and answering it must book.

        Deliberately NOT on every listing. A checkout with no questions at all
        is the commoner path and has to keep rendering exactly as it did.

        These are never about health - that is `safety.screener` above, which
        is a different gate with a different refusal behind it.
      */
      ...(e.slug === "try-dive-nemo-reef"
        ? {
            questions: [
              {
                id: "q_cert_agency",
                text: "Which agency certified you?",
                answerType: "choice" as const,
                options: ["PADI", "SSI", "NAUI", "Not certified yet"],
                required: false,
              },
              {
                id: "q_dived_before",
                text: "Has everyone in your party dived before?",
                answerType: "yes_no" as const,
                required: true,
              },
              {
                id: "q_pickup",
                text: "Which hotel should we collect you from?",
                answerType: "short_text" as const,
                required: false,
              },
            ],
          }
        : {}),
      // Only the dive asks a health question. The others must render a booking
      // form with no screener at all, which is the more common path.
      ...(e.slug === "try-dive-nemo-reef"
        ? {
            safety: {
              minAge: 12,
              screener: {
                key: "diving_rstc",
                version: 3,
                questions: [
                  "Any heart or circulatory condition?",
                  "Any lung or breathing condition?",
                  "Any recent ear or sinus surgery?",
                ],
                affirmation:
                  "I confirm that nobody in my party has any of the conditions listed above.",
              },
            },
          }
        : {}),
      // A registration in date, so the listing page has its line
      // (yuvoy-app#219). Every other listing sends none.
      ...(e.slug === "private-boat-charter"
        ? {
            compliance: {
              label: "Registered with A&N Tourism",
              validTo: "2027-06-30",
            },
          }
        : {}),
    },
  ]),
);
