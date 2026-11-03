import type { components } from "../src/lib/api/schema.gen";

/**
 * The date alerts and trip drafts the mock answers (yuvoy-app#220), from the
 * cases yuvoy-mobile#390 lists. `trigo-list-handlers.ts` says which scenario
 * gets which.
 */

type TrigoCard = components["schemas"]["TrigoCard"];
type TrigoDateAlert = components["schemas"]["TrigoDateAlert"];
type TrigoTripDraft = components["schemas"]["TrigoTripDraft"];

/** A listing that is still shown, opening `/e/try-dive-nemo-reef`. */
export const LISTED_CARD: TrigoCard = {
  cardId: "exp:try-dive-nemo-reef",
  kind: "experience",
  available: true,
  title: "Try dive at Nemo Reef",
  placeName: "Havelock",
  whenText: "Sat 14 Nov, 7:00",
  price: { amountMinor: 450000, currency: "INR" },
  priceText: "per person",
  checkLabel: "Havelock Divers",
  href: "/e/try-dive-nemo-reef",
};

/** A found event that is still shown, opening `/f/{uuid}`. */
export const FOUND_ID = "5e2a7c41-9b3d-4f60-8a1e-2c4d6f8b0a13";
export const FOUND_CARD: TrigoCard = {
  cardId: `item:${FOUND_ID}`,
  kind: "event",
  available: true,
  title: "Full moon beach clean",
  placeName: "Radhanagar Beach",
  whenText: "Sun 15 Nov, 17:30",
  price: null,
  priceText: "Free",
  checkLabel: "Found by Trigo · not checked yet",
  sourceName: "Andaman Sheekha",
  href: "https://example.com/never-followed",
};

/** A listing that is gone: "No longer listed", no link. */
export const GONE_CARD: TrigoCard = {
  cardId: "exp:sunset-sail-old",
  kind: "experience",
  available: false,
  title: "Sunset sail from Neil",
  placeName: "Neil Island",
  whenText: "Fri 13 Nov, 16:00",
  price: { amountMinor: 250000, currency: "INR" },
  priceText: "per person",
  checkLabel: "Neil Sailing",
  href: "/e/sunset-sail-old",
};

/** A found event the API kept with its title gone. */
export const UNTITLED_EVENT_CARD: TrigoCard = {
  cardId: "item:8c1f3a52-7d4e-4b9a-9e2f-1a3b5c7d9e04",
  kind: "event",
  available: true,
  title: "",
  checkLabel: "Found by Trigo · not checked yet",
  href: "https://example.com/never-followed",
};

/** A card id no page answers: it opens nothing. */
export const ODD_CARD: TrigoCard = {
  ...LISTED_CARD,
  cardId: "venue:ross-island",
  title: "Ross Island walk",
};

const LONG_TITLE =
  "A very long listing title that goes on past the width of a phone screen, " +
  "with a word like Supercalifragilisticexpialidocious that will not break";

export const WAITING_ALERT_ID = "1a2b3c4d-0001-4e5f-8a9b-0c1d2e3f4a01";
export const FIRED_ALERT_ID = "1a2b3c4d-0002-4e5f-8a9b-0c1d2e3f4a02";
export const GONE_ALERT_ID = "1a2b3c4d-0003-4e5f-8a9b-0c1d2e3f4a03";

/** One waiting and one fired, then one whose card is gone. */
export function defaultAlerts(): TrigoDateAlert[] {
  return [
    {
      id: WAITING_ALERT_ID,
      card: LISTED_CARD,
      createdAt: "2026-11-01T09:00:00Z",
      notifiedAt: null,
    },
    {
      id: FIRED_ALERT_ID,
      card: FOUND_CARD,
      createdAt: "2026-10-30T09:00:00Z",
      notifiedAt: "2026-11-02T06:00:00Z",
    },
    {
      id: GONE_ALERT_ID,
      card: GONE_CARD,
      createdAt: "2026-10-29T09:00:00Z",
      notifiedAt: null,
    },
  ];
}

function hex(n: number): string {
  return n.toString(16).padStart(12, "0");
}

/** 50 waiting, then 50 fired, in the API's order. */
export function manyAlerts(): TrigoDateAlert[] {
  const rows: TrigoDateAlert[] = [];
  for (let i = 0; i < 100; i++) {
    const waits = i < 50;
    rows.push({
      id: `2b3c4d5e-${String(i).padStart(4, "0")}-4e5f-8a9b-${hex(i)}`,
      card: {
        ...LISTED_CARD,
        title: i === 0 ? LONG_TITLE : `Alert ${i + 1}`,
      },
      createdAt: "2026-11-01T09:00:00Z",
      notifiedAt: waits ? null : "2026-11-02T06:00:00Z",
    });
  }
  return rows;
}

export const DRAFT_ID = "3c4d5e6f-0001-4f60-8a9b-0c1d2e3f4a11";
export const SECOND_DRAFT_ID = "3c4d5e6f-0002-4f60-8a9b-0c1d2e3f4a12";

/** A 3-day draft with a gone event card, and a second to stay after delete. */
export function defaultDrafts(): TrigoTripDraft[] {
  return [
    {
      id: DRAFT_ID,
      title: "Havelock long weekend",
      destinationKey: "andaman",
      dateFrom: "2026-11-14",
      dateTo: "2026-11-16",
      days: [
        { date: "2026-11-14", cards: [LISTED_CARD] },
        { date: "2026-11-15", cards: [GONE_CARD, UNTITLED_EVENT_CARD] },
        { date: "2026-11-16", cards: [] },
      ],
      createdAt: "2026-11-02T10:00:00Z",
    },
    {
      id: SECOND_DRAFT_ID,
      title: "Neil day trip",
      destinationKey: "andaman",
      dateFrom: "2026-11-20",
      dateTo: "2026-11-20",
      days: [{ date: "2026-11-20", cards: [FOUND_CARD, ODD_CARD] }],
      createdAt: "2026-11-01T10:00:00Z",
    },
  ];
}

/**
 * A 14-date draft with cards on 3 days, one of them 12 cards long, the same
 * card twice on it, and a long title.
 */
export function manyDrafts(): TrigoTripDraft[] {
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = `2026-12-${String(i + 1).padStart(2, "0")}`;
    if (i === 0) return { date, cards: [LISTED_CARD] };
    if (i === 6) {
      return {
        date,
        cards: Array.from({ length: 12 }, (_, n) =>
          n < 2 ? LISTED_CARD : { ...FOUND_CARD, title: `${LONG_TITLE} ${n}` },
        ),
      };
    }
    if (i === 13) return { date, cards: [GONE_CARD] };
    return { date, cards: [] };
  });
  return [
    {
      id: DRAFT_ID,
      title: LONG_TITLE,
      destinationKey: "andaman",
      dateFrom: "2026-12-01",
      dateTo: "2026-12-14",
      days,
      createdAt: "2026-11-02T10:00:00Z",
    },
  ];
}
